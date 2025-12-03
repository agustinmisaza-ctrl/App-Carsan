import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, AlertCircle, ArrowRight, ShieldCheck, Key, Upload } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

// Initial default users
const INITIAL_USERS = [
    {
        id: '1',
        username: 'admin',
        password: 'admin123',
        name: 'Admin User',
        role: 'admin' as UserRole,
        avatarInitials: 'AD',
        mustChangePassword: false
    },
    {
        id: '2',
        username: 'carlos',
        password: 'temp123', // Temporary password
        name: 'Carlos S.',
        role: 'estimator' as UserRole,
        avatarInitials: 'CS',
        mustChangePassword: true // Forces password change
    },
    {
        id: '3',
        username: 'david',
        password: 'temp123', // Temporary password
        name: 'David M.',
        role: 'estimator' as UserRole,
        avatarInitials: 'DM',
        mustChangePassword: true
    }
];

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [view, setView] = useState<'LOGIN' | 'CHANGE_PASSWORD'>('LOGIN');
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // User Database State (Persistent)
  const [users, setUsers] = useState<typeof INITIAL_USERS>([]);

  // Change Password State
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Logo State
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      // Load Custom Logo
      const savedLogo = localStorage.getItem('carsan_custom_logo');
      if (savedLogo) setCustomLogo(savedLogo);

      // Load Users
      const savedUsers = localStorage.getItem('carsan_users');
      if (savedUsers) {
          try {
              setUsers(JSON.parse(savedUsers));
          } catch (e) {
              setUsers(INITIAL_USERS);
          }
      } else {
          setUsers(INITIAL_USERS);
          localStorage.setItem('carsan_users', JSON.stringify(INITIAL_USERS));
      }
  }, []);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const elem = document.createElement('canvas');
                const maxWidth = 200; // Slightly larger for login screen
                const scaleFactor = maxWidth / img.width;
                elem.width = maxWidth;
                elem.height = img.height * scaleFactor;
                
                const ctx = elem.getContext('2d');
                ctx?.drawImage(img, 0, 0, elem.width, elem.height);
                
                // Compress
                resolve(elem.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const base64 = await resizeImage(file);
          setCustomLogo(base64);
          try {
              localStorage.setItem('carsan_custom_logo', base64);
          } catch (err) {
              alert("Storage limit reached! Try clearing old data.");
          }
      } catch (err) {
          alert("Failed to process image.");
      }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      // Case-insensitive username match
      const userFound = users.find(u => 
          u.username.toLowerCase() === username.trim().toLowerCase() && 
          u.password === password
      );

      if (userFound) {
          if (userFound.mustChangePassword) {
              const userObj: User = {
                  id: userFound.id,
                  username: userFound.username,
                  name: userFound.name,
                  role: userFound.role,
                  avatarInitials: userFound.avatarInitials,
                  mustChangePassword: true
              };
              setPendingUser(userObj);
              setLoading(false);
              setView('CHANGE_PASSWORD');
          } else {
              onLogin({
                  id: userFound.id,
                  username: userFound.username,
                  name: userFound.name,
                  role: userFound.role,
                  avatarInitials: userFound.avatarInitials,
                  mustChangePassword: false
              });
          }
      } else {
        setError('Invalid credentials. Check username/password.');
        setLoading(false);
      }
    }, 600);
  };

  const handleChangePassword = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      if (newPassword.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
      }

      if (newPassword !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
      }

      setTimeout(() => {
          if (pendingUser) {
             // Update the persistent database
             const updatedUsers = users.map(u => {
                 if (u.id === pendingUser.id) {
                     return { ...u, password: newPassword, mustChangePassword: false };
                 }
                 return u;
             });
             
             setUsers(updatedUsers);
             localStorage.setItem('carsan_users', JSON.stringify(updatedUsers));

             // Log in
             onLogin({
                  ...pendingUser,
                  mustChangePassword: false
              });
          }
      }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header Section */}
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-blue-600/10 z-0"></div>
          <div className="relative z-10 flex flex-col items-center">
            
            <div 
                className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-lg mb-4 cursor-pointer group relative overflow-hidden"
                onClick={() => logoInputRef.current?.click()}
                title="Click to upload logo"
            >
                <input 
                    type="file" 
                    ref={logoInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                />
                
                {customLogo ? (
                    <img src={customLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                    /* Carsan Electric Logo (Refined M) */
                    <svg width="48" height="48" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 34V15L13 8V34H6Z" fill="#2563EB"/>
                        <path d="M15 34L15 8L20 13L25 8L25 34L20 29L15 34Z" fill="#2563EB"/>
                        <path d="M27 34V8L34 15V34H27Z" fill="#2563EB"/>
                    </svg>
                )}

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload className="w-6 h-6 text-white" />
                </div>
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight">CARSAN Electric App</h1>
            <p className="text-blue-200 text-sm mt-1">Professional Electrical Estimating</p>
          </div>
        </div>

        {/* Form Section */}
        <div className="p-8">
            {view === 'LOGIN' ? (
                <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <UserIcon className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                        placeholder="Enter username"
                        autoCapitalize="none"
                        required
                        />
                    </div>
                    </div>

                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                        placeholder="••••••••"
                        required
                        />
                    </div>
                    </div>

                    {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                    )}

                    <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                    {loading ? (
                        <span>Signing In...</span>
                    ) : (
                        <>
                        <span>Login to Dashboard</span>
                        <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleChangePassword} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 items-start">
                        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-bold text-amber-800">Security Update Required</h3>
                            <p className="text-xs text-amber-700 mt-1">You are using a temporary password. Please set a new, secure password to continue.</p>
                        </div>
                    </div>

                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Password</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                        placeholder="New password"
                        required
                        />
                    </div>
                    </div>

                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                        placeholder="Confirm new password"
                        required
                        />
                    </div>
                    </div>

                    {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                    )}

                    <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                    {loading ? (
                        <span>Updating...</span>
                    ) : (
                        <>
                        <span>Update Password & Login</span>
                        <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                    </button>
                </form>
            )}

          <div className="mt-8 pt-6 border-t border-slate-100">
             <div className="text-center text-xs text-slate-400">
                <p className="font-semibold mb-2">Default Credentials:</p>
                <div className="flex flex-col gap-2">
                    <span>Admin: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">admin</code> / <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">admin123</code></span>
                    <span>Estimator (Temp): <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">carlos</code> / <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">temp123</code></span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};