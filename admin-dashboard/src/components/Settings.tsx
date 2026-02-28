import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, MessageCircle, Hash } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

const Settings = () => {
    const [settings, setSettings] = useState({
        whatsapp_group_id: '',
        birthday_template: '🎉 Happy Birthday {name}! Wishing you joy, success and many more years ahead.',
        anniversary_template: '💍 Happy Wedding Anniversary {name}! May your love continue to grow and your journey together be blessed.'
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
            const response = await axios.get(`${API_BASE_URL}/settings`);
            if (response.data) {
                setSettings(response.data);
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
            await axios.post(`${API_BASE_URL}/settings`, settings);
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
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <MessageCircle className="text-primary" size={24} />
                    Message Templates
                </h3>

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                Birthday Template
                            </label>
                            <textarea
                                value={settings.birthday_template}
                                onChange={(e) => setSettings({ ...settings, birthday_template: e.target.value })}
                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors resize-none"
                                placeholder="Enter template for birthday posts..."
                            />
                            <p className="mt-1 text-xs text-slate-500">Use {"{name}"} as a placeholder for the celebrant's name.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                Anniversary Template
                            </label>
                            <textarea
                                value={settings.anniversary_template}
                                onChange={(e) => setSettings({ ...settings, anniversary_template: e.target.value })}
                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors resize-none"
                                placeholder="Enter template for anniversary posts..."
                            />
                            <p className="mt-1 text-xs text-slate-500">Use {"{name}"} as a placeholder for the celebrant's name.</p>
                        </div>
                    </div>

                    <div className="border-t border-slate-700/50 pt-6">
                        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Hash className="text-primary" size={24} />
                            System Configuration
                        </h3>

                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                WhatsApp Group ID
                            </label>
                            <input
                                type="text"
                                value={settings.whatsapp_group_id}
                                onChange={(e) => setSettings({ ...settings, whatsapp_group_id: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
                                placeholder="e.g. 1234567890@g.us"
                            />
                            <p className="mt-1 text-xs text-slate-500">The unique identifier for the alumni group where posts will be sent.</p>
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
