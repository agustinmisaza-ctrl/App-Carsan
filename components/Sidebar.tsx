
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, User } from '../types';
import { LayoutDashboard, FileText, Database, FolderOpen, X, LogOut, Users, Download, FileDiff, BarChart2, Upload, Cloud } from 'lucide-react';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isOpen, onClose, user, onLogout }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Capture the PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    // Load custom logo
    const savedLogo = localStorage.getItem('carsan_custom_logo');
    if (savedLogo) {
        setCustomLogo(savedLogo);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
        alert("To install, look for the 'Install' icon in your browser address bar.");
    }
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const elem = document.createElement('canvas');
                const maxWidth = 150; // Resize to reasonable logo width
                const scaleFactor = maxWidth / img.width;
                elem.width = maxWidth;
                elem.height = img.height * scaleFactor;
                
                const ctx = elem.getContext('2d');
                ctx?.drawImage(img, 0, 0, elem.width, elem.height);
                
                // Compress to JPEG with 0.8 quality
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
          // Resize image before saving to avoid LocalStorage Quota Exceeded
          const base64 = await resizeImage(file);
          setCustomLogo(base64);
          try {
              localStorage.setItem('carsan_custom_logo', base64);
          } catch (err) {
              alert("Storage is full! Could not save logo permanently. Try clearing some data or using a smaller image.");
          }
      } catch (err) {
          console.error("Error processing image", err);
          alert("Failed to process image.");
      }
  };

  const navItemClass = (view: ViewState) =>
    `group flex items-center space-x-3 w-full px-4 py-3 rounded-lg transition-all duration-200 relative ${
      currentView === view
        ? 'bg-slate-800 text-white font-medium shadow-md'
        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
    }`;

  const handleNavClick = (view: ViewState) => {
      onChangeView(view);
      onClose(); // Close sidebar on mobile after selection
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={onClose}
        />
      )}

      {/* Sidebar Drawer - Layout Fixed: md:relative to participate in flex flow */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col shadow-2xl md:shadow-none h-full`}>
        
        {/* Header / Logo */}
        <div className="h-24 flex items-center justify-between px-6 shrink-0 border-b border-slate-800/50">
          <div className="flex items-center gap-3.5 group cursor-pointer relative" title="Click to change logo" onClick={() => logoInputRef.current?.click()}>
              <input 
                  type="file" 
                  ref={logoInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleLogoUpload} 
              />
              
              {customLogo ? (
                  <img src={customLogo} alt="Logo" className="w-10 h-10 object-contain rounded bg-white/5 p-0.5 border border-slate-700" />
              ) : (
                  /* Default Fallback Logo */
                  <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 shadow-lg shadow-blue-500/20 rounded-lg">
                      <rect width="40" height="40" rx="8" fill="white"/>
                      <path d="M6 34V15L13 8V34H6Z" fill="#2563EB"/>
                      <path d="M15 34L15 8L20 13L25 8L25 34L20 29L15 34Z" fill="#2563EB"/>
                      <path d="M27 34V8L34 15V34H27Z" fill="#2563EB"/>
                  </svg>
              )}
              
              <div className="flex flex-col justify-center">
                  <span className="text-lg font-bold text-white tracking-tight leading-none">CARSAN</span>
                  <span className="text-[10px] font-bold text-blue-400 tracking-[0.1em] uppercase mt-1">Electric App</span>
              </div>

              {/* Hover Upload Hint */}
              <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded border border-slate-700">
                  <Upload className="w-4 h-4 text-white" />
              </div>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-4 mb-2 mt-2">Operations</div>
          
          <button
            onClick={() => handleNavClick(ViewState.DASHBOARD)}
            className={navItemClass(ViewState.DASHBOARD)}
          >
            {currentView === ViewState.DASHBOARD && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <LayoutDashboard className={`w-5 h-5 ${currentView === ViewState.DASHBOARD ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => handleNavClick(ViewState.CRM)}
            className={navItemClass(ViewState.CRM)}
          >
            {currentView === ViewState.CRM && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <Users className={`w-5 h-5 ${currentView === ViewState.CRM ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>CRM</span>
          </button>
          
          <button
            onClick={() => handleNavClick(ViewState.PROJECTS)}
            className={navItemClass(ViewState.PROJECTS)}
          >
            {currentView === ViewState.PROJECTS && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <FolderOpen className={`w-5 h-5 ${currentView === ViewState.PROJECTS ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Projects</span>
          </button>

          <button
            onClick={() => handleNavClick(ViewState.SERVICE)}
            className={navItemClass(ViewState.SERVICE)}
          >
            {currentView === ViewState.SERVICE && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <FileDiff className={`w-5 h-5 ${currentView === ViewState.SERVICE ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Change Orders</span>
          </button>

          <button
            onClick={() => handleNavClick(ViewState.ESTIMATE_NEW)}
            className={navItemClass(ViewState.ESTIMATE_NEW)}
          >
            {currentView === ViewState.ESTIMATE_NEW && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <FileText className={`w-5 h-5 ${currentView === ViewState.ESTIMATE_NEW ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Estimator</span>
          </button>

          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-4 mb-2 mt-6">Finance</div>

          <button
            onClick={() => handleNavClick(ViewState.PRICE_ANALYSIS)}
            className={navItemClass(ViewState.PRICE_ANALYSIS)}
          >
            {currentView === ViewState.PRICE_ANALYSIS && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <BarChart2 className={`w-5 h-5 ${currentView === ViewState.PRICE_ANALYSIS ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Price Analysis</span>
          </button>

          <button
            onClick={() => handleNavClick(ViewState.DATABASE)}
            className={navItemClass(ViewState.DATABASE)}
          >
            {currentView === ViewState.DATABASE && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <Database className={`w-5 h-5 ${currentView === ViewState.DATABASE ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Price Database</span>
          </button>
          <button
            onClick={() => handleNavClick(ViewState.CLOUD_DB)}
            className={navItemClass(ViewState.CLOUD_DB)}
          >
            {currentView === ViewState.CLOUD_DB && <div className="absolute left-0 top-3 bottom-3 w-1 bg-blue-500 rounded-r-full" />}
            <Cloud className={`w-5 h-5 ${currentView === ViewState.CLOUD_DB ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
            <span>Cloud Database</span>
          </button>

        </nav>

        {/* User Profile / Footer */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-900/50">
           <button 
                onClick={handleInstallClick}
                className="w-full mb-4 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold transition-colors border border-slate-700"
            >
                <Download className="w-3 h-3" />
                Install Desktop App
            </button>

           <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                       {user.avatarInitials}
                   </div>
                   <div className="overflow-hidden">
                       <p className="text-sm font-medium text-white truncate w-28">{user.name}</p>
                       <p className="text-[10px] text-slate-400 capitalize">{user.role}</p>
                   </div>
               </div>
               <button onClick={onLogout} className="text-slate-500 hover:text-red-400 transition-colors" title="Logout">
                   <LogOut className="w-4 h-4" />
               </button>
           </div>
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-3 border border-slate-700/50 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Miami-Dade</p>
                </div>
                <span className="text-[10px] text-slate-600">v1.3</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">NEC 2023 Compliant</p>
          </div>
        </div>
      </div>
    </>
  );
};
