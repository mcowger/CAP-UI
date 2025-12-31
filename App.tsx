import { useState, useEffect, useCallback } from 'react';
import { dbClient } from './lib/db-client';
import Dashboard from './components/Dashboard';

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

function App() {
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
                // SQLite timestamps are in UTC, ensure proper parsing
                // Replace space with 'T' and add 'Z' to indicate UTC
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
        fetchData(dateRange, true);
    }, [dateRange]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(() => fetchData(dateRange), 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [dateRange, fetchData]);

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

    return (
        <div className="app">
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
        </div>
    );
}

export default App;
