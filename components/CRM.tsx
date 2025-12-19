
import React, { useState, useMemo } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails, sendOutlookEmail, getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';
import { Mail, RefreshCw, Settings, User as UserIcon, Phone, Search, Save, Loader2, Trello, List, ArrowRight, CheckCircle, XCircle, DollarSign, Plus, ArrowUpRight, ArrowDownRight, Trophy, AlertCircle, Trash2, Send, ExternalLink, Users, Calendar, Clock, FileText, CheckSquare, MessageSquare, Filter, Percent } from 'lucide-react';
import { robustParseDate } from '../utils/purchaseData';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
    projects?: ProjectEstimate[];
    setProjects?: (projects: ProjectEstimate[]) => void;
}

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, opportunities, setOpportunities, projects = [], setProjects }) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'leads' | 'followup' | 'email'>('pipeline');
    const [isLoading, setIsLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    
    // Settings State
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');
    const [clientId, setClientId] = useState(getStoredClientId() || '');

    // Email State
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Follow Up View State
    const [selectedClientName, setSelectedClientName] = useState<string | null>(null);

    // Filters & Search
    const [crmSearchTerm, setCrmSearchTerm] = useState('');
    const currentYear = new Date().getFullYear();
    const [dateFilter, setDateFilter] = useState({
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`
    });

    // --- CENTRALIZED FILTERING LOGIC ---
    const filteredProjects = useMemo(() => {
        const start = robustParseDate(dateFilter.start).getTime();
        const end = robustParseDate(dateFilter.end).getTime() + (24 * 60 * 60 * 1000) - 1;

        return projects.filter(p => {
            const d = robustParseDate(p.status === 'Won' ? (p.awardedDate || p.dateCreated) : p.dateCreated).getTime();
            return d >= start && d <= end;
        });
    }, [projects, dateFilter]);

    // Filter Leads by Date Added
    const filteredLeads = useMemo(() => {
        const start = robustParseDate(dateFilter.start).getTime();
        const end = robustParseDate(dateFilter.end).getTime() + (24 * 60 * 60 * 1000) - 1;

        return leads.filter(l => {
            const d = robustParseDate(l.dateAdded).getTime();
            return d >= start && d <= end;
        });
    }, [leads, dateFilter]);

    // --- KPI CALCULATIONS (Using Filtered Data) ---
    const sentInPeriod = filteredProjects.filter(p => p.status === 'Sent').reduce((sum, p) => sum + (p.contractValue || 0), 0);
    const wonInPeriod = filteredProjects.filter(p => p.status === 'Won').reduce((sum, p) => sum + (p.contractValue || 0), 0);
    const lostInPeriod = filteredProjects.filter(p => p.status === 'Lost').reduce((sum, p) => sum + (p.contractValue || 0), 0);
    
    // Win Rate calculation based on counts
    const deliveredCount = filteredProjects.filter(p => p.status !== 'Draft').length;
    const wonCount = filteredProjects.filter(p => ['Won', 'Ongoing', 'Completed', 'Finalized'].includes(p.status)).length;
    const winRate = deliveredCount > 0 ? (wonCount / deliveredCount) * 100 : 0;

    const sentLastPeriod = 100000; 
    const wonLastPeriod = 50000;

    const calcGrowth = (current: number, past: number) => {
        if (past === 0) return 100;
        return ((current - past) / past) * 100;
    };

    // --- AGGREGATE CLIENT DATA FOR FOLLOW UP TAB (Using Filtered Data) ---
    const clientGroups = useMemo(() => {
        const groups: Record<string, {
            name: string;
            email: string;
            projects: ProjectEstimate[];
            totalValue: number;
            sentCount: number;
            lastContact: string | null;
            hasUrgent: boolean;
        }> = {};

        filteredProjects.forEach(p => {
            // STRICT FILTER: Only show 'Sent' proposals in the Follow Up tab
            if (p.status !== 'Sent') return;

            const name = p.client || 'Unknown Client';
            if (!groups[name]) {
                groups[name] = { 
                    name, 
                    email: p.contactInfo || '', 
                    projects: [], 
                    totalValue: 0, 
                    sentCount: 0,
                    lastContact: null,
                    hasUrgent: false
                };
            }
            groups[name].projects.push(p);
            groups[name].totalValue += (p.contractValue || 0);
            groups[name].sentCount++;
            
            // Check urgency
            if (p.followUpDate) {
                const today = new Date();
                const followUp = new Date(p.followUpDate);
                if (today >= followUp) groups[name].hasUrgent = true;
            }
        });

        return Object.values(groups).sort((a, b) => {
            if (a.hasUrgent && !b.hasUrgent) return -1;
            if (!a.hasUrgent && b.hasUrgent) return 1;
            return b.totalValue - a.totalValue; 
        });
    }, [filteredProjects]);

    const selectedClientData = selectedClientName ? clientGroups.find(c => c.name === selectedClientName) : null;

    const generateDraft = (clientData: typeof selectedClientData) => {
        if (!clientData) return;
        
        // Projects are already filtered to 'Sent' by clientGroups logic
        const sentProjects = clientData.projects; 
        
        if (sentProjects.length === 0) {
            // Fallback (shouldn't happen with current logic)
            setEmailSubject(`Checking in - ${clientData.name}`);
            setEmailBody(`Hi ${clientData.name.split(' ')[0]},\n\nI wanted to touch base regarding our recent conversation. Do you have any new requirements?\n\nBest,\nCarsan Electric`);
        } else {
            const projectList = sentProjects.map(p => `- ${p.name} ($${(p.contractValue || 0).toLocaleString()})`).join('\n');
            setEmailSubject(`Follow Up: Outstanding Estimates for ${clientData.name}`);
            setEmailBody(`Hi ${clientData.name.split(' ')[0]},\n\nI hope you are having a great week.\n\nI am writing to follow up on the estimates we sent over recently:\n\n${projectList}\n\nDo you have any questions or need any adjustments to proceed?\n\nBest regards,\nCarsan Electric`);
        }
        
        setEmailTo(clientData.email);
        setActiveTab('email');
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

    const handleSendEmail = async () => {
        if (!emailTo || !emailSubject || !emailBody) {
            alert("Please fill in all fields.");
            return;
        }
        setIsSending(true);
        try {
            await sendOutlookEmail(emailTo, emailSubject, emailBody);
            alert("Email sent successfully!");
            setEmailTo('');
            setEmailSubject('');
            setEmailBody('');
        } catch (e: any) {
            console.error(e);
            if (confirm(`Failed to send via Outlook: ${e.message}\n\nOpen default mail app instead?`)) {
                 window.open(`mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`);
            }
        } finally {
            setIsSending(false);
        }
    };

    const convertToOpportunity = (lead: Lead) => {
        if (!setProjects) return;
        const newProject: ProjectEstimate = {
            id: `proj-${Date.now()}`,
            name: lead.name,
            client: lead.name,
            contactInfo: lead.email,
            address: 'Miami, FL',
            status: 'Draft',
            dateCreated: new Date().toISOString(),
            laborRate: 75,
            items: [],
            contractValue: 0
        };
        setProjects([...projects, newProject]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setActiveTab('pipeline');
    };

    const updateStatus = (id: string, status: ProjectEstimate['status']) => {
        if (!setProjects) return;
        const updated = projects.map(p => p.id === id ? { ...p, status } : p);
        setProjects(updated);
    };

    const moveStage = (projectId: string, direction: 'next' | 'prev') => {
        if (!setProjects) return;
        const stages = ['Draft', 'Sent', 'Won', 'Lost'];
        const updated = projects.map(p => {
            if (p.id === projectId) {
                const idx = stages.indexOf(p.status);
                let newIdx = idx;
                if (direction === 'next' && idx < stages.length - 1) newIdx++;
                if (direction === 'prev' && idx > 0) newIdx--;
                return { ...p, status: stages[newIdx] as any };
            }
            return p;
        });
        setProjects(updated);
    };

    const markAsLost = (projectId: string) => {
        if (!setProjects) return;
        if(confirm("Mark this project as Lost?")) {
            setProjects(projects.map(p => p.id === projectId ? { ...p, status: 'Lost' } : p));
        }
    };

    const deleteProject = (id: string) => {
        if (!setProjects) return;
        if(confirm("Delete this project permanently?")) {
            setProjects(projects.filter(p => p.id !== id));
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
                    <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-[calc(100vw-100px)]">
                        <button 
                            onClick={() => setActiveTab('pipeline')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'pipeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Trello className="w-4 h-4" /> Pipeline
                        </button>
                        <button 
                            onClick={() => setActiveTab('leads')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List className="w-4 h-4" /> Leads
                        </button>
                         <button 
                            onClick={() => setActiveTab('followup')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'followup' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Users className="w-4 h-4" /> Follow Up
                        </button>
                        <button 
                            onClick={() => setActiveTab('email')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'email' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Mail className="w-4 h-4" /> Email
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center animate-in slide-in-from-top-1">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search deals, leads, clients..." 
                        value={crmSearchTerm}
                        onChange={(e) => setCrmSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                    <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase mr-1">Period:</span>
                        <input 
                            type="date" 
                            value={dateFilter.start}
                            onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})}
                            className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                        />
                        <span className="text-slate-400">-</span>
                        <input 
                            type="date" 
                            value={dateFilter.end}
                            onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})}
                            className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                        />
                    </div>
                    <button 
                        onClick={() => setDateFilter({ start: `${currentYear}-01-01`, end: `${currentYear}-12-31` })}
                        className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg whitespace-nowrap"
                    >
                        This Year
                    </button>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><DollarSign className="w-16 h-16 text-blue-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Quoted (Period)</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">${sentInPeriod.toLocaleString()}</p>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-2 ${calcGrowth(sentInPeriod, sentLastPeriod) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {calcGrowth(sentInPeriod, sentLastPeriod) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(calcGrowth(sentInPeriod, sentLastPeriod)).toFixed(1)}% vs Prev Period
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><Trophy className="w-16 h-16 text-emerald-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Won (Period)</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">${wonInPeriod.toLocaleString()}</p>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-2 ${calcGrowth(wonInPeriod, wonLastPeriod) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {calcGrowth(wonInPeriod, wonLastPeriod) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(calcGrowth(wonInPeriod, wonLastPeriod)).toFixed(1)}% vs Prev Period
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><Percent className="w-16 h-16 text-indigo-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Win Rate (Wins/Delivered)</p>
                    <p className="text-2xl font-bold text-indigo-600 mt-1">{winRate.toFixed(1)}%</p>
                    <div className="flex items-center gap-1 text-xs font-bold mt-2 text-slate-500">
                        {wonCount} Wins / {deliveredCount} Delivered
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 p-4 opacity-10"><XCircle className="w-16 h-16 text-red-500" /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Lost Revenue (Period)</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">${lostInPeriod.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 mt-2">Opportunities for review</p>
                </div>
            </div>

            {activeTab === 'pipeline' && (
                <div className="flex-1 overflow-x-auto min-h-[500px] pb-4">
                    <div className="flex gap-4 min-w-[1000px] h-full">
                        {['Draft', 'Sent', 'Won', 'Lost'].map(stage => {
                            const stageOpps = filteredProjects
                                .filter(p => p.status === stage)
                                .filter(p => p.name.toLowerCase().includes(crmSearchTerm.toLowerCase()) || p.client.toLowerCase().includes(crmSearchTerm.toLowerCase()));

                            const totalValue = stageOpps.reduce((sum, p) => sum + (p.contractValue || 0), 0);
                            
                            return (
                                <div key={stage} className="flex-1 bg-slate-100 rounded-xl p-3 flex flex-col h-full border border-slate-200">
                                    <div className="flex justify-between items-center mb-3 px-1">
                                        <h3 className={`font-bold text-sm uppercase ${stage === 'Won' ? 'text-emerald-700' : stage === 'Lost' ? 'text-red-700' : 'text-slate-700'}`}>{stage}</h3>
                                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full border">{stageOpps.length}</span>
                                    </div>
                                    <div className="mb-3 text-right px-1">
                                        <span className="text-xs text-slate-400 font-medium">${totalValue.toLocaleString()}</span>
                                    </div>
                                    
                                    <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                                        {stageOpps.map(project => (
                                            <div key={project.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 group hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[100px]">{project.client}</span>
                                                    <button onClick={() => deleteProject(project.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                                <h4 className="font-bold text-slate-800 text-sm mb-1">{project.name}</h4>
                                                <p className="text-xs text-slate-500 truncate">{project.contactInfo || project.address}</p>
                                                <p className="text-[10px] text-slate-400 mt-1">{new Date(project.dateCreated).toLocaleDateString()}</p>
                                                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                                                    <span className="font-bold text-slate-700 text-sm">${(project.contractValue || 0).toLocaleString()}</span>
                                                    <div className="flex gap-1">
                                                        {stage !== 'Draft' && (
                                                            <button onClick={() => moveStage(project.id, 'prev')} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600" title="Move Back">
                                                                <ArrowRight className="w-4 h-4 rotate-180" />
                                                            </button>
                                                        )}
                                                        {stage !== 'Lost' && (
                                                            <button onClick={() => moveStage(project.id, 'next')} className="p-1 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600">
                                                                <ArrowRight className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'leads' && (
                <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800">Recent Leads</h3>
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{filteredLeads.length}</span>
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
                                {filteredLeads
                                    .filter(l => l.name.toLowerCase().includes(crmSearchTerm.toLowerCase()) || l.email.toLowerCase().includes(crmSearchTerm.toLowerCase()))
                                    .map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50 group">
                                        <td className="px-6 py-4">
                                            <span className="flex items-center gap-2 text-slate-600 font-medium">
                                                <Mail className="w-4 h-4 text-blue-500" /> Outlook
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-900">{lead.name}</td>
                                        <td className="px-6 py-4 text-slate-600">{lead.email}</td>
                                        <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate">{lead.notes}</td>
                                        <td className="px-6 py-4 flex justify-center gap-2">
                                            <button onClick={() => convertToOpportunity(lead)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Convert to Project"><CheckCircle className="w-4 h-4" /></button>
                                            <button onClick={() => discardLead(lead.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Discard"><XCircle className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'followup' && (
                <div className="flex-1 flex flex-col md:flex-row gap-6 h-full overflow-hidden">
                    <div className="w-full md:w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-800 text-sm">Active Clients</h3>
                            <p className="text-xs text-slate-500">Only showing clients with Sent proposals</p>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {clientGroups.length > 0 ? clientGroups.map((client, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => setSelectedClientName(client.name)}
                                    className={`p-4 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition ${selectedClientName === client.name ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-slate-800 text-sm">{client.name}</span>
                                        {client.hasUrgent && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>}
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-slate-500">
                                        <span>{client.sentCount} Active Estimates</span>
                                        <span className="font-medium">${client.totalValue.toLocaleString()}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="p-8 text-center text-slate-400">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">No pending proposals found in this period.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="w-full md:w-2/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        {selectedClientData ? (
                            <div className="flex flex-col h-full">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">{selectedClientData.name}</h2>
                                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                                            <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> {selectedClientData.email}</span>
                                            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3"/> Pipeline: ${selectedClientData.totalValue.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => generateDraft(selectedClientData)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm"><MessageSquare className="w-4 h-4" /> Draft Follow-up</button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    {selectedClientData.projects.map(project => (
                                        <div key={project.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition bg-white group">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-bold text-slate-900">{project.name}</h4>
                                                    <p className="text-xs text-slate-500">{project.address}</p>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold bg-blue-100 text-blue-700`}>{project.status}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-slate-600 mt-3 border-t border-slate-50 pt-3">
                                                <span className="font-bold text-slate-700">${(project.contractValue || 0).toLocaleString()}</span>
                                                <span className="text-xs">Sent: {new Date(project.dateCreated).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <Users className="w-16 h-16 mb-4 opacity-20" />
                                <p>Select a client to view Sent proposals</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* EMAIL COMPOSER - Reused for Follow Up or Direct Email */}
            {activeTab === 'email' && (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <h3 className="font-bold text-slate-800">Compose Email</h3>
                    </div>
                    <div className="p-6 space-y-4 flex-1 overflow-auto">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">To</label>
                            <input 
                                value={emailTo}
                                onChange={(e) => setEmailTo(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="client@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject</label>
                            <input 
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Regarding Project X..."
                            />
                        </div>
                        <div className="flex-1 h-full min-h-[200px]">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Message</label>
                            <textarea 
                                value={emailBody}
                                onChange={(e) => setEmailBody(e.target.value)}
                                className="w-full h-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                placeholder="Type your message here..."
                                style={{ minHeight: '300px' }}
                            />
                        </div>
                    </div>
                    <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                        <button 
                            onClick={() => setActiveTab('pipeline')}
                            className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSendEmail}
                            disabled={isSending}
                            className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-70"
                        >
                            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Send via Outlook
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
