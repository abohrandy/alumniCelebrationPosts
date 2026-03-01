import { useState, useEffect } from 'react';
import { History, Filter } from 'lucide-react';
import axios from 'axios';

interface LogEntry {
    id: number;
    user_id: number | null;
    action: string;
    event_id: number | null;
    description: string;
    created_at: string;
    user_name: string | null;
    user_avatar: string | null;
}

const ACTION_COLORS: Record<string, string> = {
    create_event: 'text-emerald-400',
    edit_event: 'text-blue-400',
    delete_event: 'text-red-400',
    post_sent: 'text-green-400',
    post_failed: 'text-red-500',
    user_login: 'text-yellow-400',
    settings_updated: 'text-indigo-400',
    role_changed: 'text-orange-400',
    whatsapp_disconnected: 'text-red-400',
    celebrant_added: 'text-emerald-400',
    celebrant_updated: 'text-blue-400',
    celebrant_deleted: 'text-red-400',
    whatsapp_post_sent: 'text-green-400',
    whatsapp_post_failed: 'text-red-500',
};

const ACTION_LABELS: Record<string, string> = {
    create_event: 'Created Event',
    edit_event: 'Edited Event',
    delete_event: 'Deleted Event',
    post_sent: 'Post Sent',
    post_failed: 'Post Failed',
    user_login: 'User Login',
    settings_updated: 'Settings Updated',
    role_changed: 'Role Changed',
    whatsapp_disconnected: 'WA Disconnected',
    celebrant_added: 'Added Celebrant',
    celebrant_updated: 'Updated Celebrant',
    celebrant_deleted: 'Deleted Celebrant',
    whatsapp_post_sent: 'Post Sent',
    whatsapp_post_failed: 'Post Failed',
};

function ActivityLogs() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState('all');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            const res = await axios.get('/api/logs');
            setLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = filterAction === 'all'
        ? logs
        : logs.filter(l => l.action === filterAction);

    const uniqueActions = [...new Set(logs.map(l => l.action))];

    if (loading) return <div style={{ color: 'var(--text-muted)' }} className="text-center py-12">Loading logs...</div>;

    return (
        <div className="space-y-4 lg:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base lg:text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <History size={20} />
                    Activity Logs
                </h3>
                <div className="flex items-center gap-2">
                    <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                    <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        className="flex-1 sm:flex-none text-sm rounded-lg px-3 py-2"
                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                        <option value="all">All Actions ({logs.length})</option>
                        {uniqueActions.map(action => (
                            <option key={action} value={action}>
                                {ACTION_LABELS[action] || action}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                {filteredLogs.length === 0 ? (
                    <div className="p-8 lg:p-12 text-center" style={{ color: 'var(--text-muted)' }}>No activity logs found.</div>
                ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                        {filteredLogs.map(log => (
                            <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 lg:p-4 transition-colors hover:opacity-90">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* User avatar */}
                                    {log.user_avatar ? (
                                        <img src={log.user_avatar} alt="" className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex-shrink-0" />
                                    ) : (
                                        <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                            style={{ backgroundColor: 'var(--bg-card-solid)', color: 'var(--text-secondary)' }}>
                                            {log.user_name ? log.user_name.charAt(0) : 'S'}
                                        </div>
                                    )}

                                    {/* Details */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {log.user_name || 'System'}
                                            </span>
                                            <span className={`text-xs font-medium ${ACTION_COLORS[log.action] || ''}`} style={!ACTION_COLORS[log.action] ? { color: 'var(--text-secondary)' } : {}}>
                                                {ACTION_LABELS[log.action] || log.action}
                                            </span>
                                        </div>
                                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{log.description}</p>
                                    </div>
                                </div>

                                {/* Timestamp */}
                                <span className="text-[10px] lg:text-xs flex-shrink-0 sm:text-right pl-10 sm:pl-0" style={{ color: 'var(--text-muted)' }}>
                                    {new Date(log.created_at).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ActivityLogs;
