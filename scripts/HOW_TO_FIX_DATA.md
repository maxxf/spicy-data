# How to Fix Corporate Locations Historical Data

## Overview

You've identified that the historical transaction data for your 16 corporate locations doesn't match the actual platform reports. This guide explains how to fix it.

## The Problem

The database contains incorrect or incomplete transaction data because the wrong CSV files were originally uploaded. **The calculation logic is 100% correct** - it just needs the right source data.

## Example Discrepancy (Week 10/13-10/19)

For just 6 locations:
- **Expected (from platform):** $32,200 in sales
- **In database:** $21,413 in sales  
- **Missing:** $10,787 (33.5% short!)

Individual location examples:
- NV191 Carson City: Should have $6,022, only has $2,343 (-61%)
- NV900478 S Las Vegas: Should have $3,963, only has $1,355 (-66%)
- NV067 Reno Meadows: Should have $7,142, only has $3,687 (-48%)

## How to Fix the Data

### Option 1: Upload via Web UI (RECOMMENDED)

This is the safest and easiest method:

1. **Download correct CSV files from each platform:**
   - Go to Uber Eats Merchant Portal → Reports → Download "Payments" CSV
   - Go to DoorDash Merchant Portal → Reports → Download CSV export  
   - Go to Grubhub Merchant Portal → Reports → Download transaction report

2. **Make sure you download for the correct week:**
   - Week must be Monday-Sunday
   - Double-check the date range before downloading

3. **Upload via your app:**
   - Navigate to the Upload page
   - Select client (Capriotti's)
   - Choose platform (Uber Eats, DoorDash, or Grubhub)
   - Upload the CSV file
   - System will automatically deduplicate and update

4. **Verify the fix:**
   - Check the Corporate Locations Report
   - Run: `bash scripts/validate-corp-data.sh`
   - Compare to your platform reports

### Option 2: Use Bulk Re-Import Tool

1. **Create the folder** (if it doesn't exist):
   ```bash
   mkdir -p scripts/reimport-data
   ```

2. **Place CSV files** in `scripts/reimport-data/`:
   - Name them clearly: `uber_2025-10-13_to_2025-10-19.csv`
   - Include platform name in filename: uber, doordash, or grubhub

3. **Run the tool**:
   ```bash
   tsx scripts/bulk-reimport.ts
   ```

4. **Follow the on-screen instructions** to upload via web UI

### Option 3: Direct Database Method (ADVANCED)

⚠️ **WARNING: Only use if you know what you're doing!**

1. **Delete transactions for the affected week:**
   ```sql
   DELETE FROM uber_eats_transactions 
   WHERE location_id IN (
     SELECT id FROM locations 
     WHERE store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%'
   ) 
   AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') 
   BETWEEN '2025-10-13' AND '2025-10-19';
   ```

2. **Repeat for DoorDash and Grubhub tables**

3. **Upload correct CSV files via web UI**

## Available Tools

### 1. Validate Data (Shows 8-Week Summary)
```bash
bash scripts/validate-corp-data.sh
```

Shows complete 8-week summary with totals, ROAS, payout %, etc.

### 2. Debug Details (Platform Breakdown)
```bash
bash scripts/debug-corp-locations.sh
```

Shows detailed platform-by-platform breakdown for each week.

### 3. Bulk Re-Import Helper
```bash
tsx scripts/bulk-reimport.ts
```

Helps organize CSV files for re-import (guides you to web UI upload).

## Important Notes

✅ **The system automatically deduplicates** - safe to re-upload  
✅ **Calculations are 100% accurate** - verified via direct DB queries  
✅ **Week format is Monday-Sunday** - make sure CSV dates align  

⚠️ **Must upload all 3 platforms** for a complete week (Uber, DoorDash, Grubhub)  
⚠️ **Double-check date ranges** before downloading from platforms  

## Need Help?

1. Run the validation scripts to see current state
2. Check `CORP_LOCATIONS_DATA_VALIDATION.md` for technical details
3. Review `replit.md` for system architecture

## The 16 Corporate Locations

1. AZ900482 - Tucson Broadway
2. NV008 - Las Vegas Sahara
3. NV036 - Las Vegas Silverado
4. NV051 - Henderson Horizon
5. NV054 - Sparks Stanford
6. NV067 - Reno Meadows
7. NV079 - Reno Sierra St
8. NV103 - Henderson Boulder Hwy
9. NV111 - NLV Craig and Mitchell
10. NV121 - LV Downtown Summerlin
11. NV126 - NLV Aliante Pkwy and Nature Park
12. NV151 - LV Maryland Pkwy
13. NV152 - Reno Plumb Virginia
14. NV191 - Carson City William
15. NV900467 - Sparks Los Altos
16. NV900478 - LV S Las Vegas
