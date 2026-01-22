
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { Estimator } from './components/Estimator';
import { ServiceModule } from './components/ServiceModule';
import { PriceAnalysis } from './components/PriceAnalysis';
import { SharePointConnect } from './components/SharePointConnect';
import { CRM } from './components/CRM';
import { PriceDatabase } from './components/PriceDatabase';
import { Login } from './components/Login';
import { AIAssistant } from './components/AIAssistant';
import { User, ViewState, ProjectEstimate, MaterialItem, ServiceTicket, Lead, PurchaseRecord } from './types';
import { MIAMI_STANDARD_PRICES } from './utils/miamiStandards';
import { INITIAL_CSV_DATA, processPurchaseData } from './utils/purchaseData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Briefcase, TrendingUp, Users, DollarSign, Clock, ArrowUpRight, Activity, FileText } from 'lucide-react';

export const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    
    // Data State
    const [projects, setProjects] = useState<ProjectEstimate[]>(() => {
        const saved = localStorage.getItem('carsan_projects');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [materials, setMaterials] = useState<MaterialItem[]>(() => {
        const saved = localStorage.getItem('carsan_materials');
        return saved ? JSON.parse(saved) : MIAMI_STANDARD_PRICES;
    });

    const [tickets, setTickets] = useState<ServiceTicket[]>(() => {
        const saved = localStorage.getItem('carsan_tickets');
        return saved ? JSON.parse(saved) : [];
    });

    const [leads, setLeads] = useState<Lead[]>(() => {
        const saved = localStorage.getItem('carsan_leads');
        return saved ? JSON.parse(saved) : [];
    });

    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
        const saved = localStorage.getItem('carsan_purchases');
        return saved ? JSON.parse(saved) : processPurchaseData(INITIAL_CSV_DATA);
    });

    const [opportunities, setOpportunities] = useState<any[]>([]);

    // Persistence
    useEffect(() => { localStorage.setItem('carsan_projects', JSON.stringify(projects)); }, [projects]);
    useEffect(() => { localStorage.setItem('carsan_materials', JSON.stringify(materials)); }, [materials]);
    useEffect(() => { localStorage.setItem('carsan_tickets', JSON.stringify(tickets)); }, [tickets]);
    useEffect(() => { localStorage.setItem('carsan_leads', JSON.stringify(leads)); }, [leads]);
    useEffect(() => { localStorage.setItem('carsan_purchases', JSON.stringify(purchases)); }, [purchases]);

    if (!user) {
        return <Login onLogin={setUser} />;
    }

    // Dashboard Data Prep
    const activeProjectsCount = projects.filter(p => p.status === 'Ongoing').length;
    const pendingEstimatesCount = projects.filter(p => p.status === 'Sent').length;
    const newLeadsCount = leads.filter(l => l.status === 'New').length;
    const totalRevenue = projects.filter(p => p.status === 'Won' || p.status === 'Ongoing' || p.status === 'Completed')
                                 .reduce((sum, p) => sum + (p.contractValue || 0), 0);

    const recentActivity = [
        ...projects.slice(0, 3).map(p => ({ type: 'Project', name: p.name, date: p.dateCreated, status: p.status })),
        ...leads.slice(0, 3).map(l => ({ type: 'Lead', name: l.name, date: l.dateAdded, status: l.status }))
    ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

    // Simulated Monthly Data for Chart
    const monthlyData = [
        { name: 'Jan', value: 12000 },
        { name: 'Feb', value: 19000 },
        { name: 'Mar', value: 30000 },
        { name: 'Apr', value: 25000 },
        { name: 'May', value: 45000 },
        { name: 'Jun', value: totalRevenue > 60000 ? totalRevenue / 2 : 35000 },
    ];

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 space-y-6">
                        <div className="flex justify-between items-end">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
                                <p className="text-slate-500 mt-1">Overview of your electrical business performance.</p>
                            </div>
                            <div className="text-right hidden md:block">
                                <p className="text-xs font-bold text-slate-400 uppercase">Total Contract Value</p>
                                <p className="text-2xl font-bold text-emerald-600">${totalRevenue.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Briefcase className="w-5 h-5"/></div>
                                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">+2 this week</span>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Active Projects</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{activeProjectsCount}</p>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><FileText className="w-5 h-5"/></div>
                                    <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full">Action Req</span>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Pending Estimates</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{pendingEstimatesCount}</p>
                                </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Users className="w-5 h-5"/></div>
                                    <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">New</span>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">New Leads</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{newLeadsCount}</p>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-5 rounded-xl text-white shadow-lg flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm"><TrendingUp className="w-5 h-5 text-white"/></div>
                                </div>
                                <div>
                                    <p className="text-indigo-100 text-xs font-bold uppercase tracking-wide">Projected Growth</p>
                                    <p className="text-3xl font-bold mt-1 flex items-center gap-2">
                                        12% <ArrowUpRight className="w-5 h-5 text-emerald-300" />
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Charts & Activity */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Chart */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-600"/> Revenue Trend (6 Months)</h3>
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={monthlyData}>
                                            <defs>
                                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v/1000}k`} />
                                            <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                            <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Recent Activity Feed */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600"/> Recent Activity</h3>
                                <div className="flex-1 overflow-auto space-y-4">
                                    {recentActivity.length > 0 ? recentActivity.map((item, idx) => (
                                        <div key={idx} className="flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0">
                                            <div className={`w-2 h-2 mt-1.5 rounded-full ${item.type === 'Project' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{item.name}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">{item.type}</span>
                                                    <span className="text-xs text-slate-300">•</span>
                                                    <span className="text-[10px] font-medium bg-slate-100 px-2 py-0.5 rounded text-slate-600 uppercase">{item.status}</span>
                                                </div>
                                            </div>
                                            <div className="ml-auto text-[10px] text-slate-400 whitespace-nowrap">
                                                {new Date(item.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center text-slate-400 py-8 text-sm">No recent activity found.</div>
                                    )}
                                </div>
                                <button className="mt-4 w-full py-2 bg-slate-50 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors">
                                    View All History
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case ViewState.CRM:
                return <CRM leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} projects={projects} setProjects={setProjects} />;
            case ViewState.PROJECTS:
                return <ProjectList projects={projects} setProjects={setProjects} tickets={tickets} onOpenProject={(p) => {}} />;
            case ViewState.ESTIMATE_NEW:
                return <Estimator materials={materials} projects={projects} />;
            case ViewState.SERVICE:
                return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
            case ViewState.PRICE_ANALYSIS:
                return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} projects={projects} tickets={tickets} />;
            case ViewState.DATABASE:
                return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
            case ViewState.CLOUD_DB:
                return <SharePointConnect projects={projects} setProjects={setProjects} materials={materials} tickets={tickets} setTickets={setTickets} purchases={purchases} setPurchases={setPurchases} leads={leads} setLeads={setLeads} />;
            default:
                return <div>View Not Found</div>;
        }
    };

    return (
        <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
            <Sidebar 
                currentView={currentView} 
                onChangeView={setCurrentView} 
                isOpen={true} 
                onClose={() => {}} 
                user={user} 
                onLogout={() => setUser(null)} 
            />
            <main className="flex-1 overflow-auto relative w-full">
                {renderView()}
                <AIAssistant projects={projects} materials={materials} tickets={tickets} leads={leads} purchases={purchases} />
            </main>
        </div>
    );
};
