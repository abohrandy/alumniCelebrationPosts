import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Send, X, Image, Calendar, Clock, Repeat, Eye } from 'lucide-react';
import axios from 'axios';

interface EventItem {
    id: number;
    title: string | null;
    full_name: string | null;
    phone_number: string | null;
    event_type: string;
    event_date: string | null;
    design_image_path: string;
    caption: string | null;
    message_template: string | null;
    schedule_type: string;
    repeat_interval_days: number | null;
    post_time: string | null;
    expiry_date: string | null;
    status: string;
    creator_name: string | null;
    created_at: string;
    whatsapp_profile_id: number | null;
    images?: Array<{ image_path: string; sort_order: number }>;
    captions?: Array<{ caption_text: string; sort_order: number }>;
}

interface WhatsAppProfile {
    id: number;
    name: string;
}

const isVideoFile = (path: string | null | undefined) => {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
};

const EVENT_TYPE_LABELS: Record<string, string> = {
    birthday: 'Birthday',
    wedding_anniversary: 'Wedding Anniversary',
    one_day_event: 'Single Day Event',
    monday_market: 'Recurrent Announcement',
    recurrent_announcement: 'Recurrent Announcement',
    announcement: 'Announcement'
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    birthday: 'bg-pink-500/20 text-pink-500',
    wedding_anniversary: 'bg-purple-500/20 text-purple-500',
    one_day_event: 'bg-amber-500/20 text-amber-500',
    monday_market: 'bg-emerald-500/20 text-emerald-500',
    recurrent_announcement: 'bg-emerald-500/20 text-emerald-500',
    announcement: 'bg-blue-500/20 text-blue-500'
};

interface EventsProps {
    initialShowForm?: boolean;
    initialFilter?: string;
}

