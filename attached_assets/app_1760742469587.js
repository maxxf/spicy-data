// Enhanced Spice Digital Multi-Client Delivery Dashboard App

class MultiClientDashboard {
    constructor() {
        this.selectedClient = 'all';
        this.selectedDateRange = 'thisWeek';
        this.charts = {};
        
        // Enhanced multi-client data structure
        this.data = {
            clients: [
                {
                    id: 1,
                    name: "Temaki To-Go",
                    type: "Sushi Restaurant",
                    locations: [
                        {id: 1, name: "West Hollywood", address: "8520 Santa Monica Blvd", market: "LA Metro"},
                        {id: 2, name: "Beverly Hills", address: "456 N Beverly Dr", market: "LA Metro"},
                        {id: 3, name: "Culver City", address: "9876 Washington Blvd", market: "LA Metro"}
                    ],
                    platforms: ["Uber Eats", "DoorDash", "Grubhub"],
                    commission_rates: {uber_eats: 0.30, doordash: 0.28, grubhub: 0.25}
                },
                {
                    id: 2,
                    name: "Bella's Pizza",
                    type: "Italian Restaurant", 
                    locations: [
                        {id: 4, name: "Santa Monica", address: "1234 Main St", market: "LA Metro"},
                        {id: 5, name: "Manhattan Beach", address: "567 Manhattan Beach Blvd", market: "LA Metro"}
                    ],
                    platforms: ["Uber Eats", "DoorDash"],
                    commission_rates: {uber_eats: 0.30, doordash: 0.28}
                },
                {
                    id: 3,
                    name: "Green Leaf Salads",
                    type: "Healthy Fast-Casual",
                    locations: [
                        {id: 6, name: "Brentwood", address: "11740 San Vicente Blvd", market: "LA Metro"}
                    ],
                    platforms: ["Uber Eats", "DoorDash", "Grubhub"],
                    commission_rates: {uber_eats: 0.30, doordash: 0.28, grubhub: 0.25}
                }
            ],
            performance_data: {
                current_week: {
                    client_1: {
                        total_sales: 45000,
                        orders: 1400,
                        marketing_spend: 3600,
                        marketing_roas: 4.2,
                        net_payout: 32850,
                        sales_from_marketing: 15120,
                        orders_from_marketing: 560,
                        platforms: {
                            uber_eats: {sales: 20000, orders: 620, marketing_spend: 1500},
                            doordash: {sales: 15000, orders: 480, marketing_spend: 1200},
                            grubhub: {sales: 10000, orders: 300, marketing_spend: 900}
                        },
                        locations: {
                            1: {sales: 18000, orders: 560, growth: 8.5},
                            2: {sales: 15000, orders: 480, growth: 12.3},
                            3: {sales: 12000, orders: 360, growth: 5.2}
                        }
                    },
                    client_2: {
                        total_sales: 28000,
                        orders: 850,
                        marketing_spend: 2240,
                        marketing_roas: 3.8,
                        net_payout: 20440,
                        sales_from_marketing: 8512,
                        orders_from_marketing: 298,
                        platforms: {
                            uber_eats: {sales: 16000, orders: 480, marketing_spend: 1200},
                            doordash: {sales: 12000, orders: 370, marketing_spend: 1040}
                        },
                        locations: {
                            4: {sales: 16000, orders: 480, growth: 15.2},
                            5: {sales: 12000, orders: 370, growth: 7.8}
                        }
                    },
                    client_3: {
                        total_sales: 18500,
                        orders: 580,
                        marketing_spend: 1480,
                        marketing_roas: 4.6,
                        net_payout: 13505,
                        sales_from_marketing: 6808,
                        orders_from_marketing: 232,
                        platforms: {
                            uber_eats: {sales: 8000, orders: 250, marketing_spend: 640},
                            doordash: {sales: 6500, orders: 200, marketing_spend: 520},
                            grubhub: {sales: 4000, orders: 130, marketing_spend: 320}
                        },
                        locations: {
                            6: {sales: 18500, orders: 580, growth: 22.1}
                        }
                    }
                },
                previous_week: {
                    client_1: {
                        total_sales: 42000,
                        orders: 1300,
                        marketing_spend: 3360,
                        marketing_roas: 4.0,
                        net_payout: 30660,
                        sales_from_marketing: 13440,
                        orders_from_marketing: 520
                    },
                    client_2: {
                        total_sales: 26500,
                        orders: 800,
                        marketing_spend: 2120,
                        marketing_roas: 3.6,
                        net_payout: 19340,
                        sales_from_marketing: 7632,
                        orders_from_marketing: 288
                    },
                    client_3: {
                        total_sales: 17200,
                        orders: 540,
                        marketing_spend: 1376,
                        marketing_roas: 4.3,
                        net_payout: 12556,
                        sales_from_marketing: 5917,
                        orders_from_marketing: 216
                    }
                }
            },
            marketing_campaigns: {
                promotions: [
                    {
                        id: 1, 
                        client_id: 1, 
                        client_name: "Temaki To-Go",
                        name: "Happy Hour 20% Off", 
                        platform: "Uber Eats", 
                        type: "Percentage", 
                        status: "Active",
                        orders: 120, 
                        revenue: 3600, 
                        cost: 720, 
                        new_customers: 45,
                        roi: 400
                    },
                    {
                        id: 2, 
                        client_id: 2, 
                        client_name: "Bella's Pizza",
                        name: "Free Delivery Weekend", 
                        platform: "DoorDash", 
                        type: "Free Delivery", 
                        status: "Completed",
                        orders: 80, 
                        revenue: 2400, 
                        cost: 240, 
                        new_customers: 32,
                        roi: 900
                    },
                    {
                        id: 3, 
                        client_id: 3, 
                        client_name: "Green Leaf Salads",
                        name: "BOGO Salad Tuesday", 
                        platform: "All Platforms", 
                        type: "BOGO", 
                        status: "Active",
                        orders: 65, 
                        revenue: 1950, 
                        cost: 975, 
                        new_customers: 28,
                        roi: 100
                    },
                    {
                        id: 4, 
                        client_id: 1, 
                        client_name: "Temaki To-Go",
                        name: "First Order $5 Off", 
                        platform: "Grubhub", 
                        type: "Fixed Amount", 
                        status: "Paused",
                        orders: 95, 
                        revenue: 2850, 
                        cost: 475, 
                        new_customers: 72,
                        roi: 500
                    }
                ],
                ads: [
                    {
                        id: 1, 
                        client_id: 1, 
                        client_name: "Temaki To-Go",
                        name: "Sponsored Listing - Lunch", 
                        platform: "Uber Eats", 
                        type: "Sponsored Listing",
                        impressions: 45000, 
                        clicks: 2250, 
                        ctr: 5.0, 
                        cpc: 0.80, 
                        orders: 90, 
                        conversion_rate: 4.0, 
                        spend: 1800, 
                        revenue: 2700, 
                        roas: 1.5, 
                        cpa: 20.00
                    },
                    {
                        id: 2, 
                        client_id: 2, 
                        client_name: "Bella's Pizza",
                        name: "Featured Restaurant", 
                        platform: "DoorDash", 
                        type: "Featured Restaurant",
                        impressions: 32000, 
                        clicks: 1280, 
                        ctr: 4.0, 
                        cpc: 0.75, 
                        orders: 64, 
                        conversion_rate: 5.0, 
                        spend: 960, 
                        revenue: 1920, 
                        roas: 2.0, 
                        cpa: 15.00
                    },
                    {
                        id: 3, 
                        client_id: 3, 
                        client_name: "Green Leaf Salads",
                        name: "Search Ads - Healthy", 
                        platform: "Grubhub", 
                        type: "Search Ads",
                        impressions: 25000, 
                        clicks: 1000, 
                        ctr: 4.0, 
                        cpc: 0.70, 
                        orders: 50, 
                        conversion_rate: 5.0, 
                        spend: 700, 
                        revenue: 1500, 
                        roas: 2.14, 
                        cpa: 14.00
                    },
                    {
                        id: 4, 
                        client_id: 1, 
                        client_name: "Temaki To-Go",
                        name: "Display Ads - Dinner", 
                        platform: "DoorDash", 
                        type: "Display",
                        impressions: 38000, 
                        clicks: 1520, 
                        ctr: 4.0, 
                        cpc: 0.85, 
                        orders: 76, 
                        conversion_rate: 5.0, 
                        spend: 1292, 
                        revenue: 2280, 
                        roas: 1.76, 
                        cpa: 17.00
                    }
                ]
            }
        };

        this.init();
    }

