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
    // Legacy actions
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

    if (loading) return <div className="text-slate-400 text-center py-12">Loading logs...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <History size={20} />
                    Activity Logs
                </h3>
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
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
                    <div className="p-12 text-center text-slate-500">No activity logs found.</div>
                ) : (
                    <div className="divide-y divide-slate-800/50">
                        {filteredLogs.map(log => (
                            <div key={log.id} className="flex items-center gap-4 p-4 hover:bg-slate-800/30 transition-colors">
                                {/* User avatar */}
                                {log.user_avatar ? (
                                    <img src={log.user_avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 flex-shrink-0">
                                        {log.user_name ? log.user_name.charAt(0) : 'S'}
                                    </div>
                                )}

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-white font-medium">
                                            {log.user_name || 'System'}
                                        </span>
                                        <span className={`text-xs font-medium ${ACTION_COLORS[log.action] || 'text-slate-400'}`}>
                                            {ACTION_LABELS[log.action] || log.action}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate">{log.description}</p>
                                </div>

                                {/* Timestamp */}
                                <span className="text-xs text-slate-500 flex-shrink-0">
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
