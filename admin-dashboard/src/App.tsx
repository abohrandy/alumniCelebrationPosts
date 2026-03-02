import { useState, useEffect } from 'react';
import { LayoutDashboard, CalendarDays, MessageSquare, Settings as SettingsIcon, Bell, History, UserCog, LogOut, Sun, Moon, Menu, X } from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Close sidebar on route change (mobile)
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFilter, setEventFilter] = useState('all');

  const handleTabChange = (tab: string, showForm: boolean = false, filter: string = 'all') => {
    setActiveTab(tab);
    setShowEventForm(showForm);
    setEventFilter(filter);
    setSidebarOpen(false);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onCheckAuth={checkAuth} />;
  }

  const isAdmin = user.role === 'admin';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard key="dashboard" onNavigate={handleTabChange} />;
      case 'events': return <Events key="events" initialShowForm={showEventForm} initialFilter={eventFilter} />;
      case 'activity': return isAdmin ? <ActivityLogs key="activity" /> : <Dashboard key="dashboard-fallback" onNavigate={handleTabChange} />;
      case 'whatsapp': return <WhatsAppStatus key="whatsapp" />;
      case 'settings': return isAdmin ? <Settings key="settings" /> : <Dashboard key="dashboard-fallback2" onNavigate={handleTabChange} />;
      case 'users': return isAdmin ? <UserManagement key="users" /> : <Dashboard key="dashboard-fallback3" onNavigate={handleTabChange} />;
      default: return <Dashboard key="dashboard-default" onNavigate={handleTabChange} />;
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
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        w-64 glass-sidebar flex flex-col fixed h-full z-30
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <img
              src="/logo-dark.png"
              alt="MUAAFCT Logo"
              className="w-10 h-10 rounded-lg object-contain"
              style={{ backgroundColor: theme === 'light' ? 'transparent' : 'rgba(255,255,255,0.1)', padding: '2px' }}
            />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                MUAAFCT Poster
              </h1>
              <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
                {isAdmin ? 'Admin' : 'Media'} Panel
              </span>
            </div>
          </div>
          {/* Close button on mobile */}
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button onClick={() => handleTabChange('dashboard')} className={`w-full nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button onClick={() => handleTabChange('events')} className={`w-full nav-link ${activeTab === 'events' ? 'active' : ''}`}>
            <CalendarDays size={20} /> Events
          </button>
          {isAdmin && (
            <button onClick={() => handleTabChange('activity')} className={`w-full nav-link ${activeTab === 'activity' ? 'active' : ''}`}>
              <History size={20} /> Activity Logs
            </button>
          )}
          <button onClick={() => handleTabChange('whatsapp')} className={`w-full nav-link ${activeTab === 'whatsapp' ? 'active' : ''}`}>
            <MessageSquare size={20} /> WhatsApp Status
          </button>
          {isAdmin && (
            <button onClick={() => handleTabChange('settings')} className={`w-full nav-link ${activeTab === 'settings' ? 'active' : ''}`}>
              <SettingsIcon size={20} /> Settings
            </button>
          )}
          {isAdmin && (
            <button onClick={() => handleTabChange('users')} className={`w-full nav-link ${activeTab === 'users' ? 'active' : ''}`}>
              <UserCog size={20} /> User Management
            </button>
          )}
        </nav>

        <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {theme === 'dark' ? 'Dark' : 'Light'} Mode
            </span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: theme === 'dark' ? '#818cf8' : '#f59e0b',
                border: `1px solid ${theme === 'dark' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              }}
            >
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 p-2 rounded-lg">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{user.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 p-4 lg:p-8 flex justify-between items-center glass-card rounded-none lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:shadow-none">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg" style={{ color: 'var(--text-primary)' }}>
              <Menu size={24} />
            </button>
            <h2 className="text-xl lg:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{tabLabel(activeTab)}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 glass-card" style={{ color: 'var(--text-secondary)' }}>
              <Bell size={20} />
            </button>
          </div>
        </header>

        <div className="p-4 lg:px-8 lg:pb-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
