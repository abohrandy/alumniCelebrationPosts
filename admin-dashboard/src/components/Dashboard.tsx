import React, { useState, useEffect } from 'react';
import { Users, Calendar, Wifi, ArrowUpRight, AlertCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';

const socket = io('http://localhost:3000');

const StatCard = ({ title, value, icon: Icon, color, secondary }: any) => (
    <div className="glass-card p-6 flex items-start justify-between">
        <div>
            <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-white">{value}</h3>
            {secondary && <p className="text-xs text-slate-500 mt-1">{secondary}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
            <Icon size={24} className={color.replace('bg-', 'text-')} />
        </div>
    </div>
);

const Dashboard = ({ setActiveTab }: any) => {
    const [stats, setStats] = React.useState({
        total: 0,
        today: 0,
        status: 'DISCONNECTED'
    });
    const [upcoming, setUpcoming] = React.useState([]);

    const fetchData = async () => {
        try {
            const [celebrantsRes, statusRes] = await Promise.all([
                axios.get('http://localhost:3000/api/celebrants'),
                axios.get('http://localhost:3000/api/whatsapp/status')
            ]);

            const celebrants = celebrantsRes.data;
            setStats(prev => ({
                ...prev,
                total: celebrants.length,
                status: statusRes.data.status
            }));
            setUpcoming(celebrants.slice(0, 4));
        } catch (error) {
            console.error('Failed to fetch dashboard data');
        }
    };

    React.useEffect(() => {
        fetchData();

        socket.on('stats_update', () => fetchData());
        socket.on('whatsapp_status', (data) => {
            setStats(prev => ({ ...prev, status: data.status }));
            AlbertCircle
        });

        return () => {
            socket.off('stats_update');
            socket.off('whatsapp_status');
        };
    }, []);
    return (
        <div className="space-y-8">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Total Celebrants"
                    value={stats.total.toString()}
                    icon={Users}
                    color="bg-primary"
                    secondary="Live count"
                />
                <StatCard
                    title="Scheduled Today"
                    value={stats.today.toString()}
                    icon={Calendar}
                    color="bg-emerald-500"
                    secondary="Starting 6:00 AM"
                />
                <StatCard
                    title="WhatsApp Status"
                    value={stats.status}
                    icon={Wifi}
                    color={stats.status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}
                    secondary={stats.status === 'CONNECTED' ? 'System Ready' : 'Connection Required'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Post Preview logic remains same for now or could be dynamic */}
                {/* ... existing preview block ... */}

                {/* Upcoming Celebrations */}
                <div className="glass-card">
                    <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">Upcoming Celebrations</h3>
                        <button onClick={() => setActiveTab('celebrants')} className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
                            View All <ArrowUpRight size={16} />
                        </button>
                    </div>
                    <div className="p-0">
                        {upcoming.map((event, i) => (
                            <div key={event.id} className={`p-4 flex items-center justify-between ${i !== upcoming.length - 1 ? 'border-b border-slate-700/30' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-primary">
                                        {event.first_name[0]}{event.second_name[0]}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{event.first_name} {event.second_name}</p>
                                        <p className="text-xs text-slate-500">{event.event_type}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
                                    {event.event_date.substring(5)}
                                </span>
                            </div>
                        ))}
                        {upcoming.length === 0 && (
                            <div className="p-12 text-center text-slate-500">No upcoming events</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
