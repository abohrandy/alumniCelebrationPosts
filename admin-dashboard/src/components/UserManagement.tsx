import { useState, useEffect } from 'react';
import { Shield, UserCog, Trash2 } from 'lucide-react';
import axios from 'axios';

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    avatar_url: string | null;
    created_at: string;
}

function UserManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const changeRole = async (userId: number, newRole: string) => {
        try {
            await axios.patch(`/api/users/${userId}/role`, { role: newRole });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error('Failed to update role:', error);
        }
    };

    if (loading) {
        return <div className="text-slate-400 text-center py-12">Loading users...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <UserCog size={20} />
                    Team Members
                </h3>
                <span className="text-sm text-slate-400">{users.length} users</span>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-700/50">
                            <th className="text-left p-4 text-sm font-medium text-slate-400">User</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Email</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Role</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Joined</th>
                            <th className="text-left p-4 text-sm font-medium text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold">
                                                {user.name.charAt(0)}
                                            </div>
                                        )}
                                        <span className="text-white font-medium">{user.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-slate-400">{user.email}</td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-blue-500/20 text-blue-400'
                                        }`}>
                                        {user.role === 'admin' && <Shield size={12} />}
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4 text-sm text-slate-500">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td className="p-4">
                                    <select
                                        value={user.role}
                                        onChange={(e) => changeRole(user.id, e.target.value)}
                                        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:ring-primary focus:border-primary"
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="media">Media</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default UserManagement;
