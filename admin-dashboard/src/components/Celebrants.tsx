import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Calendar, Gift, Camera, X, Send } from 'lucide-react';
import axios from 'axios';

interface Celebrant {
    id: number;
    full_name: string;
    phone_number?: string;
    event_type: string;
    event_date: string;
    message_template?: string;
    design_image_path?: string;
    repeat_annually?: number | boolean;
}

const isVideoFile = (path: string | undefined) => {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
};

const Celebrants = () => {
    const [celebrants, setCelebrants] = useState<Celebrant[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        full_name: '',
        phone_number: '',
        event_type: 'birthday',
        event_date: '',
        message_template: '',
        design_image: null as File | null,
        repeat_annually: false
    });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [ratioWarning, setRatioWarning] = useState(false);
    const [sortBy, setSortBy] = useState('upcoming');
    const [postingIds, setPostingIds] = useState<number[]>([]);



    useEffect(() => {
        fetchCelebrants();
    }, []);

    const fetchCelebrants = async () => {
        try {
            const res = await axios.get('http://localhost:3000/api/celebrants');
            setCelebrants(res.data);
        } catch (error) {
            console.error('Failed to fetch:', error);
        }
    };

    const handleImageChange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({ ...formData, design_image: file });
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);

            const img = new Image();
            img.src = url;
            setRatioWarning(false); // keep state to avoid breaking hooks, just always false
        }
    };

    const handleEdit = (c: Celebrant) => {
        setFormData({
            full_name: c.full_name,
            phone_number: c.phone_number || '',
            event_type: c.event_type,
            event_date: c.event_date,
            message_template: c.message_template || '',
            design_image: null,
            repeat_annually: c.repeat_annually === 1 || c.repeat_annually === true
        });
        setPreviewUrl(c.design_image_path ? `http://localhost:3000/${c.design_image_path}` : null);
        setEditingId(c.id);
        setShowModal(true);
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        const data = new FormData();
        Object.keys(formData).forEach((k) => {
            const key = k as keyof typeof formData;
            if (formData[key] !== null) {
                data.append(key, formData[key] as string | Blob);
            }
        });

        try {
            if (editingId) {
                await axios.put(`http://localhost:3000/api/celebrants/${editingId}`, data);
            } else {
                await axios.post('http://localhost:3000/api/celebrants', data);
            }
            setShowModal(false);
            fetchCelebrants();
            resetForm();
        } catch (error) {
            alert('Failed to save celebrant');
        }
    };

    const resetForm = () => {
        setFormData({
            full_name: '',
            phone_number: '',
            event_type: 'birthday',
            event_date: '',
            message_template: '',
            design_image: null,
            repeat_annually: false
        });
        setEditingId(null);
        setPreviewUrl(null);
        setRatioWarning(false);
    };

    const handlePostNow = async (id: number) => {
        if (postingIds.includes(id)) return;

        if (window.confirm('Are you sure you want to send this post to WhatsApp right now?')) {
            setPostingIds(prev => [...prev, id]);
            try {
                await axios.post(`http://localhost:3000/api/celebrants/${id}/post-now`);
                alert('Post attempt initiated. Check the WhatsApp Logs module to see the status.');
                // Refresh list since status might have changed to inactive
                fetchCelebrants();
            } catch (error: any) {
                const errorMsg = error.response?.data?.error || 'Failed to initiate post now.';
                alert(errorMsg);
            } finally {
                setPostingIds(prev => prev.filter(pid => pid !== id));
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to delete this celebrant?')) {
            try {
                await axios.delete(`http://localhost:3000/api/celebrants/${id}`);
                fetchCelebrants();
            } catch (error) {
                alert('Failed to delete celebrant.');
            }
        }
    };

    const filtered = celebrants
        .filter((c: Celebrant) =>
            (c.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            if (sortBy === 'name') {
                return a.full_name.localeCompare(b.full_name);
            } else if (sortBy === 'type') {
                return a.event_type.localeCompare(b.event_type);
            } else if (sortBy === 'upcoming') {
                // Sorting by month and day, ignoring year for consistency (birthdays/anniversaries)
                const getMonthDay = (dateStr: string) => {
                    const date = new Date(dateStr);
                    // Use a fixed year to compare only month and day
                    return new Date(2000, date.getMonth(), date.getDate()).getTime();
                };
                const nowRaw = new Date();
                const now = new Date(2000, nowRaw.getMonth(), nowRaw.getDate()).getTime();
                
                const valA = getMonthDay(a.event_date);
                const valB = getMonthDay(b.event_date);
                
                // If the date has already passed this year, it's "further" away than one coming up next year
                const diffA = valA < now ? valA + 400 * 24 * 60 * 60 * 1000 : valA; 
                const diffB = valB < now ? valB + 400 * 24 * 60 * 60 * 1000 : valB;
                
                return diffA - diffB;
            }
            return 0;
        });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search alumni..."
                        className="w-full pl-10 pr-4 py-2 glass-card bg-slate-900/30 border-slate-700/50 focus:border-primary outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        className="flex-1 md:w-48 p-2.5 bg-slate-900/30 border border-slate-700/50 rounded-lg text-slate-300 outline-none focus:border-primary transition-all"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="upcoming">Upcoming First</option>
                        <option value="name">Name (A-Z)</option>
                        <option value="type">Event Type</option>
                    </select>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all"
                >
                    <Plus size={20} />
                    Add New Celebrant
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filtered.map((c) => (
                    <div key={c.id} className="glass-card p-5 group relative">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                                {c.design_image_path && (
                                    isVideoFile(c.design_image_path) ? (
                                        <div className="text-primary flex flex-col items-center">
                                            <Send size={24} />
                                            <span className="text-[10px] font-bold">VIDEO</span>
                                        </div>
                                    ) : (
                                        <img
                                            src={`http://localhost:3000/${c.design_image_path}`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    )
                                )}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-white text-lg">{c.full_name}</h4>
                                <div className="flex items-center gap-2 text-primary font-medium text-xs mt-1">
                                    {c.event_type === 'birthday' ? <Gift size={14} /> : c.event_type === 'one_day_event' ? <Calendar size={14} className="text-amber-400" /> : <Calendar size={14} />}
                                    {c.event_type === 'birthday' ? 'Birthday' : c.event_type === 'one_day_event' ? 'One Day Event' : 'Wedding Anniversary'}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{c.event_date}</p>
                            </div>
                            <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handlePostNow(c.id)} 
                                    title="Post Now" 
                                    disabled={postingIds.includes(c.id)}
                                    className={`p-2 rounded-lg transition-all ${
                                        postingIds.includes(c.id) 
                                        ? 'text-slate-500 bg-slate-800 cursor-not-allowed' 
                                        : 'text-green-400 hover:text-white hover:bg-green-500/20'
                                    }`}
                                >
                                    <Send size={16} className={postingIds.includes(c.id) ? 'animate-pulse' : ''} />
                                </button>
                                <button onClick={() => handleEdit(c)} title="Edit Details" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(c.id)} title="Delete Celebrant" className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-700/50 flex justify-between items-center sticky top-0 bg-slate-900/80 backdrop-blur-md z-10">
                            <h3 className="text-xl font-bold text-white">{editingId ? 'Edit Celebrant' : 'Add New Celebrant'}</h3>
                            <button onClick={() => { setShowModal(false); resetForm(); }} className="text-slate-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">
                                        {formData.event_type === 'one_day_event' ? 'Event Name' : 'Full Name'}
                                    </label>
                                    <input required type="text" className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none"
                                        placeholder={formData.event_type === 'one_day_event' ? "Enter event name..." : "Enter person's name..."}
                                        value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Event Type</label>
                                    <select className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none"
                                        value={formData.event_type} onChange={e => setFormData({ ...formData, event_type: e.target.value })}>
                                        <option value="birthday">Birthday</option>
                                        <option value="wedding_anniversary">Wedding Anniversary</option>
                                        <option value="one_day_event">One Day Event</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-400">Event Date</label>
                                    <input required type="date" className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none"
                                        value={formData.event_date} onChange={e => setFormData({ ...formData, event_date: e.target.value })} />
                                </div>
                            </div>
                            
                            {formData.event_type === 'one_day_event' && (
                                <div className="flex items-center gap-2 mt-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                    <input
                                        type="checkbox"
                                        id="repeatAnnually"
                                        checked={formData.repeat_annually}
                                        onChange={(e) => setFormData({ ...formData, repeat_annually: e.target.checked })}
                                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-primary focus:ring-primary"
                                    />
                                    <label htmlFor="repeatAnnually" className="text-sm text-slate-300">
                                        Repeat Event Annually
                                    </label>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-400">Custom Caption (Optional - Overrides default template)</label>
                                <textarea className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:border-primary outline-none resize-y min-h-[80px]"
                                    placeholder="Enter a personalized message for this celebrant. Use {name} for their name and {phone} for their phone number."
                                    value={formData.message_template} onChange={e => setFormData({ ...formData, message_template: e.target.value })} />
                            </div>

                            <div className="space-y-4">
                                <label className="text-sm font-medium text-slate-400">Design Image or Video (Any Size)</label>
                                <div className={`border-2 border-dashed ${ratioWarning ? 'border-yellow-500' : 'border-slate-700'} rounded-xl p-8 flex flex-col items-center justify-center bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer relative`}>
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageChange} accept="image/*,video/*" />
                                    {previewUrl ? (
                                        <div className="flex flex-col items-center w-full">
                                            <div className="max-w-[200px] w-full bg-slate-900 border-2 border-primary rounded-md overflow-hidden shadow-2xl relative">
                                                {formData.design_image?.type.startsWith('video/') || (editingId && isVideoFile(previewUrl)) ? (
                                                    <video src={previewUrl.startsWith('blob:') || previewUrl.startsWith('http') ? previewUrl : `http://localhost:3000/${previewUrl}`} controls className="w-full h-auto" />
                                                ) : (
                                                    <img src={previewUrl.startsWith('blob:') || previewUrl.startsWith('http') ? previewUrl : `http://localhost:3000/${previewUrl}`} className="w-full h-auto object-contain" />
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <Camera size={40} className="text-slate-600 mb-2" />
                                            <p className="text-sm text-slate-400">Click or drag to upload design</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-700/50 flex justify-end gap-3">
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-6 py-2 rounded-lg font-bold text-slate-400 hover:text-white transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all">
                                    {editingId ? 'Save Changes' : 'Save Celebrant'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Celebrants;
