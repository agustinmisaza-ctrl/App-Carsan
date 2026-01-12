
import React, { useState } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails, sendOutlookEmail, getStoredClientId, setStoredClientId, getStoredTenantId, setStoredTenantId } from '../services/emailIntegration';
import { analyzeIncomingEmail } from '../services/geminiService';
import { Trello, List, Search, RefreshCw, Briefcase, Mail, CheckCircle, XCircle, ArrowRight, Trash2, Eye, Sparkles, MapPin, Phone, AlertTriangle, X, Send, Plus, Loader2, Settings } from 'lucide-react';

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
    const [analysisProgress, setAnalysisProgress] = useState('');
    
    // Detailed View State
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [clientId, setClientId] = useState(getStoredClientId() || '');
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');

    // Email & Manual Entry State
    const [emailCompose, setEmailCompose] = useState<{to: string, name: string, subject: string, body: string} | null>(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [showAddLead, setShowAddLead] = useState(false);
    const [newLead, setNewLead] = useState<Partial<Lead>>({ name: '', email: '', company: '', phone: '', source: 'Manual', notes: '' });

    const handleFetchLeads = async () => {
        setIsLoading(true);
        setAnalysisProgress('Connecting to Outlook...');
        try {
            // 1. Fetch raw emails
            const data = await fetchOutlookEmails();
            setAnalysisProgress(`Fetched ${data.length} emails. Analyzing with AI...`);
            
            // 2. Enhance with AI
            const enhancedLeads: Lead[] = [];
            
            for (const emailLead of data) {
                // Check if we already have this lead
                const exists = leads.find(l => l.id === emailLead.id);
                if (exists) {
                    enhancedLeads.push(exists);
                    continue;
                }

                // AI Analysis
                const subject = emailLead.notes?.split('\n')[0] || "No Subject";
                const bodyPreview = emailLead.notes || "";
                
                const analysis = await analyzeIncomingEmail(subject, bodyPreview);
                
                // Construct enhanced note
                const enhancedNote = `
**Project:** ${analysis.projectName}
**Client:** ${analysis.clientName}
**Urgency:** ${analysis.urgency}
**Summary:** ${analysis.summary}

**Key Details:**
${analysis.keyDetails?.map((d:string) => `- ${d}`).join('\n')}
                `.trim();

                enhancedLeads.push({
                    ...emailLead,
                    company: analysis.clientName !== 'Unknown' ? analysis.clientName : emailLead.company,
                    notes: enhancedNote, 
                    phone: analysis.contactInfo?.phone || emailLead.phone,
                });
            }

            // Merge and Dedupe
            const finalLeads = [...enhancedLeads];
            leads.forEach(old => {
                if (!finalLeads.find(f => f.id === old.id)) {
                    finalLeads.push(old);
                }
            });
            
            finalLeads.sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());

            setLeads(finalLeads);
            setAnalysisProgress('');
            alert(`Sync Complete. Processed ${data.length} items.`);
        } catch (error) {
            console.error(error);
            alert("Failed to fetch leads. Ensure Client ID is configured in Settings.");
        } finally {
            setIsLoading(false);
            setAnalysisProgress('');
        }
    };

    const convertToOpportunity = (lead: Lead) => {
        if (!setProjects) return;
        
        // Extract Project Name from AI notes if possible
        const projectMatch = lead.notes?.match(/\*\*Project:\*\* (.*)/);
        const projectName = projectMatch ? projectMatch[1] : `Project for ${lead.name}`;

        const newProject: ProjectEstimate = {
            id: `proj-${Date.now()}`,
            name: projectName,
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
        setLeads(leads.filter(l => l.id !== lead.id));
        setActiveTab('pipeline');
    };

    const deleteLead = (id: string) => {
        if(confirm("Are you sure you want to permanently erase this email/lead from the CRM?")) {
            setLeads(leads.filter(l => l.id !== id));
            if (selectedLead?.id === id) setSelectedLead(null);
        }
    };

    const handleSendEmail = async () => {
        if (!emailCompose) return;
        setIsSendingEmail(true);
        try {
            await sendOutlookEmail(emailCompose.to, emailCompose.subject, emailCompose.body);
            alert(`Email sent to ${emailCompose.to}`);
            setEmailCompose(null);
        } catch (e: any) {
            alert(`Failed to send: ${e.message}`);
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleAddManualLead = () => {
        if (!newLead.name || !newLead.email) {
            alert("Name and Email are required");
            return;
        }
        const lead: Lead = {
            id: `manual-${Date.now()}`,
            name: newLead.name,
            email: newLead.email,
            company: newLead.company || 'Unknown',
            phone: newLead.phone || '',
            source: 'Manual',
            status: 'New',
            notes: newLead.notes || 'Manually added lead.',
            dateAdded: new Date().toISOString()
        };
        setLeads([lead, ...leads]);
        setShowAddLead(false);
        setNewLead({ name: '', email: '', company: '', phone: '', source: 'Manual', notes: '' });
    };

    const handleSaveSettings = () => {
        setStoredClientId(clientId);
        setStoredTenantId(tenantId);
        setShowSettings(false);
        alert("Settings saved. Please try syncing again.");
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, projectId: string) => {
        e.dataTransfer.setData("projectId", projectId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, newStatus: ProjectEstimate['status']) => {
        e.preventDefault();
        const projectId = e.dataTransfer.getData("projectId");
        
        if (projectId && setProjects) {
            const updatedProjects = projects.map(p => {
                if (p.id === projectId) {
                    const today = new Date().toISOString();
                    const updated = { ...p, status: newStatus };
                    // Auto-update dates based on status change
                    if (newStatus === 'Sent' && !p.deliveryDate) updated.deliveryDate = today;
                    if (newStatus === 'Won' && !p.awardedDate) updated.awardedDate = today;
                    if (newStatus === 'Ongoing' && !p.startDate) updated.startDate = today.split('T')[0];
                    return updated;
                }
                return p;
            });
            setProjects(updatedProjects);
        }
    };

    // --- PIPELINE KANBAN ---
    const renderKanbanColumn = (title: string, status: ProjectEstimate['status'], colorClass: string) => {
        const items = projects.filter(p => p.status === status);
        const totalValue = items.reduce((sum, p) => sum + (p.contractValue || 0), 0);

        return (
            <div 
                className="flex-1 min-w-[280px] bg-slate-100 rounded-xl flex flex-col h-full border border-slate-200 transition-colors"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
            >
                <div className={`p-3 rounded-t-xl border-b border-slate-200 ${colorClass} bg-opacity-10`}>
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm uppercase">{title}</h3>
                        <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-slate-500">{items.length}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-500 mt-1">${totalValue.toLocaleString()}</p>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
                    {items.map(p => (
                        <div 
                            key={p.id} 
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, p.id)}
                            className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition cursor-grab active:cursor-grabbing group relative"
                        >
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
                        <div className="text-center py-8 text-slate-400 text-xs italic border-2 border-dashed border-slate-200 rounded-lg m-2">
                            Arrastra proyectos aquí
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto h-full flex flex-col space-y-6 relative">
            
            {/* SETTINGS MODAL */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Settings className="w-4 h-4 text-slate-500" /> Outlook Configuration
                            </h3>
                            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-slate-500 mb-4">
                                To sync emails, you must register an app in Azure AD and provide the Client ID here. 
                                <br/>
                                <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className="text-blue-600 underline">Azure Portal</a>
                            </p>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Client ID (Application ID)</label>
                                <input 
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="e.g. f13f2359-eec6-..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tenant ID (Optional)</label>
                                <input 
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={tenantId}
                                    onChange={(e) => setTenantId(e.target.value)}
                                    placeholder="common"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                            <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-600 text-sm font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button 
                                onClick={handleSaveSettings}
                                className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EMAIL COMPOSE MODAL */}
            {emailCompose && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Mail className="w-4 h-4 text-blue-600" /> Compose Email
                            </h3>
                            <button onClick={() => setEmailCompose(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">To</label>
                                <div className="text-sm font-medium text-slate-900 border-b border-slate-100 py-1">{emailCompose.name} &lt;{emailCompose.to}&gt;</div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Subject</label>
                                <input 
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={emailCompose.subject}
                                    onChange={(e) => setEmailCompose({...emailCompose, subject: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Message</label>
                                <textarea 
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px]"
                                    value={emailCompose.body}
                                    onChange={(e) => setEmailCompose({...emailCompose, body: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                            <button onClick={() => setEmailCompose(null)} className="px-4 py-2 text-slate-600 text-sm font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                            <button 
                                onClick={handleSendEmail}
                                disabled={isSendingEmail}
                                className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70"
                            >
                                {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Send Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD MANUAL LEAD MODAL */}
            {showAddLead && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Add New Lead</h3>
                            <button onClick={() => setShowAddLead(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <input placeholder="Lead Name" className="w-full border rounded-lg p-2 text-sm" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} />
                            <input placeholder="Email" className="w-full border rounded-lg p-2 text-sm" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} />
                            <input placeholder="Company" className="w-full border rounded-lg p-2 text-sm" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} />
                            <input placeholder="Phone" className="w-full border rounded-lg p-2 text-sm" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} />
                            <textarea placeholder="Notes" className="w-full border rounded-lg p-2 text-sm" value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                            <button onClick={() => setShowAddLead(false)} className="px-4 py-2 text-slate-600 text-sm font-bold">Cancel</button>
                            <button onClick={handleAddManualLead} className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800">Add Lead</button>
                        </div>
                    </div>
                </div>
            )}

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
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
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
                        <div className="flex items-center gap-2">
                            {analysisProgress && <span className="text-xs text-blue-600 font-medium animate-pulse">{analysisProgress}</span>}
                            <button 
                                onClick={() => setShowSettings(true)}
                                className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-50"
                                title="Configure Outlook"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => setShowAddLead(true)}
                                className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Lead
                            </button>
                            <button 
                                onClick={handleFetchLeads}
                                disabled={isLoading}
                                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-70"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                Sync Outlook
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">From (Contact)</th>
                                    <th className="px-6 py-3">Client / Project</th>
                                    <th className="px-6 py-3">Summary</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {leads
                                    .filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.email.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(lead => {
                                        // Attempt to extract structured data from formatted notes if AI processed it
                                        const projectMatch = lead.notes?.match(/\*\*Project:\*\* (.*)/);
                                        const projectDisplay = projectMatch ? projectMatch[1] : lead.company;
                                        
                                        const summaryMatch = lead.notes?.match(/\*\*Summary:\*\* (.*)/);
                                        const summaryDisplay = summaryMatch ? summaryMatch[1].substring(0, 60) + '...' : (lead.notes?.substring(0, 50) + '...');

                                        return (
                                            <tr key={lead.id} className="hover:bg-slate-50 group transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-900">{lead.name}</div>
                                                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                                        <Mail className="w-3 h-3" /> {lead.email}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-blue-600 text-xs uppercase tracking-wide">{lead.company}</div>
                                                    <div className="text-sm font-medium text-slate-700">{projectDisplay}</div>
                                                    <div className="text-[10px] text-slate-400 mt-1">
                                                        {new Date(lead.dateAdded).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="max-w-md text-slate-500 text-xs leading-relaxed">
                                                        {summaryDisplay}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => setEmailCompose({to: lead.email, name: lead.name, subject: `Re: Project Inquiry`, body: `Hi ${lead.name},\n\n`})}
                                                            className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition"
                                                            title="Send Email"
                                                        >
                                                            <Mail className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => setSelectedLead(lead)}
                                                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                                                            title="View Details"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => convertToOpportunity(lead)}
                                                            className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition"
                                                            title="Convert to Estimate"
                                                        >
                                                            <Briefcase className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => deleteLead(lead.id)}
                                                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                                                            title="Discard Lead"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                {leads.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-slate-400">
                                            No leads found. Click "Sync Outlook" to fetch emails or "Add Lead" to create manually.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* DETAIL MODAL */}
                    {selectedLead && (
                        <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex justify-end">
                            <div className="w-full max-w-lg bg-white h-full shadow-2xl p-6 flex flex-col animate-in slide-in-from-right-10 duration-300">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">Lead Details</h2>
                                        <p className="text-sm text-slate-500">AI Analysis & Original Message</p>
                                    </div>
                                    <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-600">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-6">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                                {selectedLead.name.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900">{selectedLead.name}</p>
                                                <p className="text-xs text-slate-500">{selectedLead.company}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Mail className="w-4 h-4" /> {selectedLead.email}
                                            </div>
                                            {selectedLead.phone && (
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <Phone className="w-4 h-4" /> {selectedLead.phone}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Briefcase className="w-4 h-4" /> {selectedLead.source}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions in Detail View */}
                                    <button 
                                        onClick={() => {
                                            setEmailCompose({to: selectedLead.email, name: selectedLead.name, subject: 'Re: Project', body: `Hi ${selectedLead.name},\n\n`});
                                        }}
                                        className="w-full py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 flex items-center justify-center gap-2"
                                    >
                                        <Mail className="w-4 h-4" /> Reply via Email
                                    </button>

                                    {/* AI Analysis Section */}
                                    <div className="bg-white border border-indigo-100 rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-indigo-600" />
                                            <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">AI Insight</span>
                                        </div>
                                        <div className="p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                            {selectedLead.notes || "No analysis available."}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 flex gap-3">
                                    <button 
                                        onClick={() => deleteLead(selectedLead.id)}
                                        className="flex-1 py-3 border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 flex items-center justify-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" /> Discard
                                    </button>
                                    <button 
                                        onClick={() => { convertToOpportunity(selectedLead); setSelectedLead(null); }}
                                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"
                                    >
                                        <Briefcase className="w-4 h-4" /> Create Estimate
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
