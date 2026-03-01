import { useState } from 'react';
import { Chrome } from 'lucide-react';

interface LoginProps {
    onCheckAuth: () => void;
}

function Login({ onCheckAuth }: LoginProps) {
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = () => {
        setLoading(true);
        window.location.href = '/api/auth/google';
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="glass-card p-10 w-full max-w-md text-center space-y-8">
                <div className="space-y-3">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                        MUAAFCT Poster
                    </h1>
                    <p className="text-slate-400 text-sm">
                        Multi-Event Posting Platform
                    </p>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-gray-800 font-medium rounded-xl hover:bg-gray-100 transition-all duration-200 disabled:opacity-50"
                    >
                        <Chrome size={20} />
                        {loading ? 'Redirecting...' : 'Sign in with Google'}
                    </button>
                </div>

                <p className="text-xs text-slate-500">
                    Only authorized team members can access this platform.
                </p>
            </div>
        </div>
    );
}

export default Login;
