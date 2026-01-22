
import React, { useState, useEffect, useMemo } from 'react';
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
import { Briefcase, TrendingUp, Users, DollarSign, Clock, ArrowUpRight, Activity, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

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

    // --- REAL DASHBOARD DATA CALCULATIONS ---

    // 1. KPI Counts
    const activeProjectsCount = projects.filter(p => p.status === 'Ongoing').length;
    const pendingEstimatesCount = projects.filter(p => p.status === 'Sent').length;
    const newLeadsCount = leads.filter(l => l.status === 'New').length;
    
    // 2. Total Contract Value (Won + Ongoing + Completed)
    const totalRevenue = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
                                 .reduce((sum, p) => sum + (p.contractValue || 0), 0);

    // 3. Win Rate Calculation
    const closedProjects = projects.filter(p => p.status === 'Won' || p.status === 'Lost' || p.status === 'Ongoing' || p.status === 'Completed');
    const wonProjectsCount = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status)).length;
    const winRate = closedProjects.length > 0 
        ? Math.round((wonProjectsCount / closedProjects.length) * 100) 
        : 0;

    // 4. Recent Activity Feed
    const recentActivity = [
        ...projects.map(p => ({ 
            type: 'Project', 
            name: p.name, 
            date: p.dateCreated, 
            status: p.status,
            details: `Value: $${(p.contractValue || 0).toLocaleString()}`
        })),
        ...leads.map(l => ({ 
            type: 'Lead', 
            name: l.name, 
            date: l.dateAdded, 
            status: l.status,
            details: l.company
        })),
        ...tickets.map(t => ({
            type: 'Ticket',
            name: t.clientName,
            date: t.dateCreated,
            status: t.status,
            details: t.type
        }))
    ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);

    // 5. Monthly Revenue Chart (Last 6 Months Real Data)
    const monthlyData = useMemo(() => {
        const data = [];
        const today = new Date();
        
        // Initialize last 6 months with 0
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            data.push({
                name: d.toLocaleString('default', { month: 'short' }), // Jan, Feb...
                fullName: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
                key: `${d.getFullYear()}-${d.getMonth()}`, // 2023-10
                value: 0
            });
        }

        // Sum up contract values for Won/Ongoing/Completed projects based on Awarded Date (or Date Created fallback)
        projects.forEach(p => {
            if (['Won', 'Ongoing', 'Completed'].includes(p.status) && p.contractValue) {
                const dateStr = p.awardedDate || p.dateCreated;
                const date = new Date(dateStr);
                const key = `${date.getFullYear()}-${date.getMonth()}`;
                
                const monthEntry = data.find(d => d.key === key);
                if (monthEntry) {
                    monthEntry.value += p.contractValue;
                }
            }
        });

        return data;
    }, [projects]);

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Panel de Control</h1>
                                <p className="text-slate-500 mt-1">Resumen en tiempo real de tu negocio.</p>
                            </div>
                            <div className="text-right hidden md:block">
                                <p className="text-xs font-bold text-slate-400 uppercase">Ingresos Totales (Adjudicados)</p>
                                <p className="text-2xl font-bold text-emerald-600">${totalRevenue.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Briefcase className="w-5 h-5"/></div>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Proyectos Activos</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{activeProjectsCount}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">En estado 'Ongoing'</p>
                                </div>
                            </div>
                            
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><FileText className="w-5 h-5"/></div>
                                    {pendingEstimatesCount > 0 && <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full animate-pulse">Pendientes</span>}
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Cotizaciones Enviadas</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{pendingEstimatesCount}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Esperando respuesta</p>
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Users className="w-5 h-5"/></div>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Nuevos Leads</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{newLeadsCount}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Sin contactar</p>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-xl text-white shadow-lg flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm"><TrendingUp className="w-5 h-5 text-white"/></div>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Tasa de Éxito (Win Rate)</p>
                                    <p className="text-3xl font-bold mt-1 flex items-center gap-2">
                                        {winRate}% 
                                        {winRate > 50 ? <ArrowUpRight className="w-5 h-5 text-emerald-400" /> : <span className="text-xs text-slate-500 font-normal">Objetivo: 50%</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1">De proyectos cerrados</p>
                                </div>
                            </div>
                        </div>

                        {/* Charts & Activity */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Chart */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-emerald-600"/> 
                                        Ingresos Adjudicados (6 Meses)
                                    </h3>
                                    {monthlyData.every(d => d.value === 0) && (
                                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200">
                                            Sin datos recientes. Marca proyectos como "Won" para ver.
                                        </span>
                                    )}
                                </div>
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={monthlyData}>
                                            <defs>
                                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v/1000}k`} />
                                            <Tooltip 
                                                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Ingresos']} 
                                                labelFormatter={(label) => {
                                                    const item = monthlyData.find(d => d.name === label);
                                                    return item ? item.fullName : label;
                                                }}
                                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                                            />
                                            <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Recent Activity Feed */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-600"/> Actividad Reciente</h3>
                                <div className="flex-1 overflow-auto space-y-0 custom-scrollbar pr-2">
                                    {recentActivity.length > 0 ? recentActivity.map((item, idx) => (
                                        <div key={idx} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-2 rounded-lg transition-colors">
                                            <div className={`mt-1 rounded-full p-1.5 shrink-0 ${
                                                item.type === 'Project' ? 'bg-blue-100 text-blue-600' : 
                                                item.type === 'Lead' ? 'bg-purple-100 text-purple-600' :
                                                'bg-orange-100 text-orange-600'
                                            }`}>
                                                {item.type === 'Project' ? <Briefcase className="w-3 h-3"/> : item.type === 'Lead' ? <Users className="w-3 h-3"/> : <FileText className="w-3 h-3"/>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex justify-between items-start">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                                                    <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                                                        {new Date(item.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-slate-500 truncate">{item.details}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block uppercase ${
                                                    item.status === 'Won' || item.status === 'Authorized' ? 'bg-emerald-50 text-emerald-600' : 
                                                    item.status === 'Lost' || item.status === 'Denied' ? 'bg-red-50 text-red-600' : 
                                                    'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                            <p className="text-sm text-center">No hay actividad reciente.<br/>Crea un proyecto para empezar.</p>
                                        </div>
                                    )}
                                </div>
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
