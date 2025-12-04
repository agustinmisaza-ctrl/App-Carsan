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
import { getAllPurchaseRecords } from './services/sharepointService';

const RESET_APP = false;

const loadState = <T,>(key: string, fallback: T): T => {
    if (RESET_APP) return fallback;
    const saved = localStorage.getItem(key);
    if (saved) { try { return JSON.parse(saved); } catch (e) { return fallback; } }
    return fallback;
};

export const App: React.FC = () => {
    useEffect(() => { console.log("Carsan Electric App v10.0 - Final"); }, []);

    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [projects, setProjects] = useState<ProjectEstimate[]>(() => loadState('carsan_projects', []));
    const [materials, setMaterials] = useState<MaterialItem[]>(() => loadState('carsan_materials', []));
    const [tickets, setTickets] = useState<ServiceTicket[]>(() => loadState('carsan_tickets', []));
    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => loadState('carsan_purchases', []));
    const [leads, setLeads] = useState<Lead[]>(() => loadState('carsan_leads', []));
    const [opportunities, setOpportunities] = useState<any[]>(() => loadState('carsan_opportunities', []));
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => loadState('carsan_audit_logs', []));

    useEffect(() => localStorage.setItem('carsan_projects', JSON.stringify(projects)), [projects]);
    useEffect(() => localStorage.setItem('carsan_materials', JSON.stringify(materials)), [materials]);
    useEffect(() => localStorage.setItem('carsan_tickets', JSON.stringify(tickets)), [tickets]);
    useEffect(() => localStorage.setItem('carsan_purchases', JSON.stringify(purchases)), [purchases]);
    useEffect(() => localStorage.setItem('carsan_leads', JSON.stringify(leads)), [leads]);
    useEffect(() => localStorage.setItem('carsan_opportunities', JSON.stringify(opportunities)), [opportunities]);
    useEffect(() => localStorage.setItem('carsan_audit_logs', JSON.stringify(auditLogs)), [auditLogs]);

    const handleLogin = (u: User) => { setUser(u); localStorage.setItem('carsan_user', JSON.stringify(u)); };
    const handleLogout = () => { import('./services/emailIntegration').then(m => m.signOut()); setUser(null); localStorage.removeItem('carsan_user'); window.location.reload(); };

    if (!user) return <Login onLogin={handleLogin} />;

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD: return <div className="p-8"><h1 className="text-2xl font-bold">Dashboard (v10.0)</h1></div>; // Placeholder for brevity, replace with full dashboard code if needed
            case ViewState.PROJECTS: return <ProjectList projects={projects} setProjects={setProjects} onOpenProject={() => {}} tickets={tickets} />;
            case ViewState.ESTIMATE_NEW: return <Estimator materials={materials} projects={projects} />;
            case ViewState.DATABASE: return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
            case ViewState.CRM: return <CRM leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} projects={projects} />;
            case ViewState.SERVICE: return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
            case ViewState.PRICE_ANALYSIS: return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} projects={projects} />;
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
                <AIAssistant projects={projects} materials={materials} tickets={tickets} />
            </main>
        </div>
    );
};