import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, MessageCircle, Users, Instagram, Share2, Facebook } from 'lucide-react';
import axios from 'axios';

const Settings = () => {
    const [settings, setSettings] = useState({
        whatsapp_group_id: '',
        whatsapp_group_id_2: '',
        instagram_business_id: '',
        instagram_access_token: '',
        facebook_page_id: '',
        facebook_page_name: '',
        facebook_access_token: '',
        imgbb_api_key: '',
        instagram_enabled: false,
        birthday_template: '',
        anniversary_template: '',
        one_day_event_template: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState<'templates' | 'social'>('templates');

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
                    facebook_page_id: response.data.facebook_page_id || '',
                    facebook_page_name: response.data.facebook_page_name || '',
                    facebook_access_token: response.data.facebook_access_token || '',
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

    const isFacebookConnected = !!(settings.facebook_page_id.trim() && settings.facebook_page_name.trim() && settings.facebook_access_token.trim());
    const isInstagramConnected = !!(settings.instagram_business_id.trim() && settings.instagram_access_token.trim());

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-700/50 gap-4 mb-6">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`pb-3 text-sm font-semibold transition-all flex items-center gap-2 border-b-2 px-1 ${
                        activeTab === 'templates'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <MessageCircle size={16} />
                    General & Templates
                </button>
                <button
                    onClick={() => setActiveTab('social')}
                    className={`pb-3 text-sm font-semibold transition-all flex items-center gap-2 border-b-2 px-1 ${
                        activeTab === 'social'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <Share2 size={16} />
                    Social Media
                </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {activeTab === 'templates' && (
                    <div className="glass-card p-6 space-y-6">
                        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <MessageCircle className="text-primary" size={24} />
                            Message Templates
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                    Birthday Template
                                </label>
                                <textarea
                                    value={settings.birthday_template}
                                    onChange={(e) => setSettings({ ...settings, birthday_template: e.target.value })}
                                    className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-y"
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
                                    className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-y"
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
                                    className="w-full h-32 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors resize-y"
                                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                    placeholder="Enter template for one day event posts..."
                                />
                                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Use {"{name}"} for name and {"{phone}"} for the phone number.</p>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-color)' }} className="pt-6">
                            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                                <p className="font-semibold mb-1 flex items-center gap-2">
                                    <Users size={16} /> WhatsApp Group Targeting:
                                </p>
                                <p>Group settings have been moved! You can now configure Primary and Secondary groups for **each WhatsApp account individually** in the **WhatsApp Accounts** tab.</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'social' && (
                    <div className="space-y-6">
                        {/* Connection Status Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className={`p-4 rounded-lg border flex items-center justify-between ${
                                isFacebookConnected
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <Facebook size={24} className={isFacebookConnected ? 'text-emerald-400' : 'text-rose-400'} />
                                    <div>
                                        <h4 className="font-semibold text-sm">Facebook Status</h4>
                                        <p className="text-xs opacity-80">{settings.facebook_page_name || 'No page connected'}</p>
                                    </div>
                                </div>
                                <span className="text-lg font-bold">{isFacebookConnected ? 'Connected ✅' : 'Not Connected ❌'}</span>
                            </div>

                            <div className={`p-4 rounded-lg border flex items-center justify-between ${
                                isInstagramConnected
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <Instagram size={24} className={isInstagramConnected ? 'text-emerald-400' : 'text-rose-400'} />
                                    <div>
                                        <h4 className="font-semibold text-sm">Instagram Status</h4>
                                        <p className="text-xs opacity-80">{isInstagramConnected ? 'API Connected' : 'No account connected'}</p>
                                    </div>
                                </div>
                                <span className="text-lg font-bold">{isInstagramConnected ? 'Connected ✅' : 'Not Connected ❌'}</span>
                            </div>
                        </div>

                        {/* Facebook Settings */}
                        <div className="glass-card p-6 space-y-4">
                            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Facebook className="text-[#1877F2]" size={24} />
                                Facebook Settings
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                            Facebook Page ID
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.facebook_page_id}
                                            onChange={(e) => setSettings({ ...settings, facebook_page_id: e.target.value })}
                                            className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                            placeholder="Enter Facebook Page ID..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                            Facebook Page Name
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.facebook_page_name}
                                            onChange={(e) => setSettings({ ...settings, facebook_page_name: e.target.value })}
                                            className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                            placeholder="Enter Facebook Page Name..."
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Facebook Page Access Token
                                    </label>
                                    <input
                                        type="password"
                                        value={settings.facebook_access_token}
                                        onChange={(e) => setSettings({ ...settings, facebook_access_token: e.target.value })}
                                        className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="Enter Page Access Token..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Instagram Settings */}
                        <div className="glass-card p-6 space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                    <Instagram className="text-pink-500" size={24} />
                                    Instagram Settings
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.instagram_enabled}
                                        onChange={(e) => setSettings({ ...settings, instagram_enabled: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    <span className="ms-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Instagram Auto-Post Enabled</span>
                                </label>
                            </div>

                            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm mb-4">
                                <p className="font-semibold mb-1 flex items-center gap-1">🚀 Public Image URL Host Setup:</p>
                                <p>To auto-post to Instagram via API, public image URLs are required. Enter your ImgBB API key to host images temporarily when posting.</p>
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
                                        placeholder="Enter ImgBB API Key..."
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
                    </div>
                )}

                <div className="flex items-center justify-between pt-4 glass-card p-6">
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
    );
};

export default Settings;
