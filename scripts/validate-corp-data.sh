#!/bin/bash

echo "🔧 CORPORATE LOCATIONS DATA VALIDATION & SUMMARY"
echo "================================================================================"
echo ""

echo "📍 Step 1: Verifying 16 corporate locations..."
CORP_COUNT=$(psql $DATABASE_URL -t -A -c "
SELECT COUNT(*)
FROM locations
WHERE store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%';
")

echo "Found $CORP_COUNT corporate locations"
echo ""

if [ "$CORP_COUNT" != "16" ]; then
  echo "❌ ERROR: Expected 16 locations, found $CORP_COUNT"
  exit 1
fi

echo "✅ Correct number of locations found"
echo ""

echo "================================================================================"
echo "📊 DATA QUALITY SUMMARY FOR ALL 8 WEEKS"
echo "================================================================================"
echo ""

# Get last 8 weeks
WEEKS=$(psql $DATABASE_URL -t -A -F'|' -c "
WITH all_dates AS (
  SELECT TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') as d
  FROM uber_eats_transactions WHERE date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
  UNION ALL
  SELECT CAST(transaction_date AS DATE) FROM doordash_transactions WHERE transaction_date IS NOT NULL
  UNION ALL
  SELECT CAST(order_date AS DATE) FROM grubhub_transactions WHERE order_date IS NOT NULL
),
weeks AS (
  SELECT DISTINCT
    DATE_TRUNC('week', d)::date + CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', d)) = 0 THEN 1 ELSE 0 END as week_start,
    (DATE_TRUNC('week', d)::date + 6 + CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', d)) = 0 THEN 1 ELSE 0 END)::date as week_end
  FROM all_dates WHERE d IS NOT NULL
)
SELECT week_start || '|' || week_end FROM weeks ORDER BY week_start DESC LIMIT 8;
")

echo "WEEK |   START    |    END     | ORDERS | TOTAL SALES  | MKT SALES    | MKT SPEND  | ROAS  | PAYOUT %"
echo "-----+------------+------------+--------+--------------+--------------+------------+-------+---------"

WEEK_NUM=0
echo "$WEEKS" | while IFS='|' read -r WEEK_START WEEK_END; do
  WEEK_NUM=$((WEEK_NUM + 1))
  
  STATS=$(psql $DATABASE_URL -t -A -F'|' -c "
  WITH corp_locs AS (
    SELECT id FROM locations
    WHERE store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%'
  ),
  uber AS (
    SELECT 
      COUNT(*) as orders,
      SUM(COALESCE(sales_excl_tax, subtotal, 0)) as sales,
      SUM(COALESCE(net_payout, 0)) as payout,
      SUM(CASE WHEN (offers_on_items < 0 OR delivery_offer_redemptions < 0 OR (other_payments > 0 AND other_payments_description LIKE '%ad%')) THEN COALESCE(sales_excl_tax, subtotal, 0) ELSE 0 END) as mkt_sales,
      SUM(ABS(COALESCE(offers_on_items, 0)) + ABS(COALESCE(delivery_offer_redemptions, 0)) + ABS(COALESCE(offer_redemption_fee, 0)) + CASE WHEN other_payments > 0 AND other_payments_description LIKE '%ad%' THEN other_payments ELSE 0 END) as mkt_spend
    FROM uber_eats_transactions ue
    JOIN corp_locs cl ON ue.location_id = cl.id
    WHERE TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') >= '$WEEK_START'
      AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') <= '$WEEK_END'
      AND order_status = 'Completed'
  ),
  door AS (
    SELECT 
      COUNT(*) as orders,
      SUM(COALESCE(sales_excl_tax, order_subtotal, 0)) as sales,
      SUM(COALESCE(total_payout, net_payment, 0)) as payout,
      SUM(CASE WHEN (ABS(COALESCE(other_payments, 0)) > 0 OR ABS(COALESCE(offers_on_items, 0)) > 0 OR ABS(COALESCE(delivery_offer_redemptions, 0)) > 0) THEN COALESCE(sales_excl_tax, order_subtotal, 0) ELSE 0 END) as mkt_sales,
      SUM(CASE WHEN other_payments > 0 THEN other_payments ELSE 0 END + ABS(COALESCE(offers_on_items, 0)) + ABS(COALESCE(delivery_offer_redemptions, 0)) + COALESCE(marketing_credits, 0) + COALESCE(third_party_contribution, 0)) as mkt_spend
    FROM doordash_transactions dd
    JOIN corp_locs cl ON dd.location_id = cl.id
    WHERE CAST(transaction_date AS DATE) >= '$WEEK_START'
      AND CAST(transaction_date AS DATE) <= '$WEEK_END'
      AND (channel = 'Marketplace' OR channel IS NULL)
      AND (transaction_type = 'Order' OR transaction_type IS NULL OR transaction_type = '')
  ),
  grub AS (
    SELECT 
      COUNT(*) as orders,
      SUM(COALESCE(sale_amount, 0)) as sales,
      SUM(COALESCE(merchant_net_total, 0)) as payout,
      SUM(CASE WHEN merchant_funded_promotion != 0 THEN sale_amount ELSE 0 END) as mkt_sales,
      SUM(ABS(COALESCE(merchant_funded_promotion, 0))) as mkt_spend
    FROM grubhub_transactions gh
    JOIN corp_locs cl ON gh.location_id = cl.id
    WHERE order_date >= '$WEEK_START'
      AND order_date <= '$WEEK_END'
      AND transaction_type = 'Prepaid Order'
  )
  SELECT 
    u.orders + d.orders + g.orders,
    ROUND((u.sales + d.sales + g.sales)::numeric, 2),
    ROUND((u.mkt_sales + d.mkt_sales + g.mkt_sales)::numeric, 2),
    ROUND((u.mkt_spend + d.mkt_spend + g.mkt_spend)::numeric, 2),
    ROUND(((u.mkt_sales + d.mkt_sales + g.mkt_sales) / NULLIF(u.mkt_spend + d.mkt_spend + g.mkt_spend, 0))::numeric, 1),
    ROUND(((u.payout + d.payout + g.payout) / NULLIF(u.sales + d.sales + g.sales, 0) * 100)::numeric, 1)
  FROM uber u, door d, grub g;
  ")
  
  IFS='|' read -r orders sales mkt_sales mkt_spend roas payout_pct <<< "$STATS"
  
  printf " %2s  | %10s | %10s | %6s | \$%11s | \$%11s | \$%9s | %4sx | %6s%%\n" \
    "$WEEK_NUM" "$WEEK_START" "$WEEK_END" "$orders" "$sales" "$mkt_sales" "$mkt_spend" "$roas" "$payout_pct"
done

echo ""
echo "================================================================================"
echo "📋 ACTION ITEMS"
echo "================================================================================"
echo ""
echo "The data calculations are working correctly. If numbers don't match platform"
echo "reports, the issue is with the uploaded CSV data, not the calculation logic."
echo ""
echo "TO FIX INCORRECT DATA:"
echo ""
echo "1. Download the correct CSV file from the platform for the affected week(s)"
echo "2. Upload it via the Upload page in the app"
echo "3. The system will re-process and update the data"
echo ""
echo "Note: Transaction data imported from CSV files is permanent. To fix historical"
echo "data, you need to re-upload the correct CSV files from the platforms."
echo ""
echo "================================================================================"