function Events({ initialShowForm = false, initialFilter = 'all' }: EventsProps) {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [showForm, setShowForm] = useState(initialShowForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [filterType, setFilterType] = useState(initialFilter);
    const [sortBy, setBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [profiles, setProfiles] = useState<WhatsAppProfile[]>([]);


    // Form state
    const [eventType, setEventType] = useState('birthday');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [captions, setCaptions] = useState<string[]>(['']); // For Recurrent Announcements
    const [eventDate, setEventDate] = useState('');
    const [scheduleType, setScheduleType] = useState('single_date');
    const [repeatInterval, setRepeatInterval] = useState('');
    const [postTime, setPostTime] = useState('06:00');
    const [expiryDate, setExpiryDate] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [viewingEvent, setViewingEvent] = useState<EventItem | null>(null);

    useEffect(() => {
        fetchEvents();
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        try {
            const res = await axios.get('/api/whatsapp/profiles');
            setProfiles(res.data);
            // Default to first profile if available and creating new
            if (res.data.length > 0 && !editingId) {
                const defaultProfile = res.data.find((p: any) => p.is_default) || res.data[0];
                setSelectedProfileId(String(defaultProfile.id));
            }
        } catch (error) {
            console.error('Failed to fetch WhatsApp profiles:', error);
        }
    };

    const fetchEvents = async () => {
        try {
            const res = await axios.get('/api/events');
            setEvents(res.data);
        } catch (error) {
            console.error('Failed to fetch events:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEventType('birthday');
        setFullName('');
        setPhoneNumber('');
        setTitle('');
        setCaption('');
        setCaptions(['']);
        setEventDate('');
        setScheduleType('single_date');
        setRepeatInterval('');
        setPostTime('06:00');
        setExpiryDate('');
        setImageFiles([]);
        setPreviewUrls([]);
        setEditingId(null);
        if (profiles.length > 0) {
            const defaultProfile = profiles.find(p => (p as any).is_default) || profiles[0];
            setSelectedProfileId(String(defaultProfile.id));
        } else {
            setSelectedProfileId('');
        }
    };

    const openCreateForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = (event: EventItem) => {
        setEditingId(event.id);
        setEventType(event.event_type);
        setFullName(event.full_name || '');
        setPhoneNumber(event.phone_number || '');
        setTitle(event.title || '');
        setCaption(event.caption || event.message_template || '');
        setEventDate(event.event_date || '');
        setScheduleType(event.schedule_type || (event.event_type === 'monday_market' ? 'weekly' : 'single_date'));
        setRepeatInterval(event.repeat_interval_days ? String(event.repeat_interval_days) : '');
        setPostTime(event.post_time || '06:00');
        setExpiryDate(event.expiry_date || '');
        setPreviewUrls(event.design_image_path ? [`/${event.design_image_path}`] : []);
        setSelectedProfileId(event.whatsapp_profile_id ? String(event.whatsapp_profile_id) : '');
        
        if (event.captions && (event.event_type === 'recurrent_announcement' || event.event_type === 'monday_market')) {
            setCaptions(event.captions.map((c: any) => c.caption_text));
        } else {
            setCaptions(['']);
        }

        setShowForm(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            setImageFiles(files);
            const urls = files.map(file => URL.createObjectURL(file));
            setPreviewUrls(urls);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('event_type', eventType);
            formData.append('whatsapp_profile_id', selectedProfileId);

            if (eventType === 'birthday' || eventType === 'wedding_anniversary' || eventType === 'one_day_event') {
                formData.append('full_name', fullName);
                formData.append('phone_number', phoneNumber);
                formData.append('event_date', eventDate);
                formData.append('schedule_type', 'single_date');
                formData.append('post_time', '06:00');
            } else {
                formData.append('title', title);
                formData.append('schedule_type', scheduleType);
                formData.append('post_time', postTime);
                if (scheduleType === 'interval') {
                    formData.append('repeat_interval_days', repeatInterval);
                }
                if (expiryDate) formData.append('expiry_date', expiryDate);
            }

            if (eventType === 'recurrent_announcement' || eventType === 'monday_market') {
                captions.forEach(cap => {
                    if (cap.trim()) formData.append('captions', cap.trim());
                });
            } else {
                formData.append('caption', caption);
            }

            if (imageFiles.length > 0) {
                imageFiles.forEach(file => {
                    formData.append('design_image', file);
                });
            }

            if (editingId) {
                await axios.put(`/api/events/${editingId}`, formData);
            } else {
                await axios.post('/api/events', formData);
            }

            setShowForm(false);
            resetForm();
            fetchEvents();
        } catch (error: any) {
            console.error('Failed to save event:', error);
            const msg = error.response?.data?.error || error.message || 'Unknown error';
            alert('Failed to save event: ' + msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this event?')) return;
        try {
            await axios.delete(`/api/events/${id}`);
            fetchEvents();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const handlePostNow = async (id: number) => {
        try {
            await axios.post(`/api/events/${id}/post-now`);
            alert('Post request sent! Check activity logs.');
        } catch (error) {
            console.error('Failed to post:', error);
        }
    };

    const handleToggleStatus = async (id: number) => {
        try {
            const res = await axios.patch(`/api/events/${id}/status`);
            setEvents(prev => prev.map(e => e.id === id ? { ...e, status: res.data.status } : e));
        } catch (error) {
            console.error('Failed to toggle status:', error);
        }
    };

    const isPerson = eventType === 'birthday' || eventType === 'wedding_anniversary' || eventType === 'one_day_event';

    const filteredEvents = (filterType === 'all'
        ? events
        : filterType === 'recurring'
            ? events.filter(e => e.event_type === 'monday_market' || e.event_type === 'recurrent_announcement')
            : filterType === 'recurrent_announcement'
                ? events.filter(e => e.event_type === 'monday_market' || e.event_type === 'recurrent_announcement')
            : events.filter(e => e.event_type === filterType))
        .sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'created_at') {
                comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            } else if (sortBy === 'event_date') {
                const dateA = a.event_date ? new Date(a.event_date).getTime() : 0;
                const dateB = b.event_date ? new Date(b.event_date).getTime() : 0;
                comparison = dateA - dateB;
            } else if (sortBy === 'name') {
                const nameA = (a.full_name || a.title || '').toLowerCase();
                const nameB = (b.full_name || b.title || '').toLowerCase();
                comparison = nameA.localeCompare(nameB);
            } else if (sortBy === 'status') {
                comparison = a.status.localeCompare(b.status);
            }
            return sortOrder === 'desc' ? -comparison : comparison;
        });

    const getDisplayName = (event: EventItem) => {
        return event.full_name || event.title || event.event_type;
    };

    if (loading) {
        return <div className="text-slate-400 text-center py-12">Loading events...</div>;
    }

    return (
        <div className="space-y-4 lg:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="text-sm rounded-lg px-3 py-2"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                    <option value="all">All Events ({events.length})</option>
                    <option value="birthday">Birthdays</option>
                    <option value="wedding_anniversary">Weddings</option>
                    <option value="one_day_event">One Day Events</option>
                    <option value="recurrent_announcement">Recurrent Announcements</option>
                    <option value="announcement">Announcements</option>
                    <option value="recurring">Recurring (All)</option>
                </select>

                <div className="flex items-center gap-2">
                    <select
                        value={sortBy}
                        onChange={(e) => setBy(e.target.value)}
                        className="text-sm rounded-lg px-3 py-2"
                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                        <option value="created_at">Sort by: Date Created</option>
                        <option value="event_date">Sort by: Event Date</option>
                        <option value="name">Sort by: Name/Title</option>
                        <option value="status">Sort by: Status</option>
                    </select>

                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
                <button onClick={openCreateForm} className="btn-primary flex items-center justify-center gap-2">
                    <Plus size={18} />
                    New Event
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-5 mx-2 sm:mx-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {editingId ? 'Edit Event' : 'Create Event'}
                            </h3>
                            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ color: 'var(--text-secondary)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Event Type */}
                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Event Type</label>
                                <select
                                    value={eventType}
                                    onChange={(e) => {
                                        setEventType(e.target.value);
                                        const type = e.target.value;
                                        if (type === 'birthday' || type === 'wedding_anniversary' || type === 'one_day_event') {
                                            setScheduleType('single_date');
                                        } else if (type === 'monday_market' || type === 'recurrent_announcement') {
                                            setScheduleType('weekly');
                                        } else {
                                            setScheduleType('interval');
                                        }
                                    }}
                                    className="w-full rounded-lg px-3 py-2"
                                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                >
                                    <option value="birthday">🎂 Birthday</option>
                                    <option value="wedding_anniversary">💍 Wedding Anniversary</option>
                                    <option value="one_day_event">✨ One Day Event</option>
                                    <option value="recurrent_announcement">🔄 Recurrent Announcement</option>
                                    <option value="monday_market">📈 Monday Market</option>
                                    <option value="announcement">📢 Announcement</option>
                                </select>
                            </div>

                            {/* Dynamic fields based on type */}
                            {isPerson ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                            {eventType === 'one_day_event' ? 'Event Name' : 'Full Name'}
                                        </label>
                                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                                            placeholder={eventType === 'one_day_event' ? "Enter event name..." : "Enter person's name..."}
                                            className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} required />
                                    </div>
                                    {eventType !== 'one_day_event' && (
                                        <div>
                                            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Phone Number</label>
                                            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                                                className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                            <Calendar size={14} className="inline mr-1" />
                                            Event Date
                                        </label>
                                        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                                            className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} required />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Title</label>
                                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                            className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} required />
                                    </div>

                                    {(eventType === 'announcement' || eventType === 'recurrent_announcement' || eventType === 'monday_market') && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Schedule Type</label>
                                                <select
                                                    value={scheduleType}
                                                    onChange={(e) => setScheduleType(e.target.value)}
                                                    className="w-full rounded-lg px-3 py-2"
                                                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                                >
                                                    <option value="weekly">📅 Weekly (Every Monday)</option>
                                                    <option value="interval">🔄 Interval (Every X Days)</option>
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {scheduleType === 'interval' && (
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                                            <Repeat size={14} className="inline mr-1" />
                                                            Repeat Every (days)
                                                        </label>
                                                        <input type="number" min="1" value={repeatInterval} onChange={(e) => setRepeatInterval(e.target.value)}
                                                            className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} required />
                                                    </div>
                                                )}
                                                <div className={scheduleType === 'weekly' ? 'col-span-2' : ''}>
                                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                                        <Clock size={14} className="inline mr-1" />
                                                        Post Time
                                                    </label>
                                                    <input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)}
                                                        className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} required />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {eventType === 'monday_market' && (
                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-400">
                                            📅 Posts automatically every <strong>Monday at 5:00 AM</strong> to the First Group ONLY (Round Robin)
                                        </div>
                                    )}

                                    {(eventType === 'recurrent_announcement' || eventType === 'monday_market') && (
                                        <div className="space-y-3 mt-4">
                                            <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                                                <Send size={14} className="inline mr-1" />
                                                Text Variations (Round Robin)
                                            </label>
                                            {captions.map((cap, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <textarea
                                                        value={cap}
                                                        onChange={(e) => {
                                                            const newCaps = [...captions];
                                                            newCaps[idx] = e.target.value;
                                                            setCaptions(newCaps);
                                                        }}
                                                        placeholder={`Variation ${idx + 1}`}
                                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                                        style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', minHeight: '60px' }}
                                                    />
                                                    {captions.length > 1 && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => setCaptions(captions.filter((_, i) => i !== idx))}
                                                            className="p-2 h-10 self-center text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setCaptions([...captions, ''])}
                                                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
                                            >
                                                <Plus size={14} />
                                                Add Another Text Variation
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {(eventType === 'announcement' || eventType === 'recurrent_announcement') && (
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Expiry Date (Stop announcing after this date)</label>
                                    <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                                        className="w-full rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                                    <div className="mt-1 text-[10px] text-slate-500">
                                        Optional. The announcement will stop after this date.
                                    </div>
                                </div>
                            )}

                            {!(eventType === 'recurrent_announcement' || eventType === 'monday_market') && (
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Caption / Message</label>
                                    <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                                        placeholder={isPerson ? 'Leave empty for default template. Use {name} for celebrant name and {phone} for phone number.' : 'Enter post caption...'}
                                        className="w-full rounded-lg px-3 py-2 resize-y min-h-[80px]" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    <Image size={14} className="inline mr-1" />
                                    Design Image or Video {(eventType === 'monday_market' || eventType === 'recurrent_announcement') ? '(Select Multiple)' : ''}
                                </label>
                                <input type="file" accept="image/*,video/*"
                                    multiple={eventType === 'monday_market' || eventType === 'recurrent_announcement'}
                                    onChange={handleImageChange}
                                    className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:font-medium file:cursor-pointer"
                                    required={!editingId} />

                                {previewUrls.length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        {previewUrls.map((url, idx) => (
                                            <div key={idx} className="rounded-lg h-24 sm:h-32 overflow-hidden border border-slate-700 bg-slate-900">
                                                {imageFiles[idx]?.type.startsWith('video/') || (editingId && isVideoFile(url)) ? (
                                                    <video src={url} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={url} alt="Preview" className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* WhatsApp Profile Selection */}
                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Send using WhatsApp Account</label>
                                <select
                                    value={selectedProfileId}
                                    onChange={(e) => setSelectedProfileId(e.target.value)}
                                    className="w-full rounded-lg px-3 py-2"
                                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                >
                                    <option value="">App Default (Follow Primary Profile)</option>
                                    {profiles.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {profiles.length === 0 && (
                                    <p className="mt-1 text-[10px] text-amber-500 font-medium">
                                        ⚠️ No WhatsApp accounts found. Please add one in the WhatsApp Status tab.
                                    </p>
                                )}
                            </div>

                            {/* Submit */}
                            <button type="submit" disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm text-white transition-colors disabled:opacity-50"
                                style={{ backgroundColor: 'var(--color-primary)', cursor: submitting ? 'not-allowed' : 'pointer', position: 'relative', zIndex: 10 }}>
                                {submitting ? 'Saving...' : (editingId ? 'Update Event' : 'Create Event')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* View Modal */}
            {viewingEvent && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border border-white/10 shadow-2xl">
                        {/* Modal Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-black/40 backdrop-blur-xl border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${EVENT_TYPE_COLORS[viewingEvent.event_type]}`}>
                                    {viewingEvent.event_type === 'birthday' && <Calendar size={20} />}
                                    {viewingEvent.event_type === 'wedding_anniversary' && <Plus size={20} />}
                                    {(viewingEvent.event_type === 'monday_market' || viewingEvent.event_type === 'recurrent_announcement') && <Repeat size={20} />}
                                    {viewingEvent.event_type === 'announcement' && <Send size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-white leading-tight">{getDisplayName(viewingEvent)}</h3>
                                    <span className="text-xs text-slate-400">{EVENT_TYPE_LABELS[viewingEvent.event_type]}</span>
                                </div>
                            </div>
                            <button onClick={() => setViewingEvent(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-8">
                            {/* Images Section */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                                    {(viewingEvent?.images && viewingEvent.images.length > 1) ? `Image Variations (${viewingEvent.images.length})` : 'Design Image'}
                                </h4>
                                <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                                    {(viewingEvent?.images && viewingEvent.images.length > 0) ? (
                                        viewingEvent.images.map((img: any, idx: number) => (
                                            <div key={idx} className="relative flex-none w-full snap-center group">
                                                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                                                {isVideoFile(img.image_path) ? (
                                                    <video src={`/${img.image_path}`} controls className="relative w-full h-auto max-h-[60vh] object-contain bg-black rounded-xl border border-white/10 shadow-2xl" />
                                                ) : (
                                                    <img src={`/${img.image_path}`} alt="" className="relative w-full h-auto max-h-[60vh] object-contain bg-black/20 rounded-xl border border-white/10 shadow-2xl" />
                                                )}
                                                {viewingEvent.images && viewingEvent.images.length > 1 && (
                                                    <span className="absolute bottom-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] text-white font-bold border border-white/10">
                                                        VARIATION {idx + 1}
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        viewingEvent?.design_image_path ? (
                                            <div className="relative w-full group">
                                                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                                                {isVideoFile(viewingEvent.design_image_path) ? (
                                                    <video src={`/${viewingEvent.design_image_path}`} controls className="relative w-full h-auto max-h-[60vh] object-contain bg-black rounded-xl border border-white/10 shadow-2xl" />
                                                ) : (
                                                    <img src={`/${viewingEvent.design_image_path}`} alt="" className="relative w-full h-auto max-h-[60vh] object-contain bg-black/20 rounded-xl border border-white/10 shadow-2xl" />
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full h-48 bg-slate-900 rounded-xl flex items-center justify-center text-slate-500 border border-white/5 border-dashed">
                                                No visuals provided
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Event Details</h4>
                                    <div className="space-y-3">
                                        {viewingEvent.event_date && (
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="p-2 bg-white/5 rounded-lg text-primary"><Calendar size={16} /></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Event Date</p>
                                                    <p className="text-sm font-medium">{viewingEvent.event_date}</p>
                                                </div>
                                            </div>
                                        )}
                                        {viewingEvent.phone_number && (
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="p-2 bg-white/5 rounded-lg text-emerald-400"><Send size={16} /></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Phone Number</p>
                                                    <p className="text-sm font-medium">{viewingEvent.phone_number}</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3 text-slate-300">
                                            <div className="p-2 bg-white/5 rounded-lg text-emerald-500"><Plus size={16} /></div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase">WhatsApp Account</p>
                                                <p className="text-sm font-medium">
                                                    {viewingEvent.whatsapp_profile_id 
                                                        ? (profiles.find(p => p.id === viewingEvent.whatsapp_profile_id)?.name || `Profile #${viewingEvent.whatsapp_profile_id}`)
                                                        : "App Default (Follows Primary)"
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Schedule</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-slate-300">
                                            <div className="p-2 bg-white/5 rounded-lg text-blue-400"><Clock size={16} /></div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase">Post Time</p>
                                                <p className="text-sm font-medium">{viewingEvent.post_time || '06:00'}</p>
                                            </div>
                                        </div>
                                        {viewingEvent.schedule_type === 'interval' && (
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="p-2 bg-white/5 rounded-lg text-purple-400"><Repeat size={16} /></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Frequency</p>
                                                    <p className="text-sm font-medium">Every {viewingEvent.repeat_interval_days} days</p>
                                                </div>
                                            </div>
                                        )}
                                        {viewingEvent.expiry_date && (
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400"><Clock size={16} /></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 uppercase">Expiry Date</p>
                                                    <p className="text-sm font-medium text-pink-400">{viewingEvent.expiry_date}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Captions Section */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                                    {(viewingEvent?.captions && viewingEvent.captions.length > 1) ? `Text Variations (${viewingEvent.captions.length})` : 'Caption / Message Draft'}
                                </h4>
                                <div className="space-y-3">
                                    {(viewingEvent?.captions && viewingEvent.captions.length > 0) ? (
                                        viewingEvent.captions.map((cap: any, idx: number) => (
                                            <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 italic text-slate-300 text-sm leading-relaxed relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-2 text-slate-600 opacity-20 text-[10px] font-bold">VARIATION {idx + 1}</div>
                                                {cap.caption_text}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 italic text-slate-300 text-sm leading-relaxed relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-2 text-slate-600 opacity-20"><Send size={40} /></div>
                                            {(viewingEvent?.caption || viewingEvent?.message_template) || (
                                                <span className="text-slate-600">No caption provided. Using system default.</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="sticky bottom-0 p-4 bg-black/40 backdrop-blur-xl border-t border-white/10 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={() => setViewingEvent(null)}
                                className="px-6 py-2 rounded-lg text-sm font-medium border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => { openEditForm(viewingEvent!); setViewingEvent(null); }}
                                className="px-6 py-2 rounded-lg text-sm font-medium bg-primary hover:bg-primary-hover text-white transition-all shadow-lg hover:shadow-primary/20"
                            >
                                Edit Event
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Events List */}
            <div className="grid gap-3 lg:gap-4">
                {filteredEvents.length === 0 ? (
                    <div className="glass-card p-8 lg:p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                        No events found. Create your first event!
                    </div>
                ) : (
                    filteredEvents.map(event => (
                        <div key={event.id} className="glass-card p-3 lg:p-4 flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4 transition-colors">
                            {/* Image + Info row */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-slate-800" style={{ backgroundColor: 'var(--bg-card-solid)' }}>
                                    {event.design_image_path && (
                                        isVideoFile(event.design_image_path) ? (
                                            <div className="text-primary flex flex-col items-center">
                                                <Send size={24} />
                                                <span className="text-[10px] font-bold">VIDEO</span>
                                            </div>
                                        ) : (
                                            <img src={`/${event.design_image_path}`} alt="" className="w-full h-full object-cover" />
                                        )
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <h4 className="font-semibold truncate text-sm lg:text-base" style={{ color: 'var(--text-primary)' }}>{getDisplayName(event)}</h4>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] lg:text-[10px] font-medium ${EVENT_TYPE_COLORS[event.event_type] || 'bg-slate-500/20 text-slate-400'}`}>
                                            {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 lg:gap-3 text-[10px] lg:text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                        {event.event_date && <span>📅 {event.event_date}</span>}
                                        {event.schedule_type === 'weekly' && <span>🔄 Weekly</span>}
                                        {event.schedule_type === 'interval' && <span>🔄 Every {event.repeat_interval_days}d</span>}
                                        {event.expiry_date && <span className="text-pink-400 font-medium">⌛ Expires: {event.expiry_date}</span>}
                                        {event.creator_name && <span>by {event.creator_name}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Status + Actions */}
                            <div className="flex flex-col sm:items-end gap-2 pl-[60px] sm:pl-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        {event.status === 'active' ? 'Posting Active' : 'Posting Paused'}
                                    </span>
                                    <button
                                        onClick={() => handleToggleStatus(event.id)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${event.status === 'active' ? 'bg-emerald-500' : 'bg-slate-700'
                                            }`}
                                    >
                                        <span
                                            className={`${event.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                                                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                        />
                                    </button>
                                </div>

                                <div className="flex items-center gap-1 sm:gap-0.5 mt-1">
                                    <button onClick={() => setViewingEvent(event)}
                                        className="p-1.5 lg:p-2 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="View Details">
                                        <Eye size={14} />
                                        <span className="sm:hidden text-xs">View</span>
                                    </button>
                                    <button onClick={() => handlePostNow(event.id)}
                                        className="p-1.5 lg:p-2 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors flex items-center gap-1"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Post Now">
                                        <Send size={14} />
                                        <span className="sm:hidden text-xs">Post</span>
                                    </button>
                                    <button onClick={() => openEditForm(event)}
                                        className="p-1.5 lg:p-2 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors flex items-center gap-1"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Edit">
                                        <Edit size={14} />
                                        <span className="sm:hidden text-xs">Edit</span>
                                    </button>
                                    <button onClick={() => handleDelete(event.id)}
                                        className="p-1.5 lg:p-2 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title="Delete">
                                        <Trash2 size={14} />
                                        <span className="sm:hidden text-xs">Del</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Events;
