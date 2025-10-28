#!/bin/bash

echo "🔍 LOCATION SALES DEBUG REPORT"
echo "================================================================================"
echo ""

# Get the three location IDs
echo "📍 Target Locations:"
psql $DATABASE_URL -t -c "
SELECT '  - ' || canonical_name || ' (ID: ' || id || ', Tag: ' || location_tag || ')'
FROM locations 
WHERE canonical_name IN (
  'Caps - NV067 Reno Meadows',
  'Caps - AZ900482 Tucson Broadway',
  'Caps - NV036 Las Vegas Silverado'
)
ORDER BY canonical_name;
"
echo ""

# Get the last 8 weeks
echo "📅 Getting available weeks..."
WEEKS=$(psql $DATABASE_URL -t -A -F'|' -c "
WITH all_dates AS (
  -- UberEats dates (M/D/YY format - convert to proper date)
  SELECT 
    TO_DATE(
      '20' || SPLIT_PART(date, '/', 3) || '-' || 
      LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || 
      LPAD(SPLIT_PART(date, '/', 2), 2, '0'),
      'YYYY-MM-DD'
    ) as order_date
  FROM uber_eats_transactions
  WHERE date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
  
  UNION ALL
  
  -- DoorDash dates
  SELECT CAST(transaction_date AS DATE) as order_date
  FROM doordash_transactions
  WHERE transaction_date IS NOT NULL
  
  UNION ALL
  
  -- Grubhub dates
  SELECT CAST(order_date AS DATE) as order_date
  FROM grubhub_transactions
  WHERE order_date IS NOT NULL
),
weeks AS (
  SELECT DISTINCT
    DATE_TRUNC('week', order_date)::date + 
      CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', order_date)) = 0 THEN 1 ELSE 0 END as week_start,
    (DATE_TRUNC('week', order_date)::date + 6 + 
      CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', order_date)) = 0 THEN 1 ELSE 0 END)::date as week_end
  FROM all_dates
  WHERE order_date IS NOT NULL
)
SELECT week_start || '|' || week_end
FROM weeks
ORDER BY week_start DESC
LIMIT 8;
")

echo "Analyzing Last 8 Weeks:"
WEEK_NUM=0
while IFS='|' read -r WEEK_START WEEK_END; do
  WEEK_NUM=$((WEEK_NUM + 1))
  echo "  $WEEK_NUM. $WEEK_START to $WEEK_END"
done <<< "$WEEKS"

echo ""
echo "================================================================================"
echo ""

# Process each week
WEEK_NUM=0
while IFS='|' read -r WEEK_START WEEK_END; do
  WEEK_NUM=$((WEEK_NUM + 1))
  
  echo ""
  echo "📊 WEEK $WEEK_NUM: $WEEK_START to $WEEK_END"
  echo "--------------------------------------------------------------------------------"
  echo ""
  
  # Get sales for each location
  for LOC_NAME in "Caps - NV067 Reno Meadows" "Caps - AZ900482 Tucson Broadway" "Caps - NV036 Las Vegas Silverado"; do
    echo "  Location: $LOC_NAME"
    
    # Get location ID
    LOC_ID=$(psql $DATABASE_URL -t -A -c "SELECT id FROM locations WHERE canonical_name = '$LOC_NAME';")
    
    # UberEats sales (using M/D/YY date format)
    UBER_RESULT=$(psql $DATABASE_URL -t -A -F'|' -c "
    WITH converted_dates AS (
      SELECT 
        *,
        TO_DATE(
          '20' || SPLIT_PART(date, '/', 3) || '-' || 
          LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || 
          LPAD(SPLIT_PART(date, '/', 2), 2, '0'),
          'YYYY-MM-DD'
        ) as proper_date
      FROM uber_eats_transactions
      WHERE location_id = '$LOC_ID'
        AND date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
    )
    SELECT 
      COUNT(CASE WHEN order_status = 'Completed' THEN 1 END),
      COALESCE(SUM(CASE WHEN order_status = 'Completed' THEN COALESCE(sales_excl_tax, subtotal, 0) END), 0)
    FROM converted_dates
    WHERE proper_date >= '$WEEK_START'
      AND proper_date <= '$WEEK_END';
    ")
    
    UBER_ORDERS=$(echo "$UBER_RESULT" | cut -d'|' -f1)
    UBER_SALES=$(echo "$UBER_RESULT" | cut -d'|' -f2)
    
    # DoorDash sales
    DD_RESULT=$(psql $DATABASE_URL -t -A -F'|' -c "
    SELECT 
      COUNT(*),
      COALESCE(SUM(COALESCE(sales_excl_tax, order_subtotal, 0)), 0)
    FROM doordash_transactions
    WHERE location_id = '$LOC_ID'
      AND CAST(transaction_date AS DATE) >= '$WEEK_START'
      AND CAST(transaction_date AS DATE) <= '$WEEK_END'
      AND (channel = 'Marketplace' OR channel IS NULL)
      AND (transaction_type = 'Order' OR transaction_type IS NULL OR transaction_type = '');
    ")
    
    DD_ORDERS=$(echo "$DD_RESULT" | cut -d'|' -f1)
    DD_SALES=$(echo "$DD_RESULT" | cut -d'|' -f2)
    
    # Grubhub sales
    GH_RESULT=$(psql $DATABASE_URL -t -A -F'|' -c "
    SELECT 
      COUNT(*),
      COALESCE(SUM(sale_amount), 0)
    FROM grubhub_transactions
    WHERE location_id = '$LOC_ID'
      AND order_date >= '$WEEK_START'
      AND order_date <= '$WEEK_END'
      AND transaction_type = 'Prepaid Order';
    ")
    
    GH_ORDERS=$(echo "$GH_RESULT" | cut -d'|' -f1)
    GH_SALES=$(echo "$GH_RESULT" | cut -d'|' -f2)
    
    # Calculate totals
    TOTAL_ORDERS=$((UBER_ORDERS + DD_ORDERS + GH_ORDERS))
    TOTAL_SALES=$(echo "$UBER_SALES + $DD_SALES + $GH_SALES" | bc)
    
    echo "    Uber Eats:  $UBER_ORDERS orders, \$$UBER_SALES"
    echo "    DoorDash:   $DD_ORDERS orders, \$$DD_SALES"
    echo "    Grubhub:    $GH_ORDERS orders, \$$GH_SALES"
    echo "    📈 TOTAL:   $TOTAL_ORDERS orders, \$$TOTAL_SALES"
    
    # Try to fetch from API
    API_RESPONSE=$(curl -s "http://localhost:5000/api/analytics/locations/consolidated?clientId=83506705-b408-4f0a-a9b0-e5b585db3b7d&weekStart=$WEEK_START&weekEnd=$WEEK_END" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
      API_SALES=$(echo "$API_RESPONSE" | node -e "
        try {
          const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
          const loc = data.find(d => d.canonicalName === '$LOC_NAME');
          if (loc) {
            console.log(loc.totalOrders + '|' + loc.totalSales);
          } else {
            console.log('NOT_FOUND');
          }
        } catch(e) {
          console.log('ERROR');
        }
      ")
      
      if [ "$API_SALES" != "NOT_FOUND" ] && [ "$API_SALES" != "ERROR" ]; then
        API_ORDERS=$(echo "$API_SALES" | cut -d'|' -f1)
        API_TOTAL=$(echo "$API_SALES" | cut -d'|' -f2)
        
        DIFF=$(echo "$API_TOTAL - $TOTAL_SALES" | bc | tr -d '-')
        PERCENT=$(echo "scale=1; ($DIFF / $TOTAL_SALES) * 100" | bc 2>/dev/null || echo "0")
        
        echo "    🌐 API:     $API_ORDERS orders, \$$API_TOTAL"
        
        if (( $(echo "$DIFF > 0.01" | bc -l) )); then
          echo "    ⚠️  DISCREPANCY: \$$DIFF ($PERCENT% difference)"
        else
          echo "    ✅ Match!"
        fi
      else
        echo "    ⚠️  Not found in API response"
      fi
    fi
    
    echo ""
  done
done <<< "$WEEKS"

echo "================================================================================"
echo "🏁 Debug complete"
