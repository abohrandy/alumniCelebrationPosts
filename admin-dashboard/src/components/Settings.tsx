import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, MessageCircle, Users, Instagram } from 'lucide-react';
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
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm mb-6">
                            <p className="font-semibold mb-1 flex items-center gap-2">
                                <Users size={16} /> WhatsApp Group Targeting:
                            </p>
                            <p>Group settings have been moved! You can now configure Primary and Secondary groups for **each WhatsApp account individually** in the **WhatsApp Accounts** tab.</p>
                        </div>
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
