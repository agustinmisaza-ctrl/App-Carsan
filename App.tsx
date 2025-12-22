
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
import { ViewState, User, ProjectEstimate, MaterialItem, ServiceTicket, Lead, PurchaseRecord, AuditLog } from './types';
import { robustParseDate } from './utils/purchaseData';
import { Calendar, Filter } from 'lucide-react';
import { fetchSqlProjects, fetchSqlMaterials, fetchSqlTickets } from './services/sqlService';

const RESET_APP = false;

const loadState = <T,>(key: string, fallback: T): T => {
    if (RESET_APP) return fallback;
    const saved = localStorage.getItem(key);
    if (saved) { try { return JSON.parse(saved); } catch (e) { return fallback; } }
    return fallback;
};

export const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [dashboardFilter, setDashboardFilter] = useState<'YTD' | 'ALL'>('YTD');
    const [isSqlConnected, setIsSqlConnected] = useState(false);

    const [projects, setProjects] = useState<ProjectEstimate[]>(() => loadState('carsan_projects', []));
    const [materials, setMaterials] = useState<MaterialItem[]>(() => loadState('carsan_materials', []));
    const [tickets, setTickets] = useState<ServiceTicket[]>(() => loadState('carsan_tickets', []));
    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => loadState('carsan_purchases', []));
    const [leads, setLeads] = useState<Lead[]>(() => loadState('carsan_leads', []));
    const [opportunities, setOpportunities] = useState<any[]>(() => loadState('carsan_opportunities', []));
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadState('carsan_audit_logs', []));

    const currentYear = new Date().getFullYear();

    // --- SQL & DATA LOAD ON STARTUP ---
    useEffect(() => {
        const initData = async () => {
            try {
                // Attempt to fetch from SQL Server Middleware
                // If this fails, we fall back to LocalStorage (already loaded in useState initializers)
                const sqlProjects = await fetchSqlProjects();
                console.log("Connected to SQL Server. Loaded projects:", sqlProjects.length);
                setProjects(sqlProjects);
                
                // You would add fetchSqlMaterials and fetchSqlTickets here similarly
                
                setIsSqlConnected(true);
            } catch (e) {
                console.log("SQL Server not detected. Running in LocalStorage mode.");
                setIsSqlConnected(false);
            }

            // Auto-repair existing data formats
            const repairDates = () => {
                let changed = false;
                
                const repairedProjects = projects.map(p => {
                    const cleanDate = robustParseDate(p.dateCreated).toISOString();
                    if (p.dateCreated !== cleanDate) { changed = true; return { ...p, dateCreated: cleanDate }; }
                    return p;
                });

                if (changed) {
                    setProjects(repairedProjects);
                }
            };
            repairDates();
        };

        initData();
    }, []); 

    useEffect(() => localStorage.setItem('carsan_projects', JSON.stringify(projects)), [projects]);
    useEffect(() => localStorage.setItem('carsan_materials', JSON.stringify(materials)), [materials]);
    useEffect(() => localStorage.setItem('carsan_tickets', JSON.stringify(tickets)), [tickets]);
    useEffect(() => localStorage.setItem('carsan_purchases', JSON.stringify(purchases)), [purchases]);
    useEffect(() => localStorage.setItem('carsan_leads', JSON.stringify(leads)), [leads]);
    useEffect(() => localStorage.setItem('carsan_opportunities', JSON.stringify(opportunities)), [opportunities]);
    useEffect(() => localStorage.setItem('carsan_audit_logs', JSON.stringify(auditLogs)), [auditLogs]);

    const logActivity = (action: string, details: string) => {
        if (!user) return;
        const log: AuditLog = {
            id: Date.now().toString(),
            userId: user.id,
            userName: user.name,
            action,
            details,
            timestamp: new Date().toISOString()
        };
        setAuditLogs(prev => [log, ...prev].slice(0, 100));
    };

    const handleLogin = (u: User) => { setUser(u); localStorage.setItem('carsan_user', JSON.stringify(u)); logActivity('Login', 'User logged in'); };
    const handleLogout = () => { 
        import('./services/emailIntegration').then(m => m.signOut()); 
        setUser(null); localStorage.removeItem('carsan_user'); setCurrentView(ViewState.DASHBOARD); window.location.reload(); 
    };

    if (!user) return <Login onLogin={handleLogin} />;

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 max-w-7xl mx-auto">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900">Command Center</h1>
                                <p className="text-slate-500">Business overview and active operational status.</p>
                            </div>
                            <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                <button 
                                    onClick={() => setDashboardFilter('YTD')}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${dashboardFilter === 'YTD' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    Year to Date ({currentYear})
                                </button>
                                <button 
                                    onClick={() => setDashboardFilter('ALL')}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${dashboardFilter === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    All Time
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-2">Revenue Won</h3>
                                <p className="text-2xl font-bold text-emerald-600">
                                    ${projects
                                        .filter(p => {
                                            const matchesStatus = p.status === 'Won';
                                            const date = robustParseDate(p.awardedDate || p.dateCreated);
                                            return matchesStatus && (dashboardFilter === 'ALL' || date.getFullYear() === currentYear);
                                        })
                                        .reduce((sum, p) => sum + (p.contractValue || 0), 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{dashboardFilter === 'YTD' ? `Jan - Dec ${currentYear}` : 'Cumulative'}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-2">Pipeline</h3>
                                <p className="text-2xl font-bold text-blue-600">
                                    ${projects
                                        .filter(p => {
                                            const matchesStatus = p.status === 'Draft' || p.status === 'Sent';
                                            const date = robustParseDate(p.dateCreated);
                                            return matchesStatus && (dashboardFilter === 'ALL' || date.getFullYear() === currentYear);
                                        })
                                        .reduce((sum, p) => sum + (p.contractValue || 0), 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Unconverted Opportunities</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-2">Service Revenue</h3>
                                <p className="text-2xl font-bold text-indigo-600">
                                    ${tickets
                                        .filter(t => {
                                            const matchesStatus = t.status === 'Authorized' || t.status === 'Completed';
                                            const date = robustParseDate(t.dateCreated);
                                            return matchesStatus && (dashboardFilter === 'ALL' || date.getFullYear() === currentYear);
                                        })
                                        .reduce((sum, t) => {
                                            const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
                                            const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
                                            return sum + mat + lab;
                                        }, 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Change Orders & Service</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mb-2">Purchase Spend</h3>
                                <p className="text-2xl font-bold text-slate-700">
                                    ${purchases
                                        .filter(p => {
                                            const date = robustParseDate(p.date);
                                            return (dashboardFilter === 'ALL' || date.getFullYear() === currentYear);
                                        })
                                        .reduce((sum, p) => sum + (p.totalCost || 0), 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Materials & Direct Costs</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span> Projects Due for Follow-Up
                                    </h3>
                                    <span className="text-xs text-slate-400 font-medium">Auto-generated from Est. Pipeline</span>
                                </div>
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

                                {user.role === 'admin' && (
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                                        <h3 className="font-bold text-slate-800 mb-2 text-sm">Recent Activity</h3>
                                        <div className="space-y-2 max-h-40 overflow-y-auto text-xs text-slate-500 custom-scrollbar">
                                            {auditLogs.length === 0 ? (
                                                <p className="italic">No activity recorded.</p>
                                            ) : (
                                                auditLogs.slice(0, 5).map(log => (
                                                    <div key={log.id} className="border-b border-slate-50 pb-1 mb-1 last:border-0">
                                                        <span className="font-bold text-slate-700">{log.userName}</span>: {log.details}
                                                        <br/><span className="text-[10px] text-slate-300">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            case ViewState.PROJECTS: return <ProjectList projects={projects} setProjects={setProjects} onOpenProject={() => {}} tickets={tickets} />;
            case ViewState.ESTIMATE_NEW: return <Estimator materials={materials} projects={projects} />;
            case ViewState.DATABASE: return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
            case ViewState.CRM: return <CRM leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} projects={projects} setProjects={setProjects} />;
            case ViewState.SERVICE: return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
            case ViewState.PRICE_ANALYSIS: return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} projects={projects} tickets={tickets} />;
            case ViewState.CLOUD_DB: return <SharePointConnect projects={projects} setProjects={setProjects} materials={materials} tickets={tickets} purchases={purchases} setPurchases={setPurchases} />;
            default: return <div>View Not Found</div>;
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
            <Sidebar currentView={currentView} onChangeView={setCurrentView} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <main className="flex-1 flex flex-col relative overflow-hidden md:ml-64 transition-all duration-300">
                <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shrink-0"><span className="font-bold">CARSAN Electric</span><button onClick={() => setIsSidebarOpen(true)}>Menu</button></div>
                <div className="flex-1 overflow-auto">{renderView()}</div>
                <AIAssistant projects={projects} materials={materials} tickets={tickets} leads={leads} purchases={purchases} />
                
                {/* Database Connection Status Toast */}
                <div className={`fixed bottom-4 left-64 ml-4 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 z-50 transition-all ${isSqlConnected ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600 border border-slate-300 opacity-50 hover:opacity-100'}`}>
                    <div className={`w-2 h-2 rounded-full ${isSqlConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                    {isSqlConnected ? 'SQL Server Connected' : 'Local Storage Mode'}
                </div>
            </main>
        </div>
    );
};
