import { useState, useEffect } from 'react';
import { History, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import axios from 'axios';

interface PublishingLogEntry {
    id: number;
    event_id: number | null;
    platform: 'whatsapp' | 'facebook_feed' | 'facebook_reel' | 'instagram_feed' | 'instagram_reel';
    status: 'success' | 'failed';
    response: string | null;
    published_at: string;
    title: string | null;
    full_name: string | null;
    event_type: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp Group',
    facebook_feed: 'Facebook Feed',
    facebook_reel: 'Facebook Reel',
    instagram_feed: 'Instagram Feed',
    instagram_reel: 'Instagram Reel'
};

const PLATFORM_BADGE_STYLE: Record<string, string> = {
    whatsapp: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    facebook_feed: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    facebook_reel: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    instagram_feed: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
    instagram_reel: 'bg-pink-500/10 text-pink-300 border-pink-500/20'
};

function PublishingLogs() {
    const [logs, setLogs] = useState<PublishingLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPlatform, setFilterPlatform] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/publishing-logs');
            setLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch publishing logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchPlatform = filterPlatform === 'all' || log.platform === filterPlatform;
        const matchStatus = filterStatus === 'all' || log.status === filterStatus;
        return matchPlatform && matchStatus;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 lg:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base lg:text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <History size={20} className="text-primary" />
                    Publishing Logs
                </h3>
                
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Platform Filter */}
                    <div className="flex items-center gap-2 text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Platform:</span>
                        <select
                            value={filterPlatform}
                            onChange={(e) => setFilterPlatform(e.target.value)}
                            className="rounded-lg px-3 py-1.5 text-xs"
                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                            <option value="all">All</option>
                            {Object.entries(PLATFORM_LABELS).map(([key, value]) => (
                                <option key={key} value={key}>{value}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2 text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="rounded-lg px-3 py-1.5 text-xs"
                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                            <option value="all">All</option>
                            <option value="success">Success</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>

                    <button 
                        onClick={fetchLogs} 
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/30 text-slate-400 hover:text-white transition-colors"
                        title="Refresh logs"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Event</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Platform</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Response / Details</th>
                                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Published At</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                                        No publishing logs found.
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => {
                                    const eventDisplayName = log.full_name || log.title || `Deleted Event (ID: ${log.event_id})`;
                                    
                                    return (
                                        <tr key={log.id} className="hover:bg-white/5 transition-colors text-sm">
                                            {/* Event Info */}
                                            <td className="p-4">
                                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{eventDisplayName}</div>
                                                {log.event_type && (
                                                    <div className="text-xs text-slate-500 capitalize">{log.event_type.replace('_', ' ')}</div>
                                                )}
                                            </td>

                                            {/* Platform Badge */}
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${PLATFORM_BADGE_STYLE[log.platform]}`}>
                                                    {PLATFORM_LABELS[log.platform] || log.platform}
                                                </span>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                                    log.status === 'success'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                }`}>
                                                    {log.status === 'success' ? (
                                                        <>
                                                            <CheckCircle2 size={12} />
                                                            Success
                                                        </>
                                                    ) : (
                                                        <>
                                                            <AlertCircle size={12} />
                                                            Failed
                                                        </>
                                                    )}
                                                </span>
                                            </td>

                                            {/* Response text */}
                                            <td className="p-4 max-w-xs md:max-w-md">
                                                <div className="font-mono text-xs text-slate-400 truncate max-h-16 overflow-y-auto whitespace-pre-wrap leading-relaxed" title={log.response || ''}>
                                                    {log.response || '—'}
                                                </div>
                                            </td>

                                            {/* Published At Date */}
                                            <td className="p-4 whitespace-nowrap text-xs text-slate-400">
                                                {new Date(log.published_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default PublishingLogs;
