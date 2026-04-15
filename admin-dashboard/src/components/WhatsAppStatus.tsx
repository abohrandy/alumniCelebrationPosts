import { useState, useEffect } from 'react';
import { RefreshCcw, CheckCircle2, History, Send, Power, Plus, Trash2, User, Star, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io();

interface Profile {
    id: number;
    name: string;
    auth_dir: string;
    status: string;
    qrText: string;
    lastError: string | null;
    is_default: number;
    group_id?: string;
    group_id_2?: string;
}

const WhatsAppStatus = () => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<any[]>([
        { time: new Date().toLocaleTimeString(), msg: 'Dashboard connected to live stream', type: 'info' }
    ]);

    const [showAddModal, setShowAddModal] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Edit Modal State
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [editName, setEditName] = useState('');
    const [editGroupId, setEditGroupId] = useState('');
    const [editGroupId2, setEditGroupId2] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showGroupPicker, setShowGroupPicker] = useState<'primary' | 'secondary' | null>(null);
    const [availableGroups, setAvailableGroups] = useState<any[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    useEffect(() => {
        fetchProfiles();

        // Socket listeners
        socket.on('whatsapp_status_update', (data) => {
            console.log('Live status update:', data);
            setProfiles(prev => prev.map(p => 
                p.id === data.id ? { ...p, status: data.status, qrText: data.qrText, lastError: data.lastError } : p
            ));
        });

        socket.on('post_log', (log) => {
            setLogs(prev => [{
                time: new Date(log.timestamp).toLocaleTimeString(),
                msg: log.message,
                type: log.type
            }, ...prev].slice(0, 50));
        });

        return () => {
            socket.off('whatsapp_status_update');
            socket.off('post_log');
        };
    }, []);

    const fetchProfiles = async () => {
        try {
            const res = await axios.get('/api/whatsapp/profiles');
            setProfiles(res.data);
        } catch (error) {
            console.error('Failed to fetch profiles');
        } finally {
            setLoading(false);
        }
    };

    const handleAddProfile = async () => {
        if (!newProfileName.trim()) return;
        setIsCreating(true);
        try {
            await axios.post('/api/whatsapp/profiles', { name: newProfileName });
            setNewProfileName('');
            setShowAddModal(false);
            fetchProfiles();
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `New profile "${newProfileName}" created.`,
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to create profile');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteProfile = async (id: number, name: string) => {
        if (!confirm(`Are you sure you want to delete profile "${name}"? This will erase all session data.`)) return;
        try {
            await axios.delete(`/api/whatsapp/profiles/${id}`);
            fetchProfiles();
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Profile "${name}" deleted.`,
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete profile');
        }
    };

    const handleAction = async (action: 'reconnect' | 'disconnect' | 'send-test', profileId: number) => {
        try {
            const endpoint = `/api/whatsapp/${action}`;
            await axios.post(endpoint, { profileId });
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `${action.replace('-', ' ')} initiated for profile #${profileId}.`,
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
             setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Error: ${error.response?.data?.error || error.message}`,
                type: 'error'
            }, ...prev]);
        }
    };

    const handleSetDefault = async (id: number, name: string) => {
        try {
            await axios.patch(`/api/whatsapp/profiles/${id}/default`);
            fetchProfiles();
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Profile "${name}" is now the primary account.`,
                type: 'success'
            }, ...prev]);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to set default profile');
        }
    };

    const openEditModal = (profile: Profile) => {
        setEditingProfile(profile);
        setEditName(profile.name);
        setEditGroupId(profile.group_id || '');
        setEditGroupId2(profile.group_id_2 || '');
        setShowGroupPicker(null);
    };

    const handleUpdateProfile = async () => {
        if (!editingProfile) return;
        setIsUpdating(true);
        try {
            await axios.patch(`/api/whatsapp/profiles/${editingProfile.id}`, {
                name: editName,
                group_id: editGroupId,
                group_id_2: editGroupId2
            });
            setEditingProfile(null);
            fetchProfiles();
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Profile "${editName}" updated.`,
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to update profile');
        } finally {
            setIsUpdating(false);
        }
    };

    const fetchGroups = async () => {
        if (!editingProfile) return;
        setLoadingGroups(true);
        try {
            const res = await axios.get(`/api/whatsapp/groups?profileId=${editingProfile.id}`);
            setAvailableGroups(res.data);
        } catch (error: any) {
            console.error('Failed to load groups');
        } finally {
            setLoadingGroups(false);
        }
    };

    const handleBrowseGroups = (target: 'primary' | 'secondary') => {
        setShowGroupPicker(target);
        if (availableGroups.length === 0) {
            fetchGroups();
        }
    };

    const selectGroup = (groupId: string) => {
        if (showGroupPicker === 'primary') {
            setEditGroupId(groupId);
        } else {
            setEditGroupId2(groupId);
        }
        setShowGroupPicker(null);
    };

    if (loading) return <div className="p-8 text-center text-muted">Loading WhatsApp profiles...</div>;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp Accounts</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage multiple profiles and connection states</p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-all shadow-lg"
                >
                    <Plus size={20} /> Add New Profile
                </button>
            </div>

            {/* Profiles Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {profiles.map(profile => (
                    <div key={profile.id} className={`glass-card p-6 flex flex-col gap-6 relative overflow-hidden border-t-4 ${profile.status === 'CONNECTED' ? 'border-t-emerald-500' : 'border-t-amber-500'}`}>
                        {/* Profile Info */}
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${profile.status === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                    <User size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                                        {profile.name}
                                    </h3>
                                    {profile.is_default ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
                                            <Star size={10} fill="currentColor" /> Primary
                                        </span>
                                    ) : (
                                        <span className={`text-xs font-bold uppercase ${profile.status === 'CONNECTED' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {profile.status}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleAction('reconnect', profile.id)}
                                    title="Reconnect"
                                    className="p-2 hover:bg-primary/10 rounded-lg text-secondary transition-colors"
                                >
                                    <RefreshCcw size={18} />
                                </button>
                                <button 
                                    onClick={() => openEditModal(profile)}
                                    title="Account Settings"
                                    className="p-2 hover:bg-primary/10 rounded-lg text-secondary transition-colors"
                                >
                                    <Plus className="rotate-45" size={18} /> {/* Using Plus rotated as a settings-ish icon since I don't want to import more */}
                                </button>
                                <button 
                                    onClick={() => handleSetDefault(profile.id, profile.name)}
                                    disabled={!!profile.is_default}
                                    title={profile.is_default ? "Primary Account" : "Set as Primary"}
                                    className={`p-2 rounded-lg transition-colors ${profile.is_default ? 'text-primary bg-primary/10 cursor-default' : 'text-secondary hover:bg-primary/10'}`}
                                >
                                    <Star size={18} fill={profile.is_default ? "currentColor" : "none"} />
                                </button>
                                {!profile.is_default && (
                                    <button 
                                        onClick={() => handleDeleteProfile(profile.id, profile.name)}
                                        title="Delete Profile"
                                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Status Content */}
                        <div className="flex-1 flex flex-col items-center justify-center py-4">
                            {profile.status === 'CONNECTED' ? (
                                <div className="text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-4">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Account is online and active</p>
                                    <button 
                                        onClick={() => handleAction('send-test', profile.id)}
                                        className="mt-4 px-4 py-2 border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2 mx-auto"
                                    >
                                        <Send size={14} /> Send Test Message
                                    </button>
                                </div>
                            ) : profile.qrText ? (
                                <div className="text-center">
                                    <div className="bg-white p-3 rounded-xl shadow-lg mb-4 inline-block">
                                        <QRCodeSVG value={profile.qrText} size={150} level="M" includeMargin />
                                    </div>
                                    <p className="text-xs font-medium max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
                                        Scan this QR code with your phone to link this account.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <RefreshCcw size={32} className="animate-spin text-primary/30 mx-auto mb-4" />
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Initializing account...</p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                            {profile.status === 'CONNECTED' && (
                                <button 
                                    onClick={() => handleAction('disconnect', profile.id)}
                                    className="flex-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Power size={14} /> Disconnect
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Log Section */}
            <div className="glass-card flex flex-col">
                <div className="p-6 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <History size={20} style={{ color: 'var(--text-secondary)' }} />
                    <h4 className="font-bold" style={{ color: 'var(--text-primary)' }}>System Events Log</h4>
                </div>
                <div className="p-6 space-y-4 font-mono text-xs overflow-y-auto max-h-[300px]">
                    {logs.map((log, i) => (
                        <div key={i} className="flex gap-4">
                            <span style={{ color: 'var(--text-muted)' }}>[{log.time}]</span>
                            <span className={log.type === 'success' ? 'text-emerald-500' : log.type === 'error' ? 'text-red-400' : ''} style={log.type !== 'success' && log.type !== 'error' ? { color: 'var(--text-secondary)' } : {}}>
                                {log.msg}
                            </span>
                        </div>
                    ))}
                    {logs.length === 0 && <p className="text-muted italic">Waiting for events...</p>}
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Add WhatsApp Account</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold mb-2 uppercase tracking-tight" style={{ color: 'var(--text-secondary)' }}>Account Name</label>
                                <input 
                                    type="text" 
                                    value={newProfileName}
                                    onChange={(e) => setNewProfileName(e.target.value)}
                                    placeholder="e.g. Marketing Hub, Support Line"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm focus:border-primary outline-none transition-all"
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button 
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 px-4 py-3 glass-card hover:bg-white/5 rounded-lg text-sm font-bold transition-all"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAddProfile}
                                    disabled={isCreating}
                                    className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2"
                                >
                                    {isCreating ? <RefreshCcw size={18} className="animate-spin" /> : <Plus size={18} />}
                                    {isCreating ? 'Creating...' : 'Add Account'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit / Settings Modal */}
            {editingProfile && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Account Settings: {editingProfile.name}</h3>
                            <button onClick={() => setEditingProfile(null)} className="text-muted hover:text-white">✕</button>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest text-primary">Display Name</label>
                                <input 
                                    type="text" 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm focus:border-primary outline-none transition-all"
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest text-primary">Primary Group ID</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={editGroupId}
                                            onChange={(e) => setEditGroupId(e.target.value)}
                                            placeholder="Group JID"
                                            className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-sm focus:border-primary outline-none transition-all"
                                            style={{ color: 'var(--text-primary)' }}
                                        />
                                        <button 
                                            onClick={() => handleBrowseGroups('primary')}
                                            disabled={editingProfile.status !== 'CONNECTED'}
                                            className="px-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold disabled:opacity-30"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold mb-2 uppercase tracking-widest text-primary">Secondary Group ID</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={editGroupId2}
                                            onChange={(e) => setEditGroupId2(e.target.value)}
                                            placeholder="Optional JID"
                                            className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-sm focus:border-primary outline-none transition-all"
                                            style={{ color: 'var(--text-primary)' }}
                                        />
                                        <button 
                                            onClick={() => handleBrowseGroups('secondary')}
                                            disabled={editingProfile.status !== 'CONNECTED'}
                                            className="px-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold disabled:opacity-30"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Inner Group Picker */}
                            {showGroupPicker && (
                                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-primary uppercase">Select {showGroupPicker} group</span>
                                        <button onClick={() => setShowGroupPicker(null)} className="text-[10px] opacity-50 hover:opacity-100">Cancel</button>
                                    </div>
                                    {loadingGroups ? (
                                        <div className="py-4 text-center text-xs text-muted animate-pulse">Fetching groups from WhatsApp...</div>
                                    ) : availableGroups.length === 0 ? (
                                        <div className="py-4 text-center text-xs text-muted">No groups found or account offline.</div>
                                    ) : (
                                        <div className="max-h-40 overflow-y-auto space-y-1">
                                            {availableGroups.map(g => (
                                                <button 
                                                    key={g.id}
                                                    onClick={() => selectGroup(g.id)}
                                                    className="w-full p-2 text-left text-xs bg-white/5 hover:bg-primary/20 rounded transition-all flex justify-between"
                                                >
                                                    <span className="font-bold truncate">{g.name}</span>
                                                    <span className="opacity-40 ml-2">{g.id.split('@')[0]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button 
                                    onClick={() => setEditingProfile(null)}
                                    className="flex-1 px-4 py-3 glass-card hover:bg-white/5 rounded-lg text-sm font-bold transition-all"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Close
                                </button>
                                <button 
                                    onClick={handleUpdateProfile}
                                    disabled={isUpdating}
                                    className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    {isUpdating ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
                                    {isUpdating ? 'Saving...' : 'Save Settings'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppStatus;
