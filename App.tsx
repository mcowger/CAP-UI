import { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { dbClient } from './lib/db-client';
import Dashboard from './components/Dashboard';
import {
    BarGraph,
    Dashboard as DashboardIcon,
    Settings,
    Key,
    Cloud,
    File,
    Shield,
    Gauge,
    Code
} from './components/Icons';

// Helper to get date boundaries based on range ID
const getDateBoundaries = (rangeId: string) => {
    const now = new Date();

    const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const localMidnightToUTC = (d: Date) => {
        const localMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        return localMidnight.toISOString();
    };

    const todayStr = formatDate(now);
    const todayUTC = localMidnightToUTC(now);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);
    const yesterdayUTC = localMidnightToUTC(yesterday);

    switch (rangeId) {
        case 'today':
            return {
                startDate: todayStr,
                endDate: null,
                startTime: todayUTC,
                endTime: null
            };
        case 'yesterday':
            return {
                startDate: yesterdayStr,
                endDate: todayStr,
                startTime: yesterdayUTC,
                endTime: todayUTC
            };
        case '7d': {
            const d7 = new Date(now);
            d7.setDate(d7.getDate() - 7);
            return {
                startDate: formatDate(d7),
                endDate: null,
                startTime: localMidnightToUTC(d7),
                endTime: null
            };
        }
        case '30d': {
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);
            return {
                startDate: formatDate(d30),
                endDate: null,
                startTime: localMidnightToUTC(d30),
                endTime: null
            };
        }
        case 'year': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            return {
                startDate: formatDate(yearStart),
                endDate: null,
                startTime: localMidnightToUTC(yearStart),
                endTime: null
            };
        }
        case 'all':
        default:
            return { startDate: null, endDate: null, startTime: null, endTime: null };
    }
};

// Placeholder pages (will be implemented in Phase 2)
const PlaceholderPage = ({ title, description }: { title: string, description: string }) => (
    <div className="main-content-inner">
        <div className="page-header">
            <h1 className="page-title">{title}</h1>
            <p className="page-description">{description}</p>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p>This page will be implemented in Phase 2</p>
        </div>
    </div>
);

type ViewType =
    | 'usage-analytics'
    | 'management-dashboard'
    | 'settings'
    | 'api-keys'
    | 'providers'
    | 'auth-files'
    | 'oauth'
    | 'quota'
    | 'config';

