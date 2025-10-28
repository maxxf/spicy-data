# Production Deployment Checklist

## ✅ Pre-Deployment Verification

### Security
- [x] **Authentication Required**: All upload endpoints now require authentication
  - `/api/upload` - Protected with `isAuthenticated`
  - `/api/upload/marketing` - Protected with `isAuthenticated`
  - `/api/admin/import-data` - Protected with `isSuperAdmin`
- [x] **Role-Based Access Control**: Three-tier system (super_admin, brand_admin, user)
- [x] **Session Management**: Using Replit Auth (OIDC) with express-session
- [x] **Environment Secrets**: DATABASE_URL and SESSION_SECRET configured

### File Upload Architecture
- [x] **Memory-Based Processing**: Uses `multer.memoryStorage()` - NO disk storage required
- [x] **CSV Parsing**: All files parsed in-memory and stored in database
- [x] **Production Compatible**: No dependency on workspace file system
- [x] **Supported Formats**:
  - Uber Eats transaction CSVs
  - DoorDash transaction CSVs (Marketplace only - Storefront transactions automatically filtered out)
  - Grubhub transaction CSVs
  - Marketing data (promotions, paid ads, location metrics)

### Database
- [x] **Separate Dev/Prod Databases**: Replit auto-provisions both
- [x] **Schema Migrations**: Drizzle ORM with `npm run db:push`
- [x] **Production Migration System**: Built-in data import tool for production data
- [x] **Data Validation**: Zod schemas enforce data integrity
- [x] **Transaction Support**: Database transactions for data consistency

### Application Features
- [x] **Multi-Platform Support**: Uber Eats, DoorDash, Grubhub
- [x] **Location Matching**: Automated location reconciliation across platforms
- [x] **Analytics Engine**: ROAS, ROI, True CPO, marketing attribution
- [x] **Income Statement**: Comprehensive financial reporting
- [x] **Weekly Reports**: Performance trends and comparisons
- [x] **CSV Export**: All reports exportable

## 🚀 Deployment Process

### Step 1: Verify Development Environment
```bash
# Ensure all dependencies are installed
npm install

# Verify database schema is up to date
npm run db:push

# Test the application locally
npm run dev
```

### Step 2: Pre-Deployment Testing
1. **Login**: Verify Replit Auth works
2. **Upload Test**: Upload a small CSV file for each platform
3. **Dashboard**: Confirm data displays correctly
4. **Income Statement**: Verify financial calculations
5. **Export**: Test CSV export functionality

### Step 3: Publish to Production

1. **Click "Publish" in Replit**
   - Choose "Autoscale" or "Reserved VM" deployment
   - Configure machine power (recommended: 1 vCPU, 2GB RAM minimum)
   - Set max instances (Autoscale: 2-5 instances recommended)

2. **Environment Configuration**
   - Verify DATABASE_URL is set (auto-configured by Replit)
   - Verify SESSION_SECRET is set (auto-configured by Replit)
   - Port: Application binds to 0.0.0.0:5000 (correct for Replit)

3. **Database Sync**
   - Development schema changes automatically applied to production
   - Monitor deployment logs for any migration errors

4. **Initial Production Data**
   - Use `/api/admin/import-data` endpoint (super admin only)
   - Or manually upload via Admin Upload page after deployment

### Step 4: Post-Deployment Verification

#### Authentication Check
1. Navigate to production URL
2. Verify redirect to Replit Auth login
3. Login with authorized email
4. Confirm role assignment (super_admin, brand_admin, or user)

#### Upload Functionality Check
1. **Transaction Upload**:
   - Navigate to Upload page
   - Select client
   - Choose platform (Uber Eats, DoorDash, or Grubhub)
   - Upload test CSV
   - Verify success message and transaction count

2. **Marketing Upload**:
   - Navigate to Campaigns page
   - Click "Upload Marketing Data"
   - Select platform and data type
   - Upload test CSV
   - Verify campaigns/metrics created

