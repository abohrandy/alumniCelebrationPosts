import { useState, useEffect } from 'react';
import { LayoutDashboard, CalendarDays, MessageSquare, Settings as SettingsIcon, Bell, History, UserCog, LogOut } from 'lucide-react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import Events from './components/Events';
import WhatsAppStatus from './components/WhatsAppStatus';
import Settings from './components/Settings';
import ActivityLogs from './components/ActivityLogs';
import UserManagement from './components/UserManagement';
import Login from './components/Login';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'media';
  avatar_url: string | null;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      if (res.data.authenticated) {
        setUser(res.data.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setAuthChecked(true);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onCheckAuth={checkAuth} />;
  }

  const isAdmin = user.role === 'admin';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'events': return <Events />;
      case 'activity': return isAdmin ? <ActivityLogs /> : <Dashboard />;
      case 'whatsapp': return <WhatsAppStatus />;
      case 'settings': return isAdmin ? <Settings /> : <Dashboard />;
      case 'users': return isAdmin ? <UserManagement /> : <Dashboard />;
      default: return <Dashboard />;
    }
  };

  const tabLabel = (tab: string) => {
    const labels: Record<string, string> = {
      dashboard: 'Dashboard',
      events: 'Events',
      activity: 'Activity Logs',
      whatsapp: 'WhatsApp Status',
      settings: 'Settings',
      users: 'User Management'
    };
    return labels[tab] || tab;
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 glass-sidebar flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
            MUAAFCT Poster
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            {isAdmin ? 'Admin' : 'Media'} Panel
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* Dashboard — visible to all */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>

          {/* Events — visible to all */}
          <button
            onClick={() => setActiveTab('events')}
            className={`w-full nav-link ${activeTab === 'events' ? 'active' : ''}`}
          >
            <CalendarDays size={20} />
            Events
          </button>

          {/* Activity Logs — admin only */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('activity')}
              className={`w-full nav-link ${activeTab === 'activity' ? 'active' : ''}`}
            >
              <History size={20} />
              Activity Logs
            </button>
          )}

          {/* WhatsApp Status — visible to all */}
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`w-full nav-link ${activeTab === 'whatsapp' ? 'active' : ''}`}
          >
            <MessageSquare size={20} />
            WhatsApp Status
          </button>

          {/* Settings — admin only */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            >
              <SettingsIcon size={20} />
              Settings
            </button>
          )}

          {/* User Management — admin only */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full nav-link ${activeTab === 'users' ? 'active' : ''}`}
            >
              <UserCog size={20} />
              User Management
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-700/50 space-y-2">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">{tabLabel(activeTab)}</h2>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-white glass-card">
              <Bell size={20} />
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}

export default App;
