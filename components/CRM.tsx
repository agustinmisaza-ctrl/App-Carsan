
import React, { useState } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails } from '../services/emailIntegration';
import { Trello, List, Search, RefreshCw, Briefcase, Mail, CheckCircle, XCircle, ArrowRight, Trash2 } from 'lucide-react';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
    projects?: ProjectEstimate[];
    setProjects?: (projects: ProjectEstimate[]) => void;
}

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, projects = [], setProjects }) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'leads'>('pipeline');
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleFetchLeads = async () => {
        setIsLoading(true);
        try {
            const data = await fetchOutlookEmails();
            const newLeads = [...leads];
            // Simple dedupe by ID
            data.forEach(d => {
                if (!newLeads.find(l => l.id === d.id)) {
                    newLeads.unshift(d);
                }
            });
            setLeads(newLeads);
            alert(`Synced ${data.length} emails from Outlook.`);
        } catch (error) {
            console.error(error);
            alert("Failed to fetch leads. Ensure Client ID is configured in Settings.");
        } finally {
            setIsLoading(false);
        }
    };

    const convertToOpportunity = (lead: Lead) => {
        if (!setProjects) return;
        const newProject: ProjectEstimate = {
            id: `proj-${Date.now()}`,
            name: lead.name, // Usually Subject line or Sender Name
            client: lead.company || lead.name,
            contactInfo: lead.email,
            address: 'Miami, FL',
            status: 'Draft',
            dateCreated: new Date().toISOString(),
            laborRate: 75,
            items: [],
            contractValue: 0
        };
        setProjects([...projects, newProject]);
        
        // Remove from leads after conversion
        setLeads(leads.filter(l => l.id !== lead.id));
        
        // Switch to pipeline view to show success
        setActiveTab('pipeline');
    };

    const deleteLead = (id: string) => {
        if(confirm("Are you sure you want to discard this lead?")) {
            setLeads(leads.filter(l => l.id !== id));
        }
    };

    // --- PIPELINE KANBAN ---
    const renderKanbanColumn = (title: string, status: ProjectEstimate['status'], colorClass: string) => {
        const items = projects.filter(p => p.status === status);
        const totalValue = items.reduce((sum, p) => sum + (p.contractValue || 0), 0);

        return (
            <div className="flex-1 min-w-[280px] bg-slate-100 rounded-xl flex flex-col h-full border border-slate-200">
                <div className={`p-3 rounded-t-xl border-b border-slate-200 ${colorClass} bg-opacity-10`}>
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm uppercase">{title}</h3>
                        <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-slate-500">{items.length}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-500 mt-1">${totalValue.toLocaleString()}</p>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
                    {items.map(p => (
                        <div key={p.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group relative">
                            <h4 className="font-bold text-slate-800 text-sm mb-1">{p.name}</h4>
                            <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                                <Briefcase className="w-3 h-3" /> {p.client}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded">
                                    ${(p.contractValue || 0).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {new Date(p.dateCreated).toLocaleDateString()}
                                </span>
                            </div>
                            
                            {/* Simple Quick Actions */}
                            {setProjects && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    {status === 'Draft' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); const upd = projects.map(proj => proj.id === p.id ? {...proj, status: 'Sent' as const} : proj); setProjects(upd); }}
                                            className="p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200" title="Move to Sent"
                                        >
                                            <ArrowRight className="w-3 h-3" />
                                        </button>
                                    )}
                                    {status === 'Sent' && (
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); const upd = projects.map(proj => proj.id === p.id ? {...proj, status: 'Won' as const, awardedDate: new Date().toISOString()} : proj); setProjects(upd); }}
                                                className="p-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200" title="Mark Won"
                                            >
                                                <CheckCircle className="w-3 h-3" />
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); const upd = projects.map(proj => proj.id === p.id ? {...proj, status: 'Lost' as const} : proj); setProjects(upd); }}
                                                className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200" title="Mark Lost"
                                            >
                                                <XCircle className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {items.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-xs italic">
                            No deals in {title}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CRM & Pipeline</h1>
                    <p className="text-slate-500 mt-1">Manage leads and project stages.</p>
                </div>
                <div className="bg-slate-100 p-1 rounded-lg flex">
                    <button 
                        onClick={() => setActiveTab('pipeline')}
                        className={`px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'pipeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Trello className="w-4 h-4" /> Pipeline
                    </button>
                    <button 
                        onClick={() => setActiveTab('leads')}
                        className={`px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <List className="w-4 h-4" /> Leads
                    </button>
                </div>
            </div>

            {/* --- PIPELINE VIEW --- */}
            {activeTab === 'pipeline' && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="flex h-[calc(100vh-250px)] gap-4 min-w-[1000px] pb-4">
                        {renderKanbanColumn('Draft / New', 'Draft', 'bg-slate-500')}
                        {renderKanbanColumn('Sent / Negotiation', 'Sent', 'bg-blue-500')}
                        {renderKanbanColumn('Won / Pending Start', 'Won', 'bg-emerald-500')}
                        {renderKanbanColumn('Ongoing Projects', 'Ongoing', 'bg-indigo-500')}
                    </div>
                </div>
            )}

            {/* --- LEADS VIEW --- */}
            {activeTab === 'leads' && (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <div className="relative w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search leads..." 
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <button 
                            onClick={handleFetchLeads}
                            disabled={isLoading}
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-70"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Sync Outlook
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">Name / Company</th>
                                    <th className="px-6 py-3">Email / Contact</th>
                                    <th className="px-6 py-3">Source</th>
                                    <th className="px-6 py-3">Notes</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {leads
                                    .filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.email.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50 group">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">{lead.name}</div>
                                            <div className="text-xs text-slate-400">{lead.company}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Mail className="w-3 h-3" /> {lead.email}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                Added: {new Date(lead.dateAdded).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${lead.source === 'Outlook' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                {lead.source}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="max-w-xs truncate text-slate-500" title={lead.notes}>
                                                {lead.notes || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => convertToOpportunity(lead)}
                                                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1"
                                                >
                                                    <Briefcase className="w-3 h-3" /> Estimate
                                                </button>
                                                <button 
                                                    onClick={() => deleteLead(lead.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {leads.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-slate-400">
                                            No leads found. Click "Sync Outlook" to fetch emails.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
