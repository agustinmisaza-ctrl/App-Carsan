
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { ProjectList } from './components/ProjectList';
import { Estimator } from './components/Estimator';
import { PriceDatabase } from './components/PriceDatabase';
import { CRM } from './components/CRM';
import { ServiceModule } from './components/ServiceModule';
import { PriceAnalysis } from './components/PriceAnalysis';
import { AIAssistant } from './components/AIAssistant';
import { SharePointConnect } from './components/SharePointConnect';
import { ViewState, User, ProjectEstimate, MaterialItem, ServiceTicket, Lead, PurchaseRecord } from './types';
import { getAllPurchaseRecords } from './services/sharepointService';

// Configuration constant
const RESET_APP = false;

// Generic Helper to load from LocalStorage
const loadState = <T,>(key: string, fallback: T): T => {
    if (RESET_APP) return fallback;
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error(`Failed to parse ${key} from storage`, e);
            return fallback;
        }
    }
    return fallback;
};

export const App: React.FC = () => {
    // Log Version for debugging
    useEffect(() => {
        console.log("Carsan Electric App v4.1 - Fix Currency Parsing");
    }, []);

    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Global State
    const [projects, setProjects] = useState<ProjectEstimate[]>(() => loadState('carsan_projects', []));
    const [materials, setMaterials] = useState<MaterialItem[]>(() => loadState('carsan_materials', []));
    const [tickets, setTickets] = useState<ServiceTicket[]>(() => loadState('carsan_tickets', []));
    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => loadState('carsan_purchases', []));
    const [leads, setLeads] = useState<Lead[]>(() => loadState('carsan_leads', []));
    const [opportunities, setOpportunities] = useState<any[]>(() => loadState('carsan_opportunities', []));

    // Persist Data
    useEffect(() => localStorage.setItem('carsan_projects', JSON.stringify(projects)), [projects]);
    useEffect(() => localStorage.setItem('carsan_materials', JSON.stringify(materials)), [materials]);
    useEffect(() => localStorage.setItem('carsan_tickets', JSON.stringify(tickets)), [tickets]);
    useEffect(() => localStorage.setItem('carsan_purchases', JSON.stringify(purchases)), [purchases]);
    useEffect(() => localStorage.setItem('carsan_leads', JSON.stringify(leads)), [leads]);
    useEffect(() => localStorage.setItem('carsan_opportunities', JSON.stringify(opportunities)), [opportunities]);

    // Load Purchase History from SharePoint on Mount
    useEffect(() => {
        const fetchCloudData = async () => {
            try {
                // In a real app, we would persist the site ID. 
                // For now, this relies on the user connecting in the Cloud DB tab, 
                // but we can check if purchases are empty and alert the user.
                if (purchases.length === 0) {
                    console.log("No local purchase history. Connect to Cloud DB to fetch.");
                }
            } catch (e) {
                console.error("Failed to auto-load cloud data", e);
            }
        };
        fetchCloudData();
    }, []);

    const handleLogin = (u: User) => {
        setUser(u);
        localStorage.setItem('carsan_user', JSON.stringify(u));
    };

    const handleLogout = () => {
        // Clear Microsoft session tokens
        import('./services/emailIntegration').then(m => m.signOut());
        setUser(null);
        localStorage.removeItem('carsan_user');
        setCurrentView(ViewState.DASHBOARD);
        window.location.reload();
    };

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 max-w-7xl mx-auto">
                        <h1 className="text-3xl font-bold mb-6 text-slate-900">Command Center</h1>
                        
                        {/* 1. Revenue Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Revenue Won (YTD)</h3>
                                <p className="text-2xl font-bold text-emerald-600">
                                    ${projects.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.contractValue || 0), 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Pipeline Value</h3>
                                <p className="text-2xl font-bold text-blue-600">
                                    ${projects.filter(p => p.status === 'Draft' || p.status === 'Sent').reduce((sum, p) => sum + (p.contractValue || 0), 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Service Revenue</h3>
                                <p className="text-2xl font-bold text-indigo-600">
                                    ${tickets.filter(t => t.status === 'Authorized' || t.status === 'Completed').reduce((sum, t) => {
                                        const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
                                        const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
                                        return sum + mat + lab;
                                    }, 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Purchase Spend</h3>
                                <p className="text-2xl font-bold text-slate-700">
                                    ${purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            
                            {/* 2. Action Items (Follow Ups) */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span> Projects Due for Follow-Up
                                </h3>
                                <div className="space-y-3">
                                    {projects
                                        .filter(p => p.followUpDate && new Date(p.followUpDate) <= new Date() && !['Won', 'Lost', 'Completed'].includes(p.status))
                                        .map(p => (
                                            <div key={p.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100 hover:bg-orange-100 transition cursor-pointer" onClick={() => { setCurrentView(ViewState.PROJECTS); }}>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{p.name}</p>
                                                    <p className="text-xs text-orange-700">Due: {new Date(p.followUpDate!).toLocaleDateString()} • {p.client}</p>
                                                </div>
                                                <button className="text-xs bg-white border border-orange-200 text-orange-700 px-3 py-1.5 rounded font-bold hover:shadow-sm">
                                                    Open
                                                </button>
                                            </div>
                                        ))}
                                    {projects.filter(p => p.followUpDate && new Date(p.followUpDate) <= new Date() && !['Won', 'Lost', 'Completed'].includes(p.status)).length === 0 && (
                                        <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                            No pending follow-ups today. Great job!
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. Operational Snapshot */}
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-4">Operations</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-600">Active Projects (Ongoing)</span>
                                            <span className="font-bold text-slate-900 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs">
                                                {projects.filter(p => p.status === 'Ongoing').length}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-600">Pending Change Orders</span>
                                            <span className="font-bold text-slate-900 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                                                {tickets.filter(t => t.status === 'Sent').length}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-600">Open Leads</span>
                                            <span className="font-bold text-slate-900 bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs">
                                                {leads.length}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
                                    <h3 className="font-bold text-lg mb-2">Quick Actions</h3>
                                    <div className="space-y-2">
                                        <button onClick={() => setCurrentView(ViewState.ESTIMATE_NEW)} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg text-sm transition">
                                            + New Estimate
                                        </button>
                                        <button onClick={() => setCurrentView(ViewState.SERVICE)} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg text-sm transition">
                                            + New Change Order
                                        </button>
                                        <button onClick={() => setCurrentView(ViewState.CRM)} className="w-full text-left px-3 py-2 hover:bg-white/10 rounded-lg text-sm transition">
                                            + Add CRM Lead
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case ViewState.PROJECTS:
                return (
                  <ProjectList 
                      projects={projects} 
                      setProjects={setProjects} 
                      tickets={tickets} 
                      onOpenProject={(p) => {
                          // In full app, this might route to a specific ID
                      }} 
                  />
                );
            case ViewState.ESTIMATE_NEW:
                return <Estimator materials={materials} projects={projects} />;
            case ViewState.DATABASE:
                return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
            case ViewState.CRM:
                return <CRM leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} projects={projects} />;
            case ViewState.SERVICE:
                return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
            case ViewState.PRICE_ANALYSIS:
                return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} projects={projects} />;
            case ViewState.CLOUD_DB:
                return <SharePointConnect projects={projects} materials={materials} tickets={tickets} />;
            default:
                return <div>View Not Found</div>;
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
            <Sidebar 
                currentView={currentView} 
                onChangeView={setCurrentView} 
                isOpen={isSidebarOpen} 
                onClose={() => setIsSidebarOpen(false)} 
                user={user} 
                onLogout={handleLogout} 
            />
            
            <main className="flex-1 flex flex-col relative overflow-hidden md:ml-64 transition-all duration-300">
                {/* Mobile Header Trigger */}
                <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <span className="font-bold">CARSAN Electric</span>
                    <button onClick={() => setIsSidebarOpen(true)}>Menu</button>
                </div>

                <div className="flex-1 overflow-auto">
                    {renderView()}
                </div>

                <AIAssistant projects={projects} materials={materials} tickets={tickets} />
            </main>
        </div>
    );
};