function App() {
    const [activeView, setActiveView] = useState<ViewType>('usage-analytics');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Usage analytics state (existing Dashboard functionality)
    const [stats, setStats] = useState(null);
    const [dailyStats, setDailyStats] = useState([]);
    const [modelUsage, setModelUsage] = useState([]);
    const [endpointUsage, setEndpointUsage] = useState([]);
    const [hourlyStats, setHourlyStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [dateRange, setDateRange] = useState('today');

    const fetchData = useCallback(async (rangeId = dateRange, isInitial = false) => {
        try {
            if (isInitial) {
                setLoading(true);
            } else {
                setIsRefreshing(true);
            }

            const { startTime, endTime, startDate, endDate } = getDateBoundaries(rangeId);

            // Fetch latest snapshot
            const latestSnapshot = await dbClient.getLatestSnapshot();
            if (latestSnapshot) {
                setStats(latestSnapshot);
                const utcTimestamp = latestSnapshot.collected_at.replace(' ', 'T') + 'Z';
                setLastUpdated(new Date(utcTimestamp));
            }

            // Fetch daily stats
            const daily = await dbClient.getDailyStats({
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });
            setDailyStats(daily);

            // Fetch model usage
            const models = await dbClient.getModelUsage({
                startTime: startTime || undefined,
                endTime: endTime || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });
            setModelUsage(models);

            // Fetch hourly stats
            const hourly = await dbClient.getHourlyStats({
                startTime: startTime || undefined,
                endTime: endTime || undefined
            });
            setHourlyStats(hourly);

            // Fetch endpoint usage
            const endpoints = await dbClient.getEndpointUsage({
                startTime: startTime || undefined,
                endTime: endTime || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });
            setEndpointUsage(endpoints);

            setLoading(false);
            setIsRefreshing(false);
        } catch (error) {
            console.error('Error fetching data:', error);
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [dateRange]);

    // Initial fetch
    useEffect(() => {
        if (activeView === 'usage-analytics') {
            fetchData(dateRange, true);
        }
    }, [dateRange, activeView]);

    // Auto-refresh every 5 minutes for usage analytics
    useEffect(() => {
        if (activeView === 'usage-analytics') {
            const interval = setInterval(() => fetchData(dateRange), 5 * 60 * 1000);
            return () => clearInterval(interval);
        }
    }, [dateRange, fetchData, activeView]);

    // Trigger collector
    const triggerCollector = async () => {
        return await dbClient.triggerCollector();
    };

    const handleDateRangeChange = async (days: string, shouldTriggerCollector = false) => {
        if (shouldTriggerCollector) {
            setIsRefreshing(true);
            try {
                await triggerCollector();
                await new Promise(resolve => setTimeout(resolve, 500));

                if (days === dateRange) {
                    await fetchData(days);
                }
            } catch (e) {
                console.error('Trigger error:', e);
                setIsRefreshing(false);
            }
        }
        setDateRange(days);
    };

    // Hash-based navigation
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.slice(2); // Remove '#/'
            if (hash && isValidView(hash)) {
                setActiveView(hash as ViewType);
                setSidebarOpen(false); // Close sidebar on mobile
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // Check initial hash

        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const isValidView = (view: string): view is ViewType => {
        const validViews: ViewType[] = [
            'usage-analytics',
            'management-dashboard',
            'settings',
            'api-keys',
            'providers',
            'auth-files',
            'oauth',
            'quota',
            'config'
        ];
        return validViews.includes(view as ViewType);
    };

    const navigate = (view: ViewType) => {
        setActiveView(view);
        window.location.hash = `/${view}`;
        setSidebarOpen(false);
    };

    // Navigation items
    const navItems = [
        { id: 'usage-analytics' as ViewType, label: 'Usage Analytics', icon: BarGraph },
        { id: 'management-dashboard' as ViewType, label: 'Management Dashboard', icon: DashboardIcon },
        { id: 'settings' as ViewType, label: 'Settings', icon: Settings },
        { id: 'api-keys' as ViewType, label: 'API Keys', icon: Key },
        { id: 'providers' as ViewType, label: 'AI Providers', icon: Cloud },
        { id: 'auth-files' as ViewType, label: 'Auth Files', icon: File },
        { id: 'oauth' as ViewType, label: 'OAuth Login', icon: Shield },
        { id: 'quota' as ViewType, label: 'Quota Management', icon: Gauge },
        { id: 'config' as ViewType, label: 'Config Editor', icon: Code }
    ];

    // Render active view
    const renderView = () => {
        switch (activeView) {
            case 'usage-analytics':
                return (
                    <Dashboard
                        stats={stats}
                        dailyStats={dailyStats}
                        modelUsage={modelUsage}
                        hourlyStats={hourlyStats}
                        loading={loading}
                        isRefreshing={isRefreshing}
                        lastUpdated={lastUpdated}
                        dateRange={dateRange}
                        onDateRangeChange={handleDateRangeChange}
                        endpointUsage={endpointUsage}
                    />
                );
            case 'management-dashboard':
                return <PlaceholderPage title="Management Dashboard" description="Quick overview of system status and statistics" />;
            case 'settings':
                return <PlaceholderPage title="Basic Settings" description="Configure CLIProxy basic settings" />;
            case 'api-keys':
                return <PlaceholderPage title="API Keys" description="Manage proxy API keys" />;
            case 'providers':
                return <PlaceholderPage title="AI Providers" description="Configure Gemini, Codex, Claude, and OpenAI providers" />;
            case 'auth-files':
                return <PlaceholderPage title="Auth Files" description="Upload and manage authentication files" />;
            case 'oauth':
                return <PlaceholderPage title="OAuth Login" description="Configure OAuth provider authentication" />;
            case 'quota':
                return <PlaceholderPage title="Quota Management" description="Monitor and manage API quotas" />;
            case 'config':
                return <PlaceholderPage title="Config Editor" description="Edit CLIProxy YAML configuration" />;
            default:
                return <PlaceholderPage title="Not Found" description="Page not found" />;
        }
    };

    return (
        <AuthProvider>
            <ConfigProvider>
                <NotificationProvider>
                    <div className="app-container">
                        {/* Mobile sidebar toggle */}
                        <button
                            className="sidebar-toggle"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle sidebar"
                        >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {sidebarOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>

                        {/* Sidebar overlay (mobile) */}
                        <div
                            className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                        />

                        {/* Sidebar */}
                        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                            <div className="sidebar-header">
                                <h1 className="sidebar-title">CLIProxy</h1>
                                <p className="sidebar-subtitle">Management Dashboard</p>
                            </div>

                            <nav className="sidebar-nav">
                                {navItems.map(item => {
                                    const Icon = item.icon;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                                            onClick={() => navigate(item.id)}
                                        >
                                            <Icon />
                                            <span>{item.label}</span>
                                        </div>
                                    );
                                })}
                            </nav>
                        </aside>

                        {/* Main content */}
                        <main className="main-content">
                            {renderView()}
                        </main>
                    </div>
                </NotificationProvider>
            </ConfigProvider>
        </AuthProvider>
    );
}

export default App;
