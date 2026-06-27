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
        facebook_app_id: '',
        facebook_app_secret: '',
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
                    facebook_app_id: response.data.facebook_app_id || '',
                    facebook_app_secret: response.data.facebook_app_secret || '',
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

    const [connectingFb, setConnectingFb] = useState(false);
    const [fbPages, setFbPages] = useState<any[]>([]);
    const [showPagesModal, setShowPagesModal] = useState(false);
    const [tempUserToken, setTempUserToken] = useState('');

    const handleManualTokenExchange = () => {
        if (!tempUserToken.trim()) return;
        setConnectingFb(true);
        axios.post('/api/settings/facebook/exchange', { userAccessToken: tempUserToken.trim() })
            .then(res => {
                if (res.data.pages && res.data.pages.length > 0) {
                    setFbPages(res.data.pages);
                    setShowPagesModal(true);
                    setTempUserToken('');
                } else {
                    alert('No Facebook Pages found managed by your account.');
                }
            })
            .catch(err => {
                console.error('Failed to exchange token:', err);
                alert(err.response?.data?.error || 'Failed to exchange Facebook token.');
            })
            .finally(() => {
                setConnectingFb(false);
            });
    };

    const handleConnectFacebook = () => {
        if (!settings.facebook_app_id.trim() || !settings.facebook_app_secret.trim()) {
            alert('Please enter your Facebook App ID and App Secret first, and save the settings.');
            return;
        }

        const startFbLogin = () => {
            const FB = (window as any).FB;
            if (!FB) {
                alert('Facebook SDK could not be loaded. Please disable any ad blockers (like uBlock Origin, Brave Shield, or Privacy Badger) which block Facebook tracking scripts, and try again.');
                setConnectingFb(false);
                return;
            }

            // Dynamically re-initialize Facebook SDK with the configured App ID
            FB.init({
                appId      : settings.facebook_app_id.trim(),
                cookie     : true,
                xfbml      : true,
                version    : 'v20.0'
            });

            FB.login((response: any) => {
                if (response.authResponse) {
                    const userToken = response.authResponse.accessToken;
                    axios.post('/api/settings/facebook/exchange', { userAccessToken: userToken })
                        .then(res => {
                            if (res.data.pages && res.data.pages.length > 0) {
                                setFbPages(res.data.pages);
                                setShowPagesModal(true);
                            } else {
                                alert('No Facebook Pages found managed by your account.');
                            }
                        })
                        .catch(err => {
                            console.error('Failed to exchange token:', err);
                            alert(err.response?.data?.error || 'Failed to exchange Facebook token.');
                        })
                        .finally(() => {
                            setConnectingFb(false);
                        });
                } else {
                    alert('Connection cancelled or not fully authorized.');
                    setConnectingFb(false);
                }
            }, {
                scope: 'public_profile,pages_show_list,pages_manage_posts,pages_manage_metadata,pages_read_engagement,instagram_basic,instagram_content_publish,business_management'
            });
        };

        setConnectingFb(true);
        if (!(window as any).FB) {
            console.log('FB SDK not found on window. Injecting script dynamically...');
            const id = 'facebook-jssdk';
            if (document.getElementById(id)) {
                // Already in DOM but maybe not loaded yet. Let's try after a delay.
                setTimeout(startFbLogin, 1000);
                return;
            }
            const js = document.createElement('script');
            js.id = id;
            js.src = "https://connect.facebook.net/en_US/sdk.js";
            js.onload = () => {
                setTimeout(startFbLogin, 500);
            };
            js.onerror = () => {
                alert('Facebook SDK script was blocked from loading. Please disable any ad blockers/trackers and refresh the page.');
                setConnectingFb(false);
            };
            const fjs = document.getElementsByTagName('script')[0];
            fjs.parentNode?.insertBefore(js, fjs);
        } else {
            startFbLogin();
        }
    };

    const saveSettings = async (updated: typeof settings) => {
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });
            await axios.post('/api/settings', updated);
            setMessage({ type: 'success', text: 'Settings saved and connected successfully!' });
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to auto-save settings.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSelectPage = (page: any) => {
        const updated = {
            ...settings,
            facebook_page_id: page.id,
            facebook_page_name: page.name,
            facebook_access_token: page.access_token,
            instagram_business_id: page.instagram ? page.instagram.id : settings.instagram_business_id,
            instagram_access_token: page.instagram ? page.access_token : settings.instagram_access_token
        };
        setSettings(updated);
        setShowPagesModal(false);
        saveSettings(updated);
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
                            
                            <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm mb-4">
                                <p className="font-semibold mb-1 flex items-center gap-1">🔑 Automated Credentials & Token Setup:</p>
                                <p>To automatically link pages and generate permanent access tokens, enter your Facebook App ID and App Secret, save, and then click <strong>Connect Facebook & Instagram</strong>.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Facebook App ID
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.facebook_app_id}
                                        onChange={(e) => setSettings({ ...settings, facebook_app_id: e.target.value })}
                                        className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="Enter Facebook App ID (Default: 461695913915110)..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                        Facebook App Secret
                                    </label>
                                    <input
                                        type="password"
                                        value={settings.facebook_app_secret}
                                        onChange={(e) => setSettings({ ...settings, facebook_app_secret: e.target.value })}
                                        className="w-full rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11"
                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        placeholder="Enter Facebook App Secret..."
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex justify-start">
                                    <button
                                        type="button"
                                        onClick={handleConnectFacebook}
                                        disabled={connectingFb}
                                        className="px-6 py-3 rounded-lg text-white font-medium hover:scale-105 transition-all duration-200"
                                        style={{ backgroundColor: '#1877F2' }}
                                    >
                                        {connectingFb && !tempUserToken.trim() ? 'Connecting to Meta...' : 'Connect Facebook & Instagram'}
                                    </button>
                                </div>
                                
                                <div className="flex items-center gap-2 text-xs text-slate-500 my-1">
                                    <hr className="flex-1 border-slate-700/50" />
                                    <span>OR USE MANUAL TOKEN BACKUP</span>
                                    <hr className="flex-1 border-slate-700/50" />
                                </div>

                                <div className="space-y-2 rounded-lg bg-slate-800/20 border border-slate-700/40 p-4">
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                        Manual User Access Token
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={tempUserToken}
                                            onChange={(e) => setTempUserToken(e.target.value)}
                                            className="flex-1 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary transition-colors h-11 text-sm"
                                            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                            placeholder="Paste temporary User Access Token from Graph API Explorer..."
                                        />
                                        <button
                                            type="button"
                                            onClick={handleManualTokenExchange}
                                            disabled={connectingFb || !tempUserToken.trim()}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors h-11"
                                        >
                                            {connectingFb && tempUserToken.trim() ? 'Fetching...' : 'Fetch Pages'}
                                        </button>
                                    </div>
                                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                        Generate a temporary user access token at the <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta Graph API Explorer</a>. Ensure you select your App and request scopes: <code>pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish, business_management</code>.
                                    </p>
                                </div>
                            </div>

                            <hr className="border-slate-700/50 my-4" />

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

            {showPagesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="glass-card max-w-lg w-full p-6 space-y-4" style={{ backgroundColor: 'var(--bg-card-solid)', border: '1px solid var(--border-color)' }}>
                        <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Select Facebook Page</h3>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Choose the Facebook Page you want to post to. Connected Instagram Business accounts will be linked automatically.
                        </p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {fbPages.map(page => (
                                <button
                                    key={page.id}
                                    type="button"
                                    onClick={() => handleSelectPage(page)}
                                    className="w-full text-left p-4 rounded-xl border transition-all hover:bg-slate-700/30 flex justify-between items-center"
                                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
                                >
                                    <div>
                                        <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{page.name}</div>
                                        <div className="text-xs text-slate-500">ID: {page.id}</div>
                                    </div>
                                    {page.instagram ? (
                                        <span className="text-xs bg-pink-500/10 text-pink-300 px-2.5 py-1 rounded-full border border-pink-500/20 flex items-center gap-1">
                                            <Instagram size={12} />
                                            Connected Business IG
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-500">No IG linked</span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setShowPagesModal(false)}
                                className="px-4 py-2 rounded-lg text-sm transition-all hover:bg-slate-700/50"
                                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
