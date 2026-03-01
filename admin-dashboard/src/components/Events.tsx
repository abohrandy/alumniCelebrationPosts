import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Send, X, Image, Calendar, Clock, Repeat } from 'lucide-react';
import axios from 'axios';

interface EventItem {
    id: number;
    title: string | null;
    first_name: string | null;
    second_name: string | null;
    phone_number: string | null;
    event_type: string;
    event_date: string | null;
    design_image_path: string;
    caption: string | null;
    message_template: string | null;
    schedule_type: string;
    repeat_interval_days: number | null;
    post_time: string | null;
    status: string;
    creator_name: string | null;
    created_at: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
    birthday: '🎂 Birthday',
    wedding_anniversary: '💍 Wedding Anniversary',
    monday_market: '🛒 Monday Market',
    announcement: '📢 Announcement'
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    birthday: 'bg-pink-500/20 text-pink-400',
    wedding_anniversary: 'bg-purple-500/20 text-purple-400',
    monday_market: 'bg-green-500/20 text-green-400',
    announcement: 'bg-blue-500/20 text-blue-400'
};

function Events() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [filterType, setFilterType] = useState('all');

    // Form state
    const [eventType, setEventType] = useState('birthday');
    const [firstName, setFirstName] = useState('');
    const [secondName, setSecondName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [scheduleType, setScheduleType] = useState('single_date');
    const [repeatInterval, setRepeatInterval] = useState('');
    const [postTime, setPostTime] = useState('06:00');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        fetchEvents();
    }, []);

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
        setFirstName('');
        setSecondName('');
        setPhoneNumber('');
        setTitle('');
        setCaption('');
        setEventDate('');
        setScheduleType('single_date');
        setRepeatInterval('');
        setPostTime('06:00');
        setImageFile(null);
        setPreviewUrl(null);
        setEditingId(null);
    };

    const openCreateForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = (event: EventItem) => {
        setEditingId(event.id);
        setEventType(event.event_type);
        setFirstName(event.first_name || '');
        setSecondName(event.second_name || '');
        setPhoneNumber(event.phone_number || '');
        setTitle(event.title || '');
        setCaption(event.caption || event.message_template || '');
        setEventDate(event.event_date || '');
        setScheduleType(event.schedule_type || 'single_date');
        setRepeatInterval(event.repeat_interval_days ? String(event.repeat_interval_days) : '');
        setPostTime(event.post_time || '06:00');
        setPreviewUrl(event.design_image_path ? `/${event.design_image_path}` : null);
        setShowForm(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const formData = new FormData();
            formData.append('event_type', eventType);

            if (eventType === 'birthday' || eventType === 'wedding_anniversary') {
                formData.append('first_name', firstName);
                formData.append('second_name', secondName);
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
            }

            formData.append('caption', caption);

            if (imageFile) {
                formData.append('design_image', imageFile);
            }

            if (editingId) {
                await axios.put(`/api/events/${editingId}`, formData);
            } else {
                await axios.post('/api/events', formData);
            }

            setShowForm(false);
            resetForm();
            fetchEvents();
        } catch (error) {
            console.error('Failed to save event:', error);
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

    const isPerson = eventType === 'birthday' || eventType === 'wedding_anniversary';

    const filteredEvents = filterType === 'all'
        ? events
        : events.filter(e => e.event_type === filterType);

    const getDisplayName = (event: EventItem) => {
        if (event.first_name) return `${event.first_name} ${event.second_name || ''}`.trim();
        return event.title || event.event_type;
    };

    if (loading) {
        return <div className="text-slate-400 text-center py-12">Loading events...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2"
                    >
                        <option value="all">All Events ({events.length})</option>
                        <option value="birthday">Birthdays</option>
                        <option value="wedding_anniversary">Weddings</option>
                        <option value="monday_market">Monday Market</option>
                        <option value="announcement">Announcements</option>
                    </select>
                </div>
                <button onClick={openCreateForm} className="btn-primary flex items-center gap-2">
                    <Plus size={18} />
                    New Event
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">
                                {editingId ? 'Edit Event' : 'Create Event'}
                            </h3>
                            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Event Type */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Event Type</label>
                                <select
                                    value={eventType}
                                    onChange={(e) => {
                                        setEventType(e.target.value);
                                        const type = e.target.value;
                                        if (type === 'birthday' || type === 'wedding_anniversary') {
                                            setScheduleType('single_date');
                                        } else if (type === 'monday_market') {
                                            setScheduleType('weekly');
                                            setPostTime('05:00');
                                        } else {
                                            setScheduleType('interval');
                                        }
                                    }}
                                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2"
                                >
                                    <option value="birthday">🎂 Birthday</option>
                                    <option value="wedding_anniversary">💍 Wedding Anniversary</option>
                                    <option value="monday_market">🛒 Monday Market</option>
                                    <option value="announcement">📢 Announcement</option>
                                </select>
                            </div>

                            {/* Dynamic fields based on type */}
                            {isPerson ? (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-1">First Name</label>
                                            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-1">Second Name</label>
                                            <input type="text" value={secondName} onChange={(e) => setSecondName(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Phone Number</label>
                                        <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">
                                            <Calendar size={14} className="inline mr-1" />
                                            Event Date
                                        </label>
                                        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                    </div>

                                    {eventType === 'announcement' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-1">
                                                    <Repeat size={14} className="inline mr-1" />
                                                    Repeat Every (days)
                                                </label>
                                                <input type="number" min="1" value={repeatInterval} onChange={(e) => setRepeatInterval(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-1">
                                                    <Clock size={14} className="inline mr-1" />
                                                    Post Time
                                                </label>
                                                <input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2" required />
                                            </div>
                                        </div>
                                    )}

                                    {eventType === 'monday_market' && (
                                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-400">
                                            📅 Posts automatically every <strong>Monday at 5:00 AM</strong>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Caption */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Caption / Message</label>
                                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                                    placeholder={isPerson ? 'Leave empty for default template. Use {name} for celebrant name.' : 'Enter post caption...'}
                                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 resize-none" />
                            </div>

                            {/* Image Upload */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">
                                    <Image size={14} className="inline mr-1" />
                                    Design Image
                                </label>
                                <input type="file" accept="image/*" onChange={handleImageChange}
                                    className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:font-medium file:cursor-pointer"
                                    required={!editingId} />
                                {previewUrl && (
                                    <img src={previewUrl} alt="Preview" className="mt-3 rounded-lg max-h-48 object-cover w-full" />
                                )}
                            </div>

                            {/* Submit */}
                            <button type="submit" disabled={submitting}
                                className="w-full btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50">
                                {submitting ? 'Saving...' : (editingId ? 'Update Event' : 'Create Event')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Events List */}
            <div className="grid gap-4">
                {filteredEvents.length === 0 ? (
                    <div className="glass-card p-12 text-center text-slate-500">
                        No events found. Create your first event!
                    </div>
                ) : (
                    filteredEvents.map(event => (
                        <div key={event.id} className="glass-card p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
                            {/* Image */}
                            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
                                {event.design_image_path && (
                                    <img src={`/${event.design_image_path}`} alt="" className="w-full h-full object-cover" />
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold text-white truncate">{getDisplayName(event)}</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${EVENT_TYPE_COLORS[event.event_type] || 'bg-slate-500/20 text-slate-400'}`}>
                                        {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    {event.event_date && <span>📅 {event.event_date}</span>}
                                    {event.schedule_type === 'weekly' && <span>🔄 Weekly</span>}
                                    {event.schedule_type === 'interval' && <span>🔄 Every {event.repeat_interval_days}d</span>}
                                    {event.creator_name && <span>by {event.creator_name}</span>}
                                </div>
                            </div>

                            {/* Status */}
                            <button
                                onClick={() => handleToggleStatus(event.id)}
                                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${event.status === 'active'
                                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                        : 'bg-slate-500/20 text-slate-400 hover:bg-slate-500/30'
                                    }`}
                            >
                                {event.status}
                            </button>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                <button onClick={() => handlePostNow(event.id)}
                                    className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                                    title="Post Now">
                                    <Send size={16} />
                                </button>
                                <button onClick={() => openEditForm(event)}
                                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                    title="Edit">
                                    <Edit size={16} />
                                </button>
                                <button onClick={() => handleDelete(event.id)}
                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Delete">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Events;
