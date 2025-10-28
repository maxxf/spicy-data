#!/bin/bash

echo "🔍 CORPORATE LOCATIONS REPORT - DETAILED DEBUG"
echo "================================================================================"
echo ""

# Get last 8 weeks
echo "📅 Calculating last 8 weeks..."
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

echo "Last 8 weeks:"
echo "$WEEKS" | nl
echo ""

# Get 16 corporate location IDs
CORP_LOCS=$(psql $DATABASE_URL -t -A -F'|' -c "
SELECT id, canonical_name
FROM locations
WHERE (store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%')
   OR (canonical_name ~ 'Broadway.*Tucson|Sahara.*Las Vegas|Silverado|Horizon.*Henderson|Stanford|Meadows.*Reno|Sierra St|Boulder.*Hwy|Craig.*Mitchell|Downtown.*Summerlin|Aliante|Maryland.*Pkwy|Plumb|Carson.*William|Los Altos|S Las Vegas')
ORDER BY canonical_name;
")

echo "📍 16 Corporate Locations Found:"
echo "$CORP_LOCS" | nl
echo ""

# Build location IDs list for query
LOC_IDS=$(echo "$CORP_LOCS" | cut -d'|' -f1 | tr '\n' ',' | sed 's/,$//')

echo "================================================================================"
echo "WEEK-BY-WEEK ANALYSIS"
echo "================================================================================"

WEEK_NUM=0
echo "$WEEKS" | while IFS='|' read -r WEEK_START WEEK_END; do
  WEEK_NUM=$((WEEK_NUM + 1))
  
  echo ""
  echo "📊 WEEK $WEEK_NUM: $WEEK_START to $WEEK_END"
  echo "--------------------------------------------------------------------------------"
  
  # Get aggregated totals from database
  echo ""
  echo "RAW DATABASE TOTALS (All 16 locations combined):"
  
  psql $DATABASE_URL -t -A -F'|' -c "
  WITH corp_locs AS (
    SELECT id FROM locations
    WHERE (store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%')
       OR (canonical_name ~ 'Broadway.*Tucson|Sahara.*Las Vegas|Silverado|Horizon.*Henderson|Stanford|Meadows.*Reno|Sierra St|Boulder.*Hwy|Craig.*Mitchell|Downtown.*Summerlin|Aliante|Maryland.*Pkwy|Plumb|Carson.*William|Los Altos|S Las Vegas')
  )
  SELECT 
    'Uber Eats' as platform,
    COUNT(*) as orders,
    ROUND(SUM(COALESCE(sales_excl_tax, subtotal, 0))::numeric, 2) as sales,
    ROUND(SUM(COALESCE(net_payout, 0))::numeric, 2) as payout,
    ROUND(SUM(
      CASE 
        WHEN (offers_on_items < 0 OR delivery_offer_redemptions < 0 OR (other_payments > 0 AND other_payments_description LIKE '%ad%'))
        THEN COALESCE(sales_excl_tax, subtotal, 0)
        ELSE 0
      END
    )::numeric, 2) as marketing_sales,
    ROUND(SUM(
      ABS(COALESCE(offers_on_items, 0)) + 
      ABS(COALESCE(delivery_offer_redemptions, 0)) +
      ABS(COALESCE(offer_redemption_fee, 0)) +
      CASE WHEN other_payments > 0 AND other_payments_description LIKE '%ad%' THEN other_payments ELSE 0 END
    )::numeric, 2) as marketing_spend
  FROM uber_eats_transactions ue
  JOIN corp_locs cl ON ue.location_id = cl.id
  WHERE TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') >= '$WEEK_START'
    AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') <= '$WEEK_END'
    AND order_status = 'Completed'
  
  UNION ALL
  
  SELECT 
    'DoorDash',
    COUNT(*),
    ROUND(SUM(COALESCE(sales_excl_tax, order_subtotal, 0))::numeric, 2),
    ROUND(SUM(COALESCE(total_payout, net_payment, 0))::numeric, 2),
    ROUND(SUM(
      CASE 
        WHEN (ABS(COALESCE(other_payments, 0)) > 0 OR ABS(COALESCE(offers_on_items, 0)) > 0 OR ABS(COALESCE(delivery_offer_redemptions, 0)) > 0)
        THEN COALESCE(sales_excl_tax, order_subtotal, 0)
        ELSE 0
      END
    )::numeric, 2),
    ROUND(SUM(
      CASE WHEN other_payments > 0 THEN other_payments ELSE 0 END +
      ABS(COALESCE(offers_on_items, 0)) + 
      ABS(COALESCE(delivery_offer_redemptions, 0)) +
      COALESCE(marketing_credits, 0) +
      COALESCE(third_party_contribution, 0)
    )::numeric, 2)
  FROM doordash_transactions dd
  JOIN corp_locs cl ON dd.location_id = cl.id
  WHERE CAST(transaction_date AS DATE) >= '$WEEK_START'
    AND CAST(transaction_date AS DATE) <= '$WEEK_END'
    AND (channel = 'Marketplace' OR channel IS NULL)
    AND (transaction_type = 'Order' OR transaction_type IS NULL OR transaction_type = '')
  
  UNION ALL
  
  SELECT 
    'Grubhub',
    COUNT(*),
    ROUND(SUM(COALESCE(sale_amount, 0))::numeric, 2),
    ROUND(SUM(COALESCE(merchant_net_total, 0))::numeric, 2),
    ROUND(SUM(
      CASE WHEN merchant_funded_promotion != 0 THEN sale_amount ELSE 0 END
    )::numeric, 2),
    ROUND(SUM(ABS(COALESCE(merchant_funded_promotion, 0)))::numeric, 2)
  FROM grubhub_transactions gh
  JOIN corp_locs cl ON gh.location_id = cl.id
  WHERE order_date >= '$WEEK_START'
    AND order_date <= '$WEEK_END'
    AND transaction_type = 'Prepaid Order';
  " | while IFS='|' read -r platform orders sales payout mkt_sales mkt_spend; do
    printf "  %-12s: %5s orders | Sales: \$%-12s | Payout: \$%-12s | Mkt Sales: \$%-12s | Mkt Spend: \$%-10s\n" \
      "$platform" "$orders" "$sales" "$payout" "$mkt_sales" "$mkt_spend"
  done
  
  # Calculate grand totals
  echo ""
  echo "GRAND TOTALS:"
  psql $DATABASE_URL -t -A -F'|' -c "
  WITH corp_locs AS (
    SELECT id FROM locations
    WHERE (store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%')
       OR (canonical_name ~ 'Broadway.*Tucson|Sahara.*Las Vegas|Silverado|Horizon.*Henderson|Stanford|Meadows.*Reno|Sierra St|Boulder.*Hwy|Craig.*Mitchell|Downtown.*Summerlin|Aliante|Maryland.*Pkwy|Plumb|Carson.*William|Los Altos|S Las Vegas')
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
    u.orders + d.orders + g.orders as total_orders,
    ROUND((u.sales + d.sales + g.sales)::numeric, 2) as total_sales,
    ROUND((u.payout + d.payout + g.payout)::numeric, 2) as total_payout,
    ROUND((u.mkt_sales + d.mkt_sales + g.mkt_sales)::numeric, 2) as total_mkt_sales,
    ROUND((u.mkt_spend + d.mkt_spend + g.mkt_spend)::numeric, 2) as total_mkt_spend,
    ROUND(((u.payout + d.payout + g.payout) / NULLIF(u.sales + d.sales + g.sales, 0) * 100)::numeric, 1) as payout_pct,
    ROUND(((u.mkt_sales + d.mkt_sales + g.mkt_sales) / NULLIF(u.mkt_spend + d.mkt_spend + g.mkt_spend, 0))::numeric, 2) as roas
  FROM uber u, door d, grub g;
  " | while IFS='|' read -r orders sales payout mkt_sales mkt_spend payout_pct roas; do
    echo "  Total Orders:       $orders"
    echo "  Total Sales:        \$$sales"
    echo "  Total Payout:       \$$payout ($payout_pct%)"
    echo "  Marketing Sales:    \$$mkt_sales"
    echo "  Marketing Spend:    \$$mkt_spend"
    echo "  ROAS:               ${roas}x"
  done
  
  echo ""
  echo "--------------------------------------------------------------------------------"
done

echo ""
echo "================================================================================"
echo "🏁 Debug complete - Compare these numbers to your platform reports"
echo "================================================================================"
