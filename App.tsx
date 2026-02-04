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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { Briefcase, TrendingUp, Users, DollarSign, Clock, ArrowUpRight, Activity, FileText, CheckCircle2, AlertCircle, Plus, Calendar, Hammer, AlertTriangle, Award } from 'lucide-react';

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

    // --- REAL DASHBOARD DATA CALCULATIONS (Moved BEFORE conditional return) ---

    // 1. Monthly Revenue Chart (Last 6 Months Real Data) - Memoized Hook
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

    // 2. KPI Counts
    const activeProjectsCount = projects.filter(p => p.status === 'Ongoing').length;
    const pendingEstimatesCount = projects.filter(p => p.status === 'Sent').length;
    const newLeadsCount = leads.filter(l => l.status === 'New').length;
    
    // 3. Financial Metrics
    const currentYear = new Date().getFullYear();
    
    // Revenue YTD (Won + Ongoing + Completed in Current Year)
    const revenueYTD = projects
        .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
        .filter(p => {
            const d = new Date(p.awardedDate || p.dateCreated);
            return d.getFullYear() === currentYear;
        })
        .reduce((sum, p) => sum + (p.contractValue || 0), 0);

    // Pipeline Value (Sent but not yet Won/Lost)
    const pipelineValue = projects
        .filter(p => p.status === 'Sent')
        .reduce((sum, p) => sum + (p.contractValue || 0), 0);

    // 4. Win Rate Calculation
    const closedProjects = projects.filter(p => ['Won', 'Lost', 'Ongoing', 'Completed'].includes(p.status));
    const wonProjectsCount = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status)).length;
    const winRate = closedProjects.length > 0 
        ? Math.round((wonProjectsCount / closedProjects.length) * 100) 
        : 0;

    // 5. Project Status Distribution (Pie Chart)
    const statusCounts = projects.reduce((acc, p) => {
        const group = ['Won', 'Ongoing'].includes(p.status) ? 'Active/Won' : p.status;
        acc[group] = (acc[group] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const projectStatusData = [
        { name: 'Draft', value: statusCounts['Draft'] || 0, color: '#94a3b8' }, // Slate 400
        { name: 'Sent', value: statusCounts['Sent'] || 0, color: '#3b82f6' }, // Blue 500
        { name: 'Active/Won', value: statusCounts['Active/Won'] || 0, color: '#10b981' }, // Emerald 500
        { name: 'Completed', value: statusCounts['Completed'] || 0, color: '#6366f1' }, // Indigo 500
        { name: 'Lost', value: statusCounts['Lost'] || 0, color: '#ef4444' }, // Red 500
    ].filter(d => d.value > 0);

    // 6. Upcoming Deadlines (Next 14 Days)
    const upcomingDeadlines = projects
        .filter(p => (p.status === 'Sent' && p.deliveryDate) || (p.status === 'Ongoing' && p.completionDate))
        .map(p => {
            const dateStr = p.status === 'Sent' ? p.deliveryDate! : p.completionDate!;
            return {
                id: p.id,
                name: p.name,
                client: p.client,
                date: dateStr,
                type: p.status === 'Sent' ? 'Quote Expiry' : 'Completion'
            };
        })
        .filter(i => {
            const d = new Date(i.date).getTime();
            const now = new Date().getTime();
            const fourteenDays = now + (14 * 24 * 60 * 60 * 1000);
            return d >= now && d <= fourteenDays;
        })
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5);

    // 7. Pending Service Tickets (Action Items)
    const pendingTickets = tickets.filter(t => t.status === 'Sent').slice(0, 5);

    // 8. Recent Activity Feed
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

    // --- END DATA CALCULATIONS ---

    if (!user) {
        return <Login onLogin={setUser} />;
    }

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-4 md:p-8 space-y-6">
                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                                    {new Date().getHours() < 12 ? 'Good Morning' : 'Good Afternoon'}, {user.name.split(' ')[0]}
                                </h1>
                                <p className="text-slate-500 mt-1">Here is what's happening with your projects today.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setCurrentView(ViewState.ESTIMATE_NEW)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-transform active:scale-95">
                                    <Plus className="w-4 h-4" /> New Estimate
                                </button>
                                <button onClick={() => setCurrentView(ViewState.CRM)} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 flex items-center gap-2 shadow-sm">
                                    <Users className="w-4 h-4" /> New Lead
                                </button>
                            </div>
                        </div>

                        {/* KPI Cards Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Revenue YTD */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 group-hover:bg-emerald-100 transition-colors"><DollarSign className="w-5 h-5"/></div>
                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full uppercase tracking-wide">YTD {currentYear}</span>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Revenue (Won)</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">${revenueYTD.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Pipeline Value */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors"><TrendingUp className="w-5 h-5"/></div>
                                    {pendingEstimatesCount > 0 && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{pendingEstimatesCount} Pending</span>}
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Pipeline Value</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">${pipelineValue.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Potential Revenue</p>
                                </div>
                            </div>

                            {/* Active Jobs */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-indigo-300 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100 transition-colors"><Hammer className="w-5 h-5"/></div>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wide">Active Jobs</p>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{activeProjectsCount}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Currently in progress</p>
                                </div>
                            </div>

                            {/* Win Rate */}
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-xl text-white shadow-lg flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm"><Award className="w-5 h-5 text-yellow-400"/></div>
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Win Rate</p>
                                    <p className="text-3xl font-bold mt-1 flex items-center gap-2">
                                        {winRate}% 
                                        {winRate >= 50 && <ArrowUpRight className="w-5 h-5 text-emerald-400" />}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1">Target: 50%+</p>
                                </div>
                            </div>
                        </div>

                        {/* Main Chart Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Revenue Chart */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-emerald-600"/> 
                                        Revenue Trend (6 Months)
                                    </h3>
                                </div>
                                <ResponsiveContainer width="100%" height="85%">
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
                                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} 
                                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                                        />
                                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Project Status Donut */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80 flex flex-col">
                                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <Briefcase className="w-5 h-5 text-blue-600"/> 
                                    Project Distribution
                                </h3>
                                <div className="flex-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={projectStatusData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {projectStatusData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}}/>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row: Lists & Feeds */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Upcoming Deadlines */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[350px] flex flex-col">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-orange-500"/> Upcoming Deadlines
                                </h3>
                                <div className="flex-1 overflow-auto custom-scrollbar space-y-3">
                                    {upcomingDeadlines.length > 0 ? upcomingDeadlines.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-1.5 rounded border border-slate-200 font-bold text-xs text-center min-w-[40px]">
                                                    <div className="text-slate-400 text-[9px] uppercase">{new Date(item.date).toLocaleString('default', {month: 'short'})}</div>
                                                    <div className="text-slate-800 text-sm">{new Date(item.date).getDate()}</div>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 truncate max-w-[120px]">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500 truncate">{item.client}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${item.type === 'Completion' ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>
                                                {item.type}
                                            </span>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <CheckCircle2 className="w-8 h-8 mb-2 opacity-50" />
                                            <p className="text-xs">No upcoming deadlines.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pending Change Orders */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[350px] flex flex-col">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-500"/> Pending Change Orders
                                </h3>
                                <div className="flex-1 overflow-auto custom-scrollbar space-y-3">
                                    {pendingTickets.length > 0 ? pendingTickets.map((t, i) => (
                                        <div key={i} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setCurrentView(ViewState.SERVICE)}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-bold text-blue-800">{t.id}</span>
                                                <span className="text-[10px] font-bold bg-white text-blue-600 px-1.5 py-0.5 rounded border border-blue-200">SENT</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-800 truncate">{t.clientName}</p>
                                            <div className="flex justify-between items-end mt-1">
                                                <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{t.items.map(i=>i.description).join(', ')}</p>
                                                <p className="text-xs font-bold text-slate-700">{new Date(t.dateCreated).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <CheckCircle2 className="w-8 h-8 mb-2 opacity-50" />
                                            <p className="text-xs">No pending tickets.</p>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setCurrentView(ViewState.SERVICE)} className="mt-3 text-xs text-blue-600 font-bold hover:underline text-center w-full">View All Tickets</button>
                            </div>

                            {/* Recent Activity Feed */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[350px]">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-purple-600"/> Recent Activity</h3>
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
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                                            <p className="text-sm text-center">No activity found.</p>
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