3. **Admin Import** (Super Admin only):
   - Navigate to Admin page
   - Use "Import Production Data" feature
   - Upload migration JSON file
   - Verify checksum validation and import success

#### Analytics Verification
1. **Dashboard**: Check weekly trends, ROAS, sales data
2. **Income Statement**: Verify financial breakdown
3. **Locations**: Confirm location mapping accuracy
4. **Campaigns**: Check marketing analytics

## ⚠️ Known Production Considerations

### Database
- **Separate Databases**: Production has its own database, distinct from development
- **Data Migration**: Initial production data must be imported via migration system or manual uploads
- **Storage Limit**: 10 GiB per PostgreSQL database
- **Billing**: Charged for compute time (when active) + data storage

### Upload Handling
- **File Size**: No explicit limit set - rely on Replit platform limits
- **Processing Time**: Large CSVs (>10K rows) process in memory - may need timeout adjustments
- **Concurrent Uploads**: Limited by instance count (Autoscale: up to max instances)

### Authentication
- **Replit Auth**: Production uses same OIDC provider
- **User Management**: Admin must assign roles to new users via Admin page
- **Session Storage**: Uses PostgreSQL for session persistence

### Performance
- **First Request**: Cold start may take 5-10 seconds (Autoscale)
- **Scaling**: Autoscale provisions additional instances under load
- **Database**: Neon serverless auto-scales based on usage
- **Caching**: Consider adding React Query cache persistence for better UX

## 🔧 Troubleshooting

### Upload Fails with 401 Unauthorized
- **Cause**: User not authenticated or session expired
- **Solution**: Login again via Replit Auth

### Upload Fails with 400 Bad Request
- **Cause**: Missing required fields (platform, clientId, dataType)
- **Solution**: Ensure frontend sends all required parameters

### CSV Parsing Errors
- **Cause**: Unexpected CSV format or column names
- **Solution**: Check error message for specific column issues, update CSV format

### Location Mapping Issues
- **Cause**: Location names don't match master sheet
- **Solution**: Use Admin page to manually map locations or update master sheet

### Database Connection Errors
- **Cause**: DATABASE_URL not set or database not provisioned
- **Solution**: Verify database is created in Replit Database tool

### High Database Costs
- **Cause**: Excessive queries or long-running transactions
- **Solution**: Monitor usage in Replit Dashboard, optimize queries

## 📊 Monitoring Production

### Replit Dashboard
- **Overview**: Active instances, response times, error rates
- **Logs**: Real-time application logs, database queries
- **Resources**: CPU, memory, database usage
- **Billing**: Current period costs and usage alerts

### Database Monitoring
- **Compute Time**: Track active database hours
- **Storage**: Monitor data size growth
- **Connection Pool**: Watch for connection leaks

### Application Health
- **Weekly Upload Cadence**: Expect ~1-3 uploads per week per client
- **Transaction Volume**: Monitor for sudden drops (missing uploads)
- **Error Rates**: Track upload failures and location mapping issues

## 🎯 Success Metrics

### Upload Success Rate
- **Target**: >95% successful uploads
- **Measure**: Track via application logs and error rates

### Data Accuracy
- **Location Mapping**: >98% auto-matched locations
- **Transaction Processing**: 100% of valid rows processed
- **Financial Calculations**: Verified against platform reports

### User Satisfaction
- **Response Time**: <2s for dashboard load, <10s for upload processing
- **Uptime**: >99.5% availability
- **Data Freshness**: Weekly uploads completed within 24h of platform availability

## 📝 Deployment Log

| Date | Version | Changes | Deployed By | Status |
|------|---------|---------|-------------|--------|
| TBD | 1.0 | Initial production deployment | - | Pending |

---

**Last Updated**: October 28, 2025
**Document Owner**: Development Team
**Review Frequency**: After each major deployment
