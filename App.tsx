
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

    const renderView = () => {
        switch (currentView) {
            case ViewState.DASHBOARD:
                return (
                    <div className="p-8">
                        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs">Active Projects</h3>
                                <p className="text-3xl font-bold text-blue-600 mt-2">{projects.filter(p => p.status === 'Ongoing').length}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs">Pending Estimates</h3>
                                <p className="text-3xl font-bold text-orange-600 mt-2">{projects.filter(p => p.status === 'Sent').length}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-slate-500 font-bold uppercase text-xs">New Leads</h3>
                                <p className="text-3xl font-bold text-emerald-600 mt-2">{leads.filter(l => l.status === 'New').length}</p>
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
