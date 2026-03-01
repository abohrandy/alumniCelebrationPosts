import { useState, useEffect } from 'react';
import { CalendarDays, Send, TrendingUp, Users } from 'lucide-react';
import axios from 'axios';

interface EventItem {
    id: number;
    title: string | null;
    first_name: string | null;
    second_name: string | null;
    event_type: string;
    event_date: string | null;
    status: string;
    schedule_type: string;
    created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
    birthday: 'bg-pink-500/20 text-pink-400',
    wedding_anniversary: 'bg-purple-500/20 text-purple-400',
    monday_market: 'bg-green-500/20 text-green-400',
    announcement: 'bg-blue-500/20 text-blue-400'
};

const TYPE_LABELS: Record<string, string> = {
    birthday: 'Birthday',
    wedding_anniversary: 'Wedding',
    monday_market: 'Market',
    announcement: 'Announce'
};

function Dashboard() {
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

    const stats = [
        { label: 'Total Events', value: events.length, icon: CalendarDays, color: 'text-primary' },
        { label: 'Active Events', value: activeEvents.length, icon: TrendingUp, color: 'text-emerald-400' },
        { label: 'Birthdays', value: birthdays.length, icon: Users, color: 'text-pink-400' },
        { label: 'Recurring', value: markets.length + announcements.length, icon: Send, color: 'text-blue-400' },
    ];

    const getName = (e: EventItem) => {
        if (e.first_name) return `${e.first_name} ${e.second_name || ''}`.trim();
        return e.title || e.event_type;
    };

    // Get next upcoming single-date events
    const today = new Date().toISOString().slice(5, 10); // MM-DD
    const upcomingEvents = events
        .filter(e => e.event_date && e.status === 'active')
        .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))
        .slice(0, 8);

    if (loading) return <div className="text-slate-400 text-center py-12">Loading...</div>;

    return (
        <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map(stat => (
                    <div key={stat.label} className="glass-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-400">{stat.label}</span>
                            <stat.icon size={20} className={stat.color} />
                        </div>
                        <p className="text-3xl font-bold text-white">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Event Type Breakdown */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Events by Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { type: 'birthday', label: '🎂 Birthdays', count: birthdays.length },
                        { type: 'wedding_anniversary', label: '💍 Weddings', count: weddings.length },
                        { type: 'monday_market', label: '🛒 Monday Market', count: markets.length },
                        { type: 'announcement', label: '📢 Announcements', count: announcements.length },
                    ].map(item => (
                        <div key={item.type} className="bg-slate-800/50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-white">{item.count}</p>
                            <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Upcoming Events */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Upcoming Events</h3>
                {upcomingEvents.length === 0 ? (
                    <p className="text-slate-500 text-sm">No upcoming events scheduled.</p>
                ) : (
                    <div className="space-y-3">
                        {upcomingEvents.map(event => (
                            <div key={event.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[event.event_type] || ''}`}>
                                        {TYPE_LABELS[event.event_type] || event.event_type}
                                    </span>
                                    <span className="text-white font-medium">{getName(event)}</span>
                                </div>
                                <span className="text-xs text-slate-500">{event.event_date}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
