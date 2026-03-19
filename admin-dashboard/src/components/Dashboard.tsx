import { useState, useEffect } from 'react';
import { CalendarDays, Send, TrendingUp, Users } from 'lucide-react';
import axios from 'axios';

interface EventItem {
    id: number;
    title: string | null;
    full_name: string | null;
    event_type: string;
    event_date: string | null;
    status: string;
    schedule_type: string;
    repeat_interval_days: number | null;
    created_at: string;
    expiry_date: string | null;
}

const TYPE_COLORS: Record<string, string> = {
    birthday: 'bg-pink-500/20 text-pink-400',
    wedding_anniversary: 'bg-purple-500/20 text-purple-400',
    one_day_event: 'bg-amber-500/20 text-amber-400',
    monday_market: 'bg-green-500/20 text-green-400',
    announcement: 'bg-blue-500/20 text-blue-400'
};

const TYPE_LABELS: Record<string, string> = {
    birthday: 'Birthday',
    wedding_anniversary: 'Wedding',
    one_day_event: 'Event',
    monday_market: 'Market',
    announcement: 'Announce'
};

interface DashboardProps {
    onNavigate: (tab: string, showForm?: boolean, filter?: string) => void;
}

function Dashboard({ onNavigate }: DashboardProps) {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get('/api/events')
            .then(res => setEvents(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const activeEvents = events.filter(e => e.status === 'active');
    const birthdays = events.filter(e => e.event_type === 'birthday');
    const weddings = events.filter(e => e.event_type === 'wedding_anniversary');
    const markets = events.filter(e => e.event_type === 'monday_market');
    const announcements = events.filter(e => e.event_type === 'announcement');
    const oneDayEvents = events.filter(e => e.event_type === 'one_day_event');

    const stats = [
        { label: 'Total Events', value: events.length, icon: CalendarDays, color: 'text-primary', filter: 'all' },
        { label: 'Active Events', value: activeEvents.length, icon: TrendingUp, color: 'text-emerald-400', filter: 'all' },
        { label: 'Birthdays', value: birthdays.length, icon: Users, color: 'text-pink-400', filter: 'birthday' },
        { label: 'Recurring', value: markets.length + announcements.length, icon: Send, color: 'text-blue-400', filter: 'recurring' },
    ];

    const getName = (e: EventItem) => {
        return e.full_name || e.title || e.event_type;
    };

    const getNextOccurrenceString = (e: EventItem) => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (e.event_type === 'birthday' || e.event_type === 'wedding_anniversary') {
            if (!e.event_date) return null;
            const origMmDd = e.event_date.substring(5); // gets MM-DD
            if (!origMmDd || origMmDd.length !== 5) return e.event_date >= todayStr ? e.event_date : null;

            const thisYearDate = `${yyyy}-${origMmDd}`;
            if (thisYearDate >= todayStr) {
                return thisYearDate;
            } else {
                return `${yyyy + 1}-${origMmDd}`;
            }
        }

        if (e.schedule_type === 'interval' && e.repeat_interval_days && e.created_at) {
            const createdDate = new Date(e.created_at);
            let nextDate = new Date(createdDate);
            const todayDate = new Date(todayStr); // normalized to 00:00:00
            while (nextDate < todayDate) {
                nextDate.setDate(nextDate.getDate() + e.repeat_interval_days);
            }
            const nYyyy = nextDate.getFullYear();
            const nMm = String(nextDate.getMonth() + 1).padStart(2, '0');
            const nDd = String(nextDate.getDate()).padStart(2, '0');
            const result = `${nYyyy}-${nMm}-${nDd}`;
            if (e.expiry_date && result > e.expiry_date) {
                return null;
            }
            return result;
        }

        if (e.schedule_type === 'weekly') {
            let nextDate = new Date(todayStr);
            const day = nextDate.getDay();
            const diff = (day <= 1 ? 1 - day : 8 - day); // Until next Monday
            nextDate.setDate(nextDate.getDate() + diff);
            const nYyyy = nextDate.getFullYear();
            const nMm = String(nextDate.getMonth() + 1).padStart(2, '0');
            const nDd = String(nextDate.getDate()).padStart(2, '0');
            return `${nYyyy}-${nMm}-${nDd}`;
        }

        if (!e.event_date) return null;

        const occurrenceDate = e.event_date >= todayStr ? e.event_date : null;

        // Final check against expiry
        if (occurrenceDate && e.expiry_date && occurrenceDate > e.expiry_date) {
            return null;
        }

        return occurrenceDate;
    };

    const upcomingEvents = events
        .map(e => ({ ...e, nextDate: getNextOccurrenceString(e) }))
        .filter(e => e.nextDate !== null && e.status === 'active')
        .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!))
        .slice(0, 8);

    if (loading) return <div style={{ color: 'var(--text-muted)' }} className="text-center py-12">Loading...</div>;

    return (
        <div className="space-y-6 lg:space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-xl lg:text-2xl font-bold hidden lg:block" style={{ color: 'var(--text-primary)' }}>Overview</h2>
                <button
                    onClick={() => onNavigate('events', true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-primary/20 bg-gradient-to-r from-primary to-indigo-600"
                >
                    <CalendarDays size={18} />
                    Create New Event
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {stats.map(stat => (
                    <div
                        key={stat.label}
                        className="glass-card p-4 lg:p-5 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => onNavigate('events', false, stat.filter)}
                    >
                        <div className="flex items-center justify-between mb-2 lg:mb-3">
                            <span className="text-xs lg:text-sm" style={{ color: 'var(--text-secondary)' }}>{stat.label}</span>
                            <stat.icon size={18} className={stat.color} />
                        </div>
                        <p className="text-2xl lg:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Event Type Breakdown */}
            <div className="glass-card p-4 lg:p-6">
                <h3 className="text-base lg:text-lg font-semibold mb-3 lg:mb-4" style={{ color: 'var(--text-primary)' }}>Events by Type</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { type: 'birthday', label: '🎂 Birthdays', count: birthdays.length },
                        { type: 'wedding_anniversary', label: '💍 Weddings', count: weddings.length },
                        { type: 'one_day_event', label: '✨ Events', count: oneDayEvents.length },
                        { type: 'monday_market', label: '🛒 Monday Market', count: markets.length },
                        { type: 'announcement', label: '📢 Announcements', count: announcements.length },
                    ].map(item => (
                        <div
                            key={item.type}
                            className="rounded-xl p-3 lg:p-4 text-center cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all"
                            style={{ backgroundColor: 'var(--bg-card-solid)' }}
                            onClick={() => onNavigate('events', false, item.type)}
                        >
                            <p className="text-xl lg:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{item.count}</p>
                            <p className="text-[10px] lg:text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Upcoming Events */}
            <div className="glass-card p-4 lg:p-6">
                <h3 className="text-base lg:text-lg font-semibold mb-3 lg:mb-4" style={{ color: 'var(--text-primary)' }}>Upcoming Events</h3>
                {upcomingEvents.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No upcoming events scheduled.</p>
                ) : (
                    <div className="space-y-2 lg:space-y-3">
                        {upcomingEvents.map(event => (
                            <div
                                key={event.id}
                                className="flex items-center justify-between p-2.5 lg:p-3 rounded-lg cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all"
                                style={{ backgroundColor: 'var(--bg-card-solid)' }}
                                onClick={() => onNavigate('events', false, event.event_type)}
                            >
                                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] lg:text-[10px] font-medium whitespace-nowrap ${TYPE_COLORS[event.event_type] || ''}`}>
                                        {TYPE_LABELS[event.event_type] || event.event_type}
                                    </span>
                                    <span className="font-medium truncate text-sm" style={{ color: 'var(--text-primary)' }}>{getName(event)}</span>
                                </div>
                                <span className="text-[10px] lg:text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>{event.nextDate}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