    init() {
        console.log('Initializing Multi-Client Dashboard...');
        this.setupEventListeners();
        this.updateDashboard();
        this.updateLastUpdated();
        this.showTab('home');
        console.log('Dashboard initialization complete');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                console.log(`Switching to tab: ${tabName}`);
                this.showTab(tabName);
            });
        });

        // Client selector
        const clientSelect = document.getElementById('clientSelect');
        if (clientSelect) {
            clientSelect.addEventListener('change', (e) => {
                console.log(`Client changed to: ${e.target.value}`);
                this.selectedClient = e.target.value;
                this.updateDashboard();
            });
            console.log('Client selector event listener added');
        } else {
            console.error('Client selector not found');
        }

        // Date range selector
        const dateRange = document.getElementById('dateRange');
        if (dateRange) {
            dateRange.addEventListener('change', (e) => {
                console.log(`Date range changed to: ${e.target.value}`);
                this.selectedDateRange = e.target.value;
                this.updateDashboard();
            });
            console.log('Date range selector event listener added');
        } else {
            console.error('Date range selector not found');
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Export button clicked');
                this.exportData();
            });
            console.log('Export button event listener added');
        } else {
            console.error('Export button not found');
        }

        // File uploads
        this.setupFileUploads();

        // Client management actions
        this.setupClientActions();
    }

    setupFileUploads() {
        console.log('Setting up file uploads...');
        const uploadZones = document.querySelectorAll('.upload-zone');
        console.log(`Found ${uploadZones.length} upload zones`);
        
        uploadZones.forEach((zone, index) => {
            const input = zone.querySelector('.file-input');
            const platform = zone.dataset.platform;
            console.log(`Setting up upload zone ${index + 1} for platform: ${platform}`);
            
            if (!input) {
                console.error(`No file input found for platform: ${platform}`);
                return;
            }

            // Click to browse
            zone.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Upload zone clicked for platform: ${platform}`);
                input.click();
            });
            
            // Drag and drop
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            
            zone.addEventListener('dragleave', () => {
                zone.classList.remove('dragover');
            });
            
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    console.log(`File dropped for platform: ${platform}`);
                    this.handleFileUpload(files[0], platform);
                }
            });
            
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    console.log(`File selected for platform: ${platform}`);
                    this.handleFileUpload(e.target.files[0], platform);
                }
            });
        });
        console.log('File upload setup complete');
    }

    setupClientActions() {
        console.log('Setting up client actions...');
        const clientCards = document.querySelectorAll('.client-card');
        
        clientCards.forEach(card => {
            const buttons = card.querySelectorAll('.btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const clientId = card.dataset.client;
                    const action = e.target.textContent.trim().toLowerCase();
                    console.log(`Client action: ${action} for client ${clientId}`);
                    
                    if (action === 'edit') {
                        this.editClient(clientId);
                    } else if (action === 'view report') {
                        this.viewClientReport(clientId);
                    }
                });
            });
        });
        console.log('Client actions setup complete');
    }

    showTab(tabName) {
        console.log(`Showing tab: ${tabName}`);
        
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Remove active class from all nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show selected tab
        const selectedTab = document.getElementById(`${tabName}-tab`);
        const selectedNavTab = document.querySelector(`[data-tab="${tabName}"]`);
        
        if (selectedTab) {
            selectedTab.classList.add('active');
        } else {
            console.error(`Tab content not found: ${tabName}-tab`);
        }
        
        if (selectedNavTab) {
            selectedNavTab.classList.add('active');
        } else {
            console.error(`Nav tab not found: ${tabName}`);
        }
        
        // Load tab-specific content
        this.loadTabContent(tabName);
    }

    loadTabContent(tabName) {
        console.log(`Loading content for tab: ${tabName}`);
        
        try {
            switch(tabName) {
                case 'home':
                    this.updateHomeMetrics();
                    this.createHomeCharts();
                    break;
                case 'marketing':
                    this.updateMarketingTables();
                    this.updateMarketingSummary();
                    break;
                case 'platform':
                    this.updatePlatformCards();
                    this.createPlatformCharts();
                    break;
                case 'location':
                    this.updateLocationTable();
                    this.createLocationCharts();
                    break;
                case 'upload':
                    // Upload tab is static
                    console.log('Upload tab loaded (static content)');
                    break;
                case 'clients':
                    // Client management is static for now
                    console.log('Client management tab loaded (static content)');
                    break;
                default:
                    console.warn(`Unknown tab: ${tabName}`);
            }
        } catch (error) {
            console.error(`Error loading content for tab ${tabName}:`, error);
        }
    }

    getFilteredData() {
        const currentData = this.data.performance_data.current_week;
        const previousData = this.data.performance_data.previous_week;
        
        if (this.selectedClient === 'all') {
            // Aggregate all clients
            const aggregated = {
                current: this.aggregateClientData(currentData),
                previous: this.aggregateClientData(previousData)
            };
            return aggregated;
        } else {
            // Return specific client data
            const clientKey = `client_${this.selectedClient}`;
            return {
                current: currentData[clientKey] || {},
                previous: previousData[clientKey] || {}
            };
        }
    }

    aggregateClientData(weekData) {
        const aggregated = {
            total_sales: 0,
            orders: 0,
            marketing_spend: 0,
            net_payout: 0,
            sales_from_marketing: 0,
            orders_from_marketing: 0,
            platforms: {
                uber_eats: {sales: 0, orders: 0, marketing_spend: 0},
                doordash: {sales: 0, orders: 0, marketing_spend: 0},
                grubhub: {sales: 0, orders: 0, marketing_spend: 0}
            }
        };

        Object.keys(weekData).forEach(clientKey => {
            const clientData = weekData[clientKey];
            aggregated.total_sales += clientData.total_sales || 0;
            aggregated.orders += clientData.orders || 0;
            aggregated.marketing_spend += clientData.marketing_spend || 0;
            aggregated.net_payout += clientData.net_payout || 0;
            aggregated.sales_from_marketing += clientData.sales_from_marketing || 0;
            aggregated.orders_from_marketing += clientData.orders_from_marketing || 0;

            // Aggregate platform data
            if (clientData.platforms) {
                Object.keys(clientData.platforms).forEach(platform => {
                    if (aggregated.platforms[platform]) {
                        aggregated.platforms[platform].sales += clientData.platforms[platform].sales || 0;
                        aggregated.platforms[platform].orders += clientData.platforms[platform].orders || 0;
                        aggregated.platforms[platform].marketing_spend += clientData.platforms[platform].marketing_spend || 0;
                    }
                });
            }
        });

        // Calculate ROAS
        aggregated.marketing_roas = aggregated.marketing_spend > 0 ? 
            aggregated.sales_from_marketing / aggregated.marketing_spend : 0;

        return aggregated;
    }

    updateDashboard() {
        console.log(`Updating dashboard for client: ${this.selectedClient}, period: ${this.selectedDateRange}`);
        try {
            this.updateHomeMetrics();
            this.updateOverviewCards();
            if (document.querySelector('.tab-content.active').id === 'home-tab') {
                this.createHomeCharts();
            }
            this.updateDataPoints();
            console.log('Dashboard update complete');
        } catch (error) {
            console.error('Error updating dashboard:', error);
        }
    }

    updateOverviewCards() {
        const data = this.getFilteredData();
        const current = data.current;
        const previous = data.previous;

        // Portfolio Sales
        const portfolioSalesEl = document.getElementById('portfolioSales');
        if (portfolioSalesEl) {
            portfolioSalesEl.textContent = this.formatCurrency(current.total_sales || 0);
        }
        
        if (previous.total_sales) {
            const change = ((current.total_sales - previous.total_sales) / previous.total_sales * 100);
            const changeEl = document.getElementById('portfolioSalesChange');
            if (changeEl) {
                changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs. previous period`;
            }
        }

        // Portfolio ROAS
        const portfolioROASEl = document.getElementById('portfolioROAS');
        if (portfolioROASEl) {
            portfolioROASEl.textContent = (current.marketing_roas || 0).toFixed(1) + 'x';
        }

        if (previous.marketing_roas) {
            const change = ((current.marketing_roas - previous.marketing_roas) / previous.marketing_roas * 100);
            const changeEl = document.getElementById('portfolioROASChange');
            if (changeEl) {
                changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs. previous`;
            }
        }

        // Net Payout Rate
        const netPayoutRate = current.total_sales > 0 ? 
            (current.net_payout / current.total_sales * 100) : 0;
        const netPayoutRateEl = document.getElementById('netPayoutRate');
        if (netPayoutRateEl) {
            netPayoutRateEl.textContent = netPayoutRate.toFixed(1) + '%';
        }
    }

    updateHomeMetrics() {
        const data = this.getFilteredData();
        const current = data.current;
        const previous = data.previous;

        if (!current) {
            console.warn('No current data available');
            return;
        }

        // Calculate derived metrics
        const aov = current.orders > 0 ? current.total_sales / current.orders : 0;
        const marketingSpendPercentage = current.total_sales > 0 ? 
            (current.marketing_spend / current.total_sales) * 100 : 0;
        const netPayoutPercentage = current.total_sales > 0 ? 
            (current.net_payout / current.total_sales) * 100 : 0;
        const salesFromMarketingPercentage = current.total_sales > 0 ? 
            (current.sales_from_marketing / current.total_sales) * 100 : 0;
        const ordersFromMarketingPercentage = current.orders > 0 ? 
            (current.orders_from_marketing / current.orders) * 100 : 0;

        // Update metric values
        this.updateMetric('totalSales', current.total_sales, previous.total_sales, true);
        this.updateMetric('salesFromMarketing', current.sales_from_marketing, previous.sales_from_marketing, true, `${salesFromMarketingPercentage.toFixed(1)}% of total sales`);
        this.updateMetric('totalOrders', current.orders, previous.orders);
        this.updateMetric('ordersFromMarketing', current.orders_from_marketing, previous.orders_from_marketing, false, `${ordersFromMarketingPercentage.toFixed(1)}% of total orders`);
        this.updateMetric('aov', aov, previous.orders > 0 ? previous.total_sales / previous.orders : null, true);
        this.updateMetric('marketingSpend', current.marketing_spend, previous.marketing_spend, true, `${marketingSpendPercentage.toFixed(1)}% of sales`);
        this.updateMetric('marketingROAS', current.marketing_roas, previous.marketing_roas, false, null, 'x');
        this.updateMetric('netPayout', current.net_payout, previous.net_payout, true, `${netPayoutPercentage.toFixed(1)}% of gross sales`);
    }

    updateMetric(id, currentValue, previousValue, isCurrency = false, customSubtext = null, suffix = '') {
        const valueElement = document.getElementById(id);
        const trendElement = document.getElementById(id + 'Trend');
        const changeElement = document.getElementById(id + 'Change');
        const subtextElement = document.getElementById(id + 'Percentage') || document.getElementById(id + 'Change');
        
        if (!valueElement) {
            console.warn(`Element not found: ${id}`);
            return;
        }
        
        // Format value
        let displayValue;
        if (isCurrency) {
            displayValue = this.formatCurrency(currentValue || 0);
        } else {
            displayValue = (currentValue || 0).toLocaleString() + suffix;
        }
        
        valueElement.textContent = displayValue;
        
        // Calculate and display trend
        if (previousValue && trendElement && previousValue > 0) {
            const change = ((currentValue - previousValue) / previousValue) * 100;
            const isPositive = change >= 0;
            
            trendElement.textContent = isPositive ? '↗' : '↘';
            trendElement.className = `trend-indicator ${isPositive ? 'positive' : 'negative'}`;
            
            if (changeElement) {
                changeElement.textContent = `${isPositive ? '+' : ''}${change.toFixed(1)}% vs. previous period`;
            }
        }
        
        // Update subtext
        if (customSubtext && subtextElement) {
            subtextElement.textContent = customSubtext;
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    createHomeCharts() {
        try {
            this.createClientMatrixChart();
            this.createSalesTrendChart();
            this.createPlatformMixChart();
        } catch (error) {
            console.error('Error creating home charts:', error);
        }
    }

    createClientMatrixChart() {
        const ctx = document.getElementById('clientMatrixChart');
        if (!ctx) {
            console.warn('Client matrix chart canvas not found');
            return;
        }
        
        if (this.charts.clientMatrix) {
            this.charts.clientMatrix.destroy();
        }

        const data = this.data.performance_data.current_week;
        const datasets = [];

        Object.keys(data).forEach((clientKey, index) => {
            const clientData = data[clientKey];
            const clientId = parseInt(clientKey.split('_')[1]);
            const client = this.data.clients.find(c => c.id === clientId);
            
            if (client) {
                datasets.push({
                    label: client.name,
                    data: [{
                        x: clientData.total_sales,
                        y: clientData.marketing_roas
                    }],
                    backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C'][index],
                    borderColor: ['#1FB8CD', '#FFC185', '#B4413C'][index],
                    pointRadius: 8,
                    pointHoverRadius: 10
                });
            }
        });

        this.charts.clientMatrix = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#f5f5f5' }
                    },
                    title: {
                        display: true,
                        text: 'Sales vs ROAS Performance',
                        color: '#f5f5f5'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Total Sales ($)',
                            color: '#a7a9a9'
                        },
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Marketing ROAS',
                            color: '#a7a9a9'
                        },
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return value.toFixed(1) + 'x';
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    createSalesTrendChart() {
        const ctx = document.getElementById('salesTrendChart');
        if (!ctx) {
            console.warn('Sales trend chart canvas not found');
            return;
        }
        
        if (this.charts.salesTrend) {
            this.charts.salesTrend.destroy();
        }

        // Sample weekly data for trend
        const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        const salesData = [89500, 85700, 88200, 91500]; // Portfolio totals

        this.charts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Portfolio Sales',
                    data: salesData,
                    borderColor: '#FF6B35',
                    backgroundColor: 'rgba(255, 107, 53, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f5f5f5' } }
                },
                scales: {
                    x: {
                        ticks: { color: '#a7a9a9' },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    createPlatformMixChart() {
        const ctx = document.getElementById('platformMixChart');
        if (!ctx) {
            console.warn('Platform mix chart canvas not found');
            return;
        }
        
        if (this.charts.platformMix) {
            this.charts.platformMix.destroy();
        }

        const data = this.getFilteredData();
        const platforms = data.current.platforms;

        this.charts.platformMix = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Uber Eats', 'DoorDash', 'Grubhub'],
                datasets: [{
                    data: [
                        platforms.uber_eats.sales,
                        platforms.doordash.sales,
                        platforms.grubhub?.sales || 0
                    ],
                    backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C'],
                    borderColor: '#2d2d2d',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#f5f5f5',
                            padding: 20
                        }
                    }
                }
            }
        });
    }

    updateMarketingSummary() {
        const promotions = this.getFilteredPromotions();
        const ads = this.getFilteredAds();

        // Promotions summary
        const totalPromotionCost = promotions.reduce((sum, p) => sum + p.cost, 0);
        const avgPromotionROI = promotions.length > 0 ? 
            promotions.reduce((sum, p) => sum + p.roi, 0) / promotions.length : 0;

        const totalPromotionCostEl = document.getElementById('totalPromotionCost');
        const totalPromotionROIEl = document.getElementById('totalPromotionROI');
        
        if (totalPromotionCostEl) {
            totalPromotionCostEl.textContent = this.formatCurrency(totalPromotionCost);
        }
        if (totalPromotionROIEl) {
            totalPromotionROIEl.textContent = avgPromotionROI.toFixed(1) + '%';
        }

        // Ads summary
        const totalAdSpend = ads.reduce((sum, a) => sum + a.spend, 0);
        const avgROAS = ads.length > 0 ? 
            ads.reduce((sum, a) => sum + a.roas, 0) / ads.length : 0;

        const totalAdSpendEl = document.getElementById('totalAdSpend');
        const averageROASEl = document.getElementById('averageROAS');
        
        if (totalAdSpendEl) {
            totalAdSpendEl.textContent = this.formatCurrency(totalAdSpend);
        }
        if (averageROASEl) {
            averageROASEl.textContent = avgROAS.toFixed(1) + 'x';
        }
    }

    getFilteredPromotions() {
        if (this.selectedClient === 'all') {
            return this.data.marketing_campaigns.promotions;
        } else {
            return this.data.marketing_campaigns.promotions.filter(p => 
                p.client_id == this.selectedClient
            );
        }
    }

    getFilteredAds() {
        if (this.selectedClient === 'all') {
            return this.data.marketing_campaigns.ads;
        } else {
            return this.data.marketing_campaigns.ads.filter(a => 
                a.client_id == this.selectedClient
            );
        }
    }

    updateMarketingTables() {
        this.updatePromotionsTable();
        this.updateAdsTable();
    }

    updatePromotionsTable() {
        const tbody = document.querySelector('#promotionsTable tbody');
        if (!tbody) {
            console.warn('Promotions table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        const promotions = this.getFilteredPromotions();
        
        promotions.forEach(promo => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${promo.name}</td>
                <td>${promo.client_name}</td>
                <td>${promo.platform}</td>
                <td>${promo.type}</td>
                <td><span class="status-badge ${promo.status.toLowerCase()}">${promo.status}</span></td>
                <td>${promo.orders.toLocaleString()}</td>
                <td>${this.formatCurrency(promo.revenue)}</td>
                <td>${this.formatCurrency(promo.cost)}</td>
                <td>${promo.new_customers}</td>
                <td class="${promo.roi > 200 ? 'text-success' : promo.roi > 0 ? '' : 'text-error'}">${promo.roi.toFixed(1)}%</td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn edit">Edit</button>
                        <button class="action-btn delete">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateAdsTable() {
        const tbody = document.querySelector('#adsTable tbody');
        if (!tbody) {
            console.warn('Ads table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        const ads = this.getFilteredAds();
        
        ads.forEach(ad => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${ad.name}</td>
                <td>${ad.client_name}</td>
                <td>${ad.platform}</td>
                <td>${ad.type}</td>
                <td>${ad.impressions.toLocaleString()}</td>
                <td>${ad.clicks.toLocaleString()}</td>
                <td>${ad.ctr.toFixed(1)}%</td>
                <td>$${ad.cpc.toFixed(2)}</td>
                <td>${ad.orders.toLocaleString()}</td>
                <td>${ad.conversion_rate.toFixed(1)}%</td>
                <td>${this.formatCurrency(ad.spend)}</td>
                <td>${this.formatCurrency(ad.revenue)}</td>
                <td class="${ad.roas > 2 ? 'text-success' : ad.roas > 1 ? '' : 'text-error'}">${ad.roas.toFixed(1)}x</td>
                <td>${this.formatCurrency(ad.cpa)}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updatePlatformCards() {
        const container = document.getElementById('platformCards');
        if (!container) {
            console.warn('Platform cards container not found');
            return;
        }
        
        const data = this.getFilteredData();
        const platforms = data.current.platforms;
        
        const platformConfig = {
            uber_eats: { name: 'Uber Eats', icon: 'uber-eats', commission: 0.30 },
            doordash: { name: 'DoorDash', icon: 'doordash', commission: 0.28 },
            grubhub: { name: 'Grubhub', icon: 'grubhub', commission: 0.25 }
        };
        
        container.innerHTML = '';
        
        Object.keys(platforms).forEach(key => {
            const platform = platforms[key];
            const config = platformConfig[key];
            const aov = platform.orders > 0 ? platform.sales / platform.orders : 0;
            const netPayout = platform.sales * (1 - config.commission);
            
            const card = document.createElement('div');
            card.className = 'platform-card';
            card.innerHTML = `
                <div class="platform-header">
                    <div class="platform-icon ${config.icon}">
                        ${config.name.charAt(0)}
                    </div>
                    <div>
                        <h3 class="platform-name">${config.name}</h3>
                        <small>${(config.commission * 100).toFixed(0)}% Commission</small>
                    </div>
                </div>
                <div class="platform-metrics">
                    <div class="platform-metric">
                        <div class="platform-metric-label">Sales</div>
                        <div class="platform-metric-value">${this.formatCurrency(platform.sales)}</div>
                    </div>
                    <div class="platform-metric">
                        <div class="platform-metric-label">Orders</div>
                        <div class="platform-metric-value">${platform.orders.toLocaleString()}</div>
                    </div>
                    <div class="platform-metric">
                        <div class="platform-metric-label">AOV</div>
                        <div class="platform-metric-value">${this.formatCurrency(aov)}</div>
                    </div>
                    <div class="platform-metric">
                        <div class="platform-metric-label">Net Payout</div>
                        <div class="platform-metric-value">${this.formatCurrency(netPayout)}</div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    createPlatformCharts() {
        try {
            this.createPlatformSalesChart();
            this.createCommissionChart();
        } catch (error) {
            console.error('Error creating platform charts:', error);
        }
    }

    createPlatformSalesChart() {
        const ctx = document.getElementById('platformSalesChart');
        if (!ctx) {
            console.warn('Platform sales chart canvas not found');
            return;
        }
        
        if (this.charts.platformSales) {
            this.charts.platformSales.destroy();
        }

        const data = this.getFilteredData();
        const platforms = data.current.platforms;
        
        this.charts.platformSales = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sales', 'Orders', 'Marketing Spend'],
                datasets: [{
                    label: 'Uber Eats',
                    data: [platforms.uber_eats.sales, platforms.uber_eats.orders * 50, platforms.uber_eats.marketing_spend],
                    backgroundColor: '#1FB8CD'
                }, {
                    label: 'DoorDash',
                    data: [platforms.doordash.sales, platforms.doordash.orders * 50, platforms.doordash.marketing_spend],
                    backgroundColor: '#FFC185'
                }, {
                    label: 'Grubhub',
                    data: [platforms.grubhub?.sales || 0, (platforms.grubhub?.orders || 0) * 50, platforms.grubhub?.marketing_spend || 0],
                    backgroundColor: '#B4413C'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f5f5f5' } }
                },
                scales: {
                    x: {
                        ticks: { color: '#a7a9a9' },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    createCommissionChart() {
        const ctx = document.getElementById('commissionChart');
        if (!ctx) {
            console.warn('Commission chart canvas not found');
            return;
        }
        
        if (this.charts.commission) {
            this.charts.commission.destroy();
        }

        const data = this.getFilteredData();
        const platforms = data.current.platforms;
        
        const commissionData = [
            { platform: 'Uber Eats', rate: 30, sales: platforms.uber_eats.sales },
            { platform: 'DoorDash', rate: 28, sales: platforms.doordash.sales },
            { platform: 'Grubhub', rate: 25, sales: platforms.grubhub?.sales || 0 }
        ];

        this.charts.commission = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: commissionData.map((item, index) => ({
                    label: item.platform,
                    data: [{ x: item.rate, y: item.sales }],
                    backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C'][index],
                    borderColor: ['#1FB8CD', '#FFC185', '#B4413C'][index],
                    pointRadius: 10,
                    pointHoverRadius: 12
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f5f5f5' } },
                    title: {
                        display: true,
                        text: 'Commission Rate vs Sales Performance',
                        color: '#f5f5f5'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Commission Rate (%)',
                            color: '#a7a9a9'
                        },
                        ticks: { color: '#a7a9a9' },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Sales ($)',
                            color: '#a7a9a9'
                        },
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    updateLocationTable() {
        const tbody = document.querySelector('#locationTable tbody');
        if (!tbody) {
            console.warn('Location table body not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        this.data.clients.forEach(client => {
            const clientData = this.data.performance_data.current_week[`client_${client.id}`];
            if (!clientData || (this.selectedClient !== 'all' && client.id != this.selectedClient)) return;
            
            client.locations.forEach(location => {
                const locationData = clientData.locations[location.id];
                if (!locationData) return;
                
                const aov = locationData.orders > 0 ? locationData.sales / locationData.orders : 0;
                const topPlatform = this.getTopPlatformForLocation(clientData.platforms);
                const marketingEfficiency = clientData.marketing_roas || 0;
                const netMargin = 72; // Simplified calculation
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${location.name}</td>
                    <td>${client.name}</td>
                    <td>${location.market}</td>
                    <td>${this.formatCurrency(locationData.sales)}</td>
                    <td>${locationData.orders.toLocaleString()}</td>
                    <td>${this.formatCurrency(aov)}</td>
                    <td>${topPlatform}</td>
                    <td>${marketingEfficiency.toFixed(1)}x</td>
                    <td>${netMargin}%</td>
                    <td class="${locationData.growth > 10 ? 'text-success' : locationData.growth > 0 ? '' : 'text-error'}">${locationData.growth.toFixed(1)}%</td>
                `;
                tbody.appendChild(row);
            });
        });
    }

    getTopPlatformForLocation(platforms) {
        let topPlatform = 'Uber Eats';
        let maxSales = 0;
        
        Object.keys(platforms).forEach(key => {
            if (platforms[key].sales > maxSales) {
                maxSales = platforms[key].sales;
                topPlatform = key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
        });
        
        return topPlatform;
    }

    createLocationCharts() {
        try {
            this.createLocationSalesChart();
            this.createLocationTrendsChart();
        } catch (error) {
            console.error('Error creating location charts:', error);
        }
    }

    createLocationSalesChart() {
        const ctx = document.getElementById('locationSalesChart');
        if (!ctx) {
            console.warn('Location sales chart canvas not found');
            return;
        }
        
        if (this.charts.locationSales) {
            this.charts.locationSales.destroy();
        }

        const locationData = [];
        const labels = [];
        
        this.data.clients.forEach(client => {
            const clientData = this.data.performance_data.current_week[`client_${client.id}`];
            if (!clientData || (this.selectedClient !== 'all' && client.id != this.selectedClient)) return;
            
            client.locations.forEach(location => {
                const locData = clientData.locations[location.id];
                if (locData) {
                    labels.push(location.name);
                    locationData.push(locData.sales);
                }
            });
        });

        this.charts.locationSales = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales by Location',
                    data: locationData,
                    backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545'],
                    borderColor: '#2d2d2d',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#a7a9a9' },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    createLocationTrendsChart() {
        const ctx = document.getElementById('locationTrendsChart');
        if (!ctx) {
            console.warn('Location trends chart canvas not found');
            return;
        }
        
        if (this.charts.locationTrends) {
            this.charts.locationTrends.destroy();
        }

        // Sample growth trend data
        const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        const growthData = [5.2, 8.1, 12.5, 15.3]; // Sample growth percentages

        this.charts.locationTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Average Location Growth',
                    data: growthData,
                    borderColor: '#FF6B35',
                    backgroundColor: 'rgba(255, 107, 53, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f5f5f5' } }
                },
                scales: {
                    x: {
                        ticks: { color: '#a7a9a9' },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    },
                    y: {
                        ticks: {
                            color: '#a7a9a9',
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        },
                        grid: { color: 'rgba(167, 169, 169, 0.2)' }
                    }
                }
            }
        });
    }

    handleFileUpload(file, platform) {
        console.log(`Processing file: ${file.name} for platform: ${platform}`);
        
        // Simulate processing with a delay
        setTimeout(() => {
            const historyContainer = document.getElementById('uploadHistory');
            if (!historyContainer) {
                console.error('Upload history container not found');
                return;
            }

            const noUploads = historyContainer.querySelector('.no-uploads');
            if (noUploads) noUploads.remove();
            
            const uploadItem = document.createElement('div');
            uploadItem.className = 'upload-history-item';
            uploadItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <strong>${platform.replace(/([A-Z])/g, ' $1').trim()}</strong> - ${file.name}
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">
                            Client: ${this.getClientName()} • ${new Date().toLocaleString()}
                        </div>
                    </div>
                    <span class="status-badge active">Success</span>
                </div>
            `;
            historyContainer.appendChild(uploadItem);
            
            this.updateLastUpdated();
            console.log(`File upload complete for ${platform}`);
        }, 500);
    }

    getClientName() {
        if (this.selectedClient === 'all') return 'All Clients';
        const client = this.data.clients.find(c => c.id == this.selectedClient);
        return client ? client.name : 'Unknown Client';
    }

    editClient(clientId) {
        console.log(`Edit client ${clientId} requested`);
        alert(`Edit client functionality would open for Client ID: ${clientId}`);
    }

    viewClientReport(clientId) {
        console.log(`View report for client ${clientId}`);
        // Switch to client view and update dashboard
        this.selectedClient = clientId;
        const clientSelect = document.getElementById('clientSelect');
        if (clientSelect) {
            clientSelect.value = clientId;
        }
        this.updateDashboard();
        this.showTab('home');
    }

    updateDataPoints() {
        const totalDataPoints = this.data.clients.reduce((total, client) => {
            return total + client.locations.length;
        }, 0) * 30; // Approximate data points per location per month
        
        const dataPointsEl = document.getElementById('dataPoints');
        if (dataPointsEl) {
            dataPointsEl.textContent = totalDataPoints.toLocaleString();
        }
    }

    updateLastUpdated() {
        const now = new Date();
        const timeString = now.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const element = document.getElementById('lastUpdated');
        if (element) {
            element.textContent = timeString;
        }
    }

    exportData() {
        console.log('Exporting data...');
        
        try {
            const data = this.getFilteredData();
            const clientName = this.getClientName();
            
            const exportData = {
                client: clientName,
                period: this.selectedDateRange,
                metrics: data.current,
                marketing_campaigns: {
                    promotions: this.getFilteredPromotions(),
                    ads: this.getFilteredAds()
                },
                exportedAt: new Date().toISOString(),
                exportedBy: 'Spice Digital Dashboard'
            };
            
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `spice-dashboard-${clientName.replace(/\s+/g, '-')}-${this.selectedDateRange}.json`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`Data exported successfully for ${clientName}`);
            
            // Show success notification (replace alert with proper notification in real app)
            setTimeout(() => {
                alert(`✅ Data exported successfully for ${clientName}!`);
            }, 100);
            
        } catch (error) {
            console.error('Export failed:', error);
            alert('❌ Export failed. Please try again.');
        }
    }
}

// Initialize the enhanced dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing dashboard...');
    try {
        window.dashboard = new MultiClientDashboard();
        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
    }
});