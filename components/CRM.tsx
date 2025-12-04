import React, { useState } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails, getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';
import { Mail, RefreshCw, Settings, User as UserIcon, Phone, Search, Save, Loader2, Trello, List, ArrowRight, CheckCircle, XCircle, DollarSign, Plus, ArrowUpRight, ArrowDownRight, Trophy, AlertCircle } from 'lucide-react';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
    projects?: ProjectEstimate[]; 
}

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, opportunities, setOpportunities, projects = [] }) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'leads'>('pipeline');
    const [isLoading, setIsLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    
    // Settings State
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');
    const [clientId, setClientId] = useState(getStoredClientId() || '');

    // Financial KPIs
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    const getProjectValue = (year: number, status: string) => {
        if (!projects) return 0;
        return projects
            .filter(p => new Date(p.dateCreated).getFullYear() === year)
            .filter(p => status === 'All' || p.status === status)
            .reduce((sum, p) => sum + (p.contractValue || 0), 0);
    };

    const sentThisYear = getProjectValue(currentYear, 'Sent');
    const wonThisYear = getProjectValue(currentYear, 'Won');
    const lostThisYear = getProjectValue(currentYear, 'Lost');
    const sentLastYear = getProjectValue(lastYear, 'Sent');
    const wonLastYear = getProjectValue(lastYear, 'Won');

    const calcGrowth = (current: number, past: number) => {
        if (past === 0) return 100;
        return ((current - past) / past) * 100;
    };

    const handleFetchLeads = async () => {
        setIsLoading(true);
        try {
            const data = await fetchOutlookEmails();
            const newLeads = [...leads];
            data.forEach(d => {
                if (!newLeads.find(l => l.id === d.id)) {
                    newLeads.unshift(d);
                }
            });
            setLeads(newLeads);
        } catch (error) {
            console.error(error);
            alert("Failed to fetch leads. Check your Azure configuration.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSettings = () => {
        setStoredTenantId(tenantId.trim());
        setStoredClientId(clientId.trim());
        setShowSettings(false);
        alert("Settings saved!");
    };

    const convertToOpportunity = (lead: Lead) => {
        const newOpp = {
            id: `opp-${Date.now()}`,
            title: `Deal: ${lead.name}`,
            value: 0,
            stage: 'Qualification',
            client: lead.name,
            contact: lead.email,
            date: new Date().toISOString()
        };
        setOpportunities([...opportunities, newOpp]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setActiveTab('pipeline');
    };

    const moveStage = (oppId: string, direction: 'next' | 'prev') => {
        const stages = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won'];
        const updated = opportunities.map(opp => {
            if (opp.id === oppId) {
                const idx = stages.indexOf(opp.stage);
                let newIdx = idx;
                if (direction === 'next' && idx < stages.length - 1) newIdx++;
                if (direction === 'prev' && idx > 0) newIdx--;
                return { ...opp, stage: stages[newIdx] };
            }
            return opp;
        });
        setOpportunities(updated);
    };

    const deleteOpportunity = (id: string) => {
        if(confirm("Remove this opportunity?")) {
            setOpportunities(opportunities.filter(o => o.id !== id));
        }
    };

    const discardLead = (id: string) => {
        if(confirm("Discard this lead?")) {
            setLeads(leads.filter(l => l.id !== id));
        }
    };

    const handleForwardLead = (lead: Lead) => {
        const subject = `Lead Forward: ${lead.name}`;
        const body = `Hi Simon,\n\nPlease review this lead.\n\nName: ${lead.name}\nEmail: ${lead.email}\nNotes: ${lead.notes}\n\nThanks.`;
        window.open(`mailto:simon.martinez@carsanelectric.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CRM & Pipeline</h1>
                    <p className="text-slate-500 mt-1">Track relationships, leads, and deal flow.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg border transition-colors ${showSettings ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                        title="Configuration"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                    <div className="bg-slate-100 p-1 rounded-lg flex">
                        <button 
                            onClick={() => setActiveTab('pipeline')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'pipeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Trello className="w-4 h-4" /> Pipeline
                        </button>
                        <button 
                            onClick={() => setActiveTab('leads')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List className="w-4 h-4" /> Leads
                        </button>
                    </div>
                </div>
            </div>

            {showSettings && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in slide-in-from-top-2">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Azure Integration Settings
                    </h3>
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800">
                        <p className="font-bold mb-1">Vercel Deployment</p>
                        <p>Redirect URI: <code className="bg-white px-1 py-0.5 rounded border">{window.location.origin}</code></p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Azure Tenant ID</label>
                            <input 
                                value={tenantId}
                                onChange={(e) => setTenantId(e.target.value)}
                                placeholder="e.g. 555y1dg..."
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Found in Overview &gt; Directory (tenant) ID.</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Client ID</label>
                            <input 
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder="Application (client) ID"
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={handleSaveSettings} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                            <Save className="w-4 h-4" /> Save Configuration
                        </button>
                    </div>
                </div>
            )}

            {/* FINANCIAL KPIS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><DollarSign className="w-16 h-16 text-blue-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Quoted (YTD)</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">${sentThisYear.toLocaleString()}</p>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-2 ${calcGrowth(sentThisYear, sentLastYear) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {calcGrowth(sentThisYear, sentLastYear) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(calcGrowth(sentThisYear, sentLastYear)).toFixed(1)}% vs Last Year
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><Trophy className="w-16 h-16 text-emerald-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Won (YTD)</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">${wonThisYear.toLocaleString()}</p>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-2 ${calcGrowth(wonThisYear, wonLastYear) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {calcGrowth(wonThisYear, wonLastYear) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(calcGrowth(wonThisYear, wonLastYear)).toFixed(1)}% vs Last Year
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><XCircle className="w-16 h-16 text-red-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Lost Revenue (YTD)</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">${lostThisYear.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-2">Opportunities for review</p>
                </div>
            </div>

            {/* --- PIPELINE VIEW --- */}
            {activeTab === 'pipeline' && (
                <div className="flex-1 overflow-x-auto min-h-[500px] pb-4">
                    <div className="flex gap-4 min-w-[1000px] h-full">
                        {['Qualification', 'Proposal', 'Negotiation', 'Closed Won'].map(stage => {
                            const stageOpps = opportunities.filter(o => o.stage === stage);
                            const totalValue = stageOpps.reduce((sum, o) => sum + (o.value || 0), 0);
                            
                            return (
                                <div key={stage} className="flex-1 bg-slate-100 rounded-xl p-3 flex flex-col h-full border border-slate-200">
                                    <div className="flex justify-between items-center mb-3 px-1">
                                        <h3 className="font-bold text-slate-700 text-sm uppercase">{stage}</h3>
                                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border">{stageOpps.length}</span>
                                    </div>
                                    <div className="mb-3 text-right px-1">
                                        <span className="text-xs text-slate-400 font-medium">${totalValue.toLocaleString()}</span>
                                    </div>
                                    
                                    <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                                        {stageOpps.map(opp => (
                                            <div key={opp.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 group hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{opp.client}</span>
                                                    <button onClick={() => deleteOpportunity(opp.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><XCircle className="w-4 h-4" /></button>
                                                </div>
                                                <h4 className="font-bold text-slate-800 text-sm mb-1">{opp.title}</h4>
                                                <p className="text-xs text-slate-500 truncate">{opp.contact}</p>
                                                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                                                    <span className="font-bold text-slate-700 text-sm">${(opp.value || 0).toLocaleString()}</span>
                                                    <div className="flex gap-1">
                                                        {stage !== 'Qualification' && (
                                                            <button onClick={() => moveStage(opp.id, 'prev')} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600" title="Move Back">
                                                                <ArrowRight className="w-4 h-4 rotate-180" />
                                                            </button>
                                                        )}
                                                        {stage !== 'Closed Won' && (
                                                            <button onClick={() => moveStage(opp.id, 'next')} className="p-1 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600" title="Move Forward">
                                                                <ArrowRight className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {stage === 'Qualification' && (
                                            <button 
                                                onClick={() => {
                                                    const name = prompt("Enter Opportunity Name:");
                                                    if(name) {
                                                        setOpportunities([...opportunities, {
                                                            id: `opp-${Date.now()}`,
                                                            title: name,
                                                            value: 0,
                                                            stage: 'Qualification',
                                                            client: 'New Client',
                                                            contact: '',
                                                            date: new Date().toISOString()
                                                        }]);
                                                    }
                                                }}
                                                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 text-sm font-bold hover:border-blue-400 hover:text-blue-500 hover:bg-white transition flex items-center justify-center gap-2"
                                            >
                                                <Plus className="w-4 h-4" /> Add Deal
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- LEADS VIEW --- */}
            {activeTab === 'leads' && (
                <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800">Recent Leads</h3>
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{leads.length}</span>
                        </div>
                        <button 
                            onClick={handleFetchLeads}
                            disabled={isLoading}
                            className="text-blue-600 text-sm font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sync Outlook
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-4">Source</th>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Notes</th>
                                    <th className="px-6 py-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {leads.map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50 group">
                                        <td className="px-6 py-4">
                                            <span className="flex items-center gap-2 text-slate-600 font-medium">
                                                <Mail className="w-4 h-4 text-blue-500" /> Outlook
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-900">{lead.name}</td>
                                        <td className="px-6 py-4 text-slate-600">{lead.email}</td>
                                        <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate" title={lead.notes}>{lead.notes}</td>
                                        <td className="px-6 py-4 flex justify-center gap-2">
                                            <button 
                                                onClick={() => handleForwardLead(lead)} 
                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" 
                                                title="Forward to Simon"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => convertToOpportunity(lead)} 
                                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" 
                                                title="Convert to Opportunity"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => discardLead(lead.id)} 
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" 
                                                title="Discard"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};