import { useEffect, useState } from 'react';

interface LoginProps {
    onCheckAuth: () => void;
}

function Login({ onCheckAuth }: LoginProps) {
    const [theme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        if (theme === 'light') {
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
        }
    }, [theme]);

    return (
        <div
            className="min-h-screen flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg)' }}
        >
            <div className="glass-card p-10 w-full max-w-md text-center space-y-8">
                <div className="space-y-4">
                    <img
                        src="/logo-dark.png"
                        alt="MUAAFCT Logo"
                        className="w-20 h-20 mx-auto rounded-xl object-contain"
                        style={{
                            backgroundColor: theme === 'light' ? 'transparent' : 'rgba(255,255,255,0.1)',
                            padding: '4px'
                        }}
                    />
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                        MUAAFCT Poster
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Multi-Event Posting Platform
                    </p>
                </div>

                <a
                    href="/api/auth/google"
                    className="inline-flex items-center gap-3 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 hover:scale-105"
                    style={{
                        backgroundColor: 'var(--bg-card-solid)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 4px 6px -1px var(--shadow-color)',
                    }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.97h3.86c2.26-2.09 3.56-5.17 3.56-8.79z" />
                        <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.97c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.07c1.97 3.92 6.02 6.61 10.71 6.61z" />
                        <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29v-3.07h-3.98a11.86 11.86 0 000 10.72l3.98-3.07z" />
                        <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42c-2.07-1.94-4.78-3.13-8.02-3.13-4.69 0-8.74 2.69-10.71 6.61l3.98 3.07c.95-2.85 3.6-4.93 6.73-4.93z" />
                    </svg>
                    Sign in with Google
                </a>

                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Only authorized team members can access this platform
                </p>
            </div>
        </div>
    );
}

export default Login;
