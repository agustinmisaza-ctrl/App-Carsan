
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Login } from './components/Login';
import { Estimator } from './components/Estimator';
import { PriceDatabase } from './components/PriceDatabase';
import { ProjectList } from './components/ProjectList';
import { CRM } from './components/CRM';
import { ServiceModule } from './components/ServiceModule';
import { PriceAnalysis } from './components/PriceAnalysis';
import { AIAssistant } from './components/AIAssistant';
import { SharePointConnect } from './components/SharePointConnect';
import { ViewState, User, ProjectEstimate, MaterialItem, ServiceTicket, PurchaseRecord } from './types';

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
        console.log("Carsan Estimator v1.9.1 - Force Fix");
    }, []);

    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Application Data State
    const [projects, setProjects] = useState<ProjectEstimate[]>(() => loadState('carsan_projects', []));
    const [materials, setMaterials] = useState<MaterialItem[]>(() => loadState('carsan_materials', []));
    const [tickets, setTickets] = useState<ServiceTicket[]>(() => loadState('carsan_tickets', []));
    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => loadState('carsan_purchases', []));
    const [leads, setLeads] = useState<any[]>(() => loadState('carsan_leads', []));
    const [opportunities, setOpportunities] = useState<any[]>(() => loadState('carsan_opportunities', []));

    // Persist Data
    useEffect(() => localStorage.setItem('carsan_projects', JSON.stringify(projects)), [projects]);
    useEffect(() => localStorage.setItem('carsan_materials', JSON.stringify(materials)), [materials]);
    useEffect(() => localStorage.setItem('carsan_tickets', JSON.stringify(tickets)), [tickets]);
    useEffect(() => localStorage.setItem('carsan_purchases', JSON.stringify(purchases)), [purchases]);
    useEffect(() => localStorage.setItem('carsan_leads', JSON.stringify(leads)), [leads]);
    useEffect(() => localStorage.setItem('carsan_opportunities', JSON.stringify(opportunities)), [opportunities]);

    const handleLogin = (loggedInUser: User) => {
        setUser(loggedInUser);
    };

    const handleLogout = () => {
        setUser(null);
        setCurrentView(ViewState.DASHBOARD);
    };

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 max-w-7xl mx-auto">
                        <h1 className="text-3xl font-bold mb-6 text-slate-900">Dashboard</h1>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Finance Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Revenue Won (YTD)</h3>
                                <p className="text-2xl font-bold text-emerald-600">
                                    ${projects.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.contractValue || 0), 0).toLocaleString()}
                                </p>
                            </div>
                            
                            {/* Operations Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Active Projects</h3>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-3xl font-bold text-slate-900">{projects.filter(p => p.status === 'Ongoing').length}</p>
                                    <span className="text-xs text-slate-400">Ongoing</span>
                                </div>
                            </div>

                            {/* Estimating Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Pending Estimates</h3>
                                <p className="text-3xl font-bold text-blue-600">{projects.filter(p => p.status === 'Draft' || p.status === 'Sent').length}</p>
                            </div>

                            {/* Service Card */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs mb-2">Service Tickets</h3>
                                <p className="text-3xl font-bold text-slate-900">{tickets.filter(t => t.status !== 'Completed').length}</p>
                            </div>
                        </div>

                        {/* Action Items */}
                        <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Action Items: Follow Ups
                            </h3>
                            <div className="space-y-3">
                                {projects
                                    .filter(p => p.followUpDate && new Date(p.followUpDate) <= new Date() && !['Won', 'Lost', 'Completed'].includes(p.status))
                                    .map(p => (
                                        <div key={p.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{p.name}</p>
                                                <p className="text-xs text-orange-600">Due for follow up: {new Date(p.followUpDate!).toLocaleDateString()}</p>
                                            </div>
                                            <button className="text-xs bg-white border border-orange-200 text-orange-700 px-3 py-1.5 rounded font-bold hover:bg-orange-100">
                                                Contact Client
                                            </button>
                                        </div>
                                    ))}
                                {projects.filter(p => p.followUpDate && new Date(p.followUpDate) <= new Date() && !['Won', 'Lost', 'Completed'].includes(p.status)).length === 0 && (
                                    <p className="text-sm text-slate-400 italic">No pending follow-ups today.</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            case ViewState.PROJECTS:
                return <ProjectList 
                    projects={projects} 
                    setProjects={setProjects} 
                    onOpenProject={(p) => {
                        console.log("Opening project", p.name);
                        // In a real implementation, this would switch to Estimator view with this project loaded
                    }} 
                    tickets={tickets} 
                />;
            case ViewState.ESTIMATE_NEW:
                return <Estimator materials={materials} projects={projects} />;
            case ViewState.DATABASE:
                return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
            case ViewState.CRM:
                return <CRM leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} />;
            case ViewState.SERVICE:
                return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
            case ViewState.PRICE_ANALYSIS:
                return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} />;
            case ViewState.CLOUD_DB:
                return <SharePointConnect projects={projects} materials={materials} tickets={tickets} />;
            default:
                return <div className="p-8">View not found</div>;
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden">
            <Sidebar 
                currentView={currentView} 
                onChangeView={(view) => { setCurrentView(view); setIsSidebarOpen(false); }} 
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                user={user}
                onLogout={handleLogout}
            />
            <div className="flex-1 flex flex-col h-full overflow-hidden relative md:ml-64 transition-all duration-300">
                 {/* Mobile Header for Sidebar Toggle */}
                 <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
                    <span className="font-bold">CARSAN</span>
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-300 hover:text-white">Menu</button>
                 </div>
                 <main className="flex-1 overflow-y-auto custom-scrollbar">
                    {renderView()}
                 </main>
                 <AIAssistant projects={projects} materials={materials} tickets={tickets} />
            </div>
        </div>
    );
};
