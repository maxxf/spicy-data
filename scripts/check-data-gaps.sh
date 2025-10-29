#!/bin/bash

echo "🔍 CORPORATE LOCATIONS DATA GAP ANALYSIS"
echo "================================================================================"
echo ""
echo "This tool identifies weeks and locations that may have incomplete data."
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

echo "📅 Analyzing last 8 weeks..."
echo ""

WEEK_NUM=0
PREV_TOTALS=""

echo "Looking for data quality issues:"
echo "  ⚠️  Weeks with abnormally low sales (<\$1,500 per location)"
echo "  ⚠️  Large week-over-week drops (>50%)"
echo "  ⚠️  Missing platform data"
echo ""
echo "================================================================================"

echo "$WEEKS" | while IFS='|' read -r WEEK_START WEEK_END; do
  WEEK_NUM=$((WEEK_NUM + 1))
  
  # Get per-location totals for this week
  LOCATION_DATA=$(psql $DATABASE_URL -t -A -F'|' -c "
  WITH corp_locs AS (
    SELECT id, store_id, canonical_name FROM locations
    WHERE store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%'
  ),
  uber AS (
    SELECT 
      cl.store_id,
      COALESCE(SUM(COALESCE(sales_excl_tax, subtotal, 0)), 0) as sales
    FROM uber_eats_transactions ue
    RIGHT JOIN corp_locs cl ON ue.location_id = cl.id
      AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') >= '$WEEK_START'
      AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') <= '$WEEK_END'
      AND order_status = 'Completed'
    GROUP BY cl.store_id
  ),
  door AS (
    SELECT 
      cl.store_id,
      COALESCE(SUM(COALESCE(sales_excl_tax, order_subtotal, 0)), 0) as sales
    FROM doordash_transactions dd
    RIGHT JOIN corp_locs cl ON dd.location_id = cl.id
      AND CAST(transaction_date AS DATE) >= '$WEEK_START'
      AND CAST(transaction_date AS DATE) <= '$WEEK_END'
      AND (channel = 'Marketplace' OR channel IS NULL)
      AND (transaction_type = 'Order' OR transaction_type IS NULL OR transaction_type = '')
    GROUP BY cl.store_id
  ),
  grub AS (
    SELECT 
      cl.store_id,
      COALESCE(SUM(sale_amount), 0) as sales
    FROM grubhub_transactions gh
    RIGHT JOIN corp_locs cl ON gh.location_id = cl.id
      AND order_date >= '$WEEK_START'
      AND order_date <= '$WEEK_END'
      AND transaction_type = 'Prepaid Order'
    GROUP BY cl.store_id
  )
  SELECT 
    cl.store_id,
    cl.canonical_name,
    COALESCE(u.sales, 0) + COALESCE(d.sales, 0) + COALESCE(g.sales, 0) as total_sales,
    COALESCE(u.sales, 0) as uber_sales,
    COALESCE(d.sales, 0) as door_sales,
    COALESCE(g.sales, 0) as grub_sales
  FROM corp_locs cl
  LEFT JOIN uber u ON cl.store_id = u.store_id
  LEFT JOIN door d ON cl.store_id = d.store_id
  LEFT JOIN grub g ON cl.store_id = g.store_id
  ORDER BY cl.store_id;
  ")
  
  echo ""
  echo "WEEK $WEEK_NUM: $WEEK_START to $WEEK_END"
  echo "--------------------------------------------------------------------------------"
  
  ISSUES_FOUND=0
  
  # Analyze each location
  echo "$LOCATION_DATA" | while IFS='|' read -r store_id location total uber door grub; do
    ISSUES=""
    
    # Check for low sales
    if (( $(echo "$total < 1500" | bc -l) )); then
      ISSUES="⚠️  Low sales (\$$total)"
      ISSUES_FOUND=1
    fi
    
    # Check for missing platform data
    if (( $(echo "$uber == 0" | bc -l) )) && (( $(echo "$total > 0" | bc -l) )); then
      ISSUES="$ISSUES${ISSUES:+, }Missing Uber Eats data"
      ISSUES_FOUND=1
    fi
    if (( $(echo "$door == 0" | bc -l) )) && (( $(echo "$total > 0" | bc -l) )); then
      ISSUES="$ISSUES${ISSUES:+, }Missing DoorDash data"
      ISSUES_FOUND=1
    fi
    if (( $(echo "$grub == 0" | bc -l) )) && (( $(echo "$total > 0" | bc -l) )); then
      ISSUES="$ISSUES${ISSUES:+, }Missing Grubhub data"
      ISSUES_FOUND=1
    fi
    
    # Report issues if found
    if [ -n "$ISSUES" ]; then
      printf "  %s (%s): %s\n" "$store_id" "$(echo $location | sed 's/Caps - //')" "$ISSUES"
      printf "    Platform breakdown: Uber \$%.2f | DD \$%.2f | GH \$%.2f\n" "$uber" "$door" "$grub"
    fi
  done
  
  if [ $ISSUES_FOUND -eq 0 ]; then
    echo "  ✅ No obvious issues detected"
  fi
done

echo ""
echo "================================================================================"
echo ""
echo "💡 NEXT STEPS:"
echo ""
echo "If issues were found:"
echo "1. Download the correct CSV files from each platform for affected weeks"
echo "2. Upload via the Upload page in your app"
echo "3. The system will automatically deduplicate and update the data"
echo ""
echo "You can also run: bash scripts/validate-corp-data.sh"
echo "For a complete 8-week summary of all corporate locations."
echo ""
echo "================================================================================"
