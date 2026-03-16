import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, MessageCircle, Users, Search, Instagram } from 'lucide-react';
import axios from 'axios';

const Settings = () => {
    const [settings, setSettings] = useState({
        whatsapp_group_id: '',
        whatsapp_group_id_2: '',
        instagram_business_id: '',
        instagram_access_token: '',
        imgbb_api_key: '',
        instagram_enabled: false,
        birthday_template: '',
        anniversary_template: '',
        one_day_event_template: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [groups, setGroups] = useState<any[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [showGroupPicker, setShowGroupPicker] = useState<'primary' | 'secondary' | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/settings');
            if (response.data) {
                setSettings({
                    whatsapp_group_id: response.data.whatsapp_group_id || '',
                    whatsapp_group_id_2: response.data.whatsapp_group_id_2 || '',
                    instagram_business_id: response.data.instagram_business_id || '',
                    instagram_access_token: response.data.instagram_access_token || '',
                    imgbb_api_key: response.data.imgbb_api_key || '',
                    instagram_enabled: !!response.data.instagram_enabled,
                    birthday_template: response.data.birthday_template || '',
                    anniversary_template: response.data.anniversary_template || '',
                    one_day_event_template: response.data.one_day_event_template || '',
                });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });
            await axios.post('/api/settings', settings);
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    const fetchGroups = async () => {
        setLoadingGroups(true);
        try {
            const res = await axios.get('/api/whatsapp/groups');
            setGroups(res.data);
        } catch (error: any) {
            setMessage({ type: 'error', text: 'Failed to load groups. Is WhatsApp connected?' });
        } finally {
            setLoadingGroups(false);
        }
    };

    const handleBrowseGroups = (target: 'primary' | 'secondary') => {
        setShowGroupPicker(target);
        if (groups.length === 0) {
            fetchGroups();
        }
    };

    const selectGroup = (groupId: string) => {
        if (showGroupPicker === 'primary') {
            setSettings({ ...settings, whatsapp_group_id: groupId });
        } else {
            setSettings({ ...settings, whatsapp_group_id_2: groupId });
        }
        setShowGroupPicker(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="glass-card p-6">
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <MessageCircle className="text-primary" size={24} />
                    Message Templates
                </h3>

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                Birthday Template
                            </label>
                            <textarea
                                value={settings.birthday_template}
                                onChange={(e) => setSettings({ ...settings, birthday_template: e.target.value })}
                                className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-none"
                                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                placeholder="Enter template for birthday posts..."
                            />
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Use {"{name}"} for name and {"{phone}"} for the phone number.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                Anniversary Template
                            </label>
                            <textarea
                                value={settings.anniversary_template}
                                onChange={(e) => setSettings({ ...settings, anniversary_template: e.target.value })}
                                className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-none"
                                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                placeholder="Enter template for anniversary posts..."
                            />
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Use {"{name}"} for name and {"{phone}"} for the phone number.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                One Day Event Template
                            </label>
                            <textarea
                                value={settings.one_day_event_template}
                                onChange={(e) => setSettings({ ...settings, one_day_event_template: e.target.value })}
                                className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-none"
                                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                placeholder="Enter template for one day event posts..."
                            />
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Use {"{name}"} for name and {"{phone}"} for the phone number.</p>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)' }} className="pt-6">
                        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <Users className="text-primary" size={24} />
                            WhatsApp Groups
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                    Primary Group ID
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={settings.whatsapp_group_id}
                                        onChange={(e) => setSettings({ ...settings, whatsapp_group_id: e.target.value })}
                                        className="flex-1 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="e.g. 1234567890@g.us"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleBrowseGroups('primary')}
                                        className="px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1 text-sm"
                                    >
                                        <Search size={16} /> Browse
                                    </button>
                                </div>
                                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>The main group where posts will be sent.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                    Secondary Group ID <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={settings.whatsapp_group_id_2}
                                        onChange={(e) => setSettings({ ...settings, whatsapp_group_id_2: e.target.value })}
                                        className="flex-1 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="e.g. 9876543210@g.us"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleBrowseGroups('secondary')}
                                        className="px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1 text-sm"
                                    >
                                        <Search size={16} /> Browse
                                    </button>
                                </div>
                                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Posts will also be sent to this group if configured.</p>
                            </div>
                        </div>

                        {/* Group Picker Modal */}
                        {showGroupPicker && (
                            <div className="mt-4 glass-card p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                        Select a group for {showGroupPicker === 'primary' ? 'Primary' : 'Secondary'}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => setShowGroupPicker(null)}
                                        className="text-xs px-2 py-1 rounded hover:bg-red-500/10 text-red-400"
                                    >
                                        Close
                                    </button>
                                </div>
                                {loadingGroups ? (
                                    <div className="flex items-center gap-2 py-4 justify-center">
                                        <RefreshCw size={16} className="animate-spin text-primary" />
                                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading groups...</span>
                                    </div>
                                ) : groups.length === 0 ? (
                                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No groups found. Make sure WhatsApp is connected.</p>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                        {groups.map((g: any) => (
                                            <button
                                                key={g.id}
                                                type="button"
                                                onClick={() => selectGroup(g.id)}
                                                className="w-full flex items-center justify-between p-3 rounded-lg text-left text-sm transition-colors hover:bg-primary/10"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                <span className="font-medium">{g.name}</span>
                                                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{g.id}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)' }} className="pt-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Instagram className="text-pink-500" size={24} />
                                Instagram Integration (Official API)
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.instagram_enabled}
                                    onChange={(e) => setSettings({ ...settings, instagram_enabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                <span className="ms-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Enabled</span>
                            </label>
                        </div>

                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm mb-6">
                            <p className="font-semibold mb-1 flex items-center gap-1">🚀 Important Requirement:</p>
                            <p>Instagram requires images to be available via a **Public URL**. We use **ImgBB** to host your images temporarily before posting.</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                    ImgBB API Key
                                </label>
                                <input
                                    type="text"
                                    value={settings.imgbb_api_key}
                                    onChange={(e) => setSettings({ ...settings, imgbb_api_key: e.target.value })}
                                    className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                    placeholder="Enter your ImgBB API Key..."
                                />
                                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Get one for free at <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api.imgbb.com</a></p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Instagram Business Account ID
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.instagram_business_id}
                                        onChange={(e) => setSettings({ ...settings, instagram_business_id: e.target.value })}
                                        className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="Enter Instagram ID..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Instagram Access Token
                                    </label>
                                    <input
                                        type="password"
                                        value={settings.instagram_access_token}
                                        onChange={(e) => setSettings({ ...settings, instagram_access_token: e.target.value })}
                                        className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="Enter Access Token..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                        {message.text && (
                            <span className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {message.text}
                            </span>
                        )}
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg flex items-center gap-2 transition-all font-medium disabled:opacity-50"
                        >
                            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                            Save Settings
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Settings;
