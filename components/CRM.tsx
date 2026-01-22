
import React, { useState, useMemo } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails, sendOutlookEmail, getStoredClientId, setStoredClientId, getStoredTenantId, setStoredTenantId } from '../services/emailIntegration';
import { analyzeIncomingEmail } from '../services/geminiService';
import { Trello, List, Search, RefreshCw, Briefcase, Mail, CheckCircle, XCircle, ArrowRight, Trash2, Eye, Sparkles, MapPin, Phone, AlertTriangle, X, Send, Plus, Loader2, Settings, Clock, Calendar, Zap } from 'lucide-react';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
    projects?: ProjectEstimate[];
    setProjects?: React.Dispatch<React.SetStateAction<ProjectEstimate[]>>;
}

// Pre-defined templates for automation
const EMAIL_TEMPLATES = {
    'check-in': {
        subject: "Checking in on our proposal: {project}",
        body: "Hi {client},\n\nI hope you're having a great week. I just wanted to bubble our proposal for {project} to the top of your inbox.\n\nDo you have any questions about the estimate? We are ready to get started when you are.\n\nBest,\nCarsan Electric"
    },
    'urgent': {
        subject: "Update required: {project} Estimate",
        body: "Hello {client},\n\nWe are finalizing our schedule for the upcoming weeks. Please let us know if you'd like to proceed with {project} so we can reserve your slot.\n\nThank you,\nCarsan Electric"
    },
    'closing': {
        subject: "Closing file for {project}?",
        body: "Hi {client},\n\nI haven't heard back regarding the proposal for {project}. Should I assume this project is on hold or awarded to someone else?\n\nI'll close the file on my end if I don't hear back, but we'd love to work with you.\n\nRegards,\nCarsan Electric"
    }
};

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, projects = [], setProjects }) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'leads' | 'followup'>('followup');
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [analysisProgress, setAnalysisProgress] = useState('');
    
    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [clientId, setClientId] = useState(getStoredClientId() || '');
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');

    // Email & Manual Entry State
    const [emailCompose, setEmailCompose] = useState<{to: string, name: string, subject: string, body: string, projectId?: string} | null>(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    // Automation State
    const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof EMAIL_TEMPLATES>('check-in');
    const [autoPilotProcessing, setAutoPilotProcessing] = useState(false);

    // --- DERIVED DATA ---
    
    // Filter for "Sent" proposals that might need follow up
    const followUpProjects = useMemo(() => {
        return projects
            .filter(p => p.status === 'Sent')
            .map(p => {
                const sentDate = new Date(p.deliveryDate || p.dateCreated);
                const lastContact = p.lastContactDate ? new Date(p.lastContactDate) : sentDate;
                const daysSinceSent = Math.floor((new Date().getTime() - sentDate.getTime()) / (1000 * 3600 * 24));
                const daysSinceContact = Math.floor((new Date().getTime() - lastContact.getTime()) / (1000 * 3600 * 24));
                
                let urgency: 'High' | 'Medium' | 'Low' = 'Low';
                if (daysSinceContact > 7) urgency = 'High';
                else if (daysSinceContact > 3) urgency = 'Medium';

                return { ...p, daysSinceSent, daysSinceContact, urgency };
            })
            .sort((a, b) => b.daysSinceContact - a.daysSinceContact); // Oldest contact first
    }, [projects]);

    const totalPipelineValue = followUpProjects.reduce((sum, p) => sum + (p.contractValue || 0), 0);
    const staleCount = followUpProjects.filter(p => p.daysSinceContact > 7).length;

    // --- HANDLERS ---

    const handleFetchLeads = async () => {
        setIsLoading(true);
        setAnalysisProgress('Connecting to Outlook...');
        try {
            const data = await fetchOutlookEmails();
            setAnalysisProgress(`Fetched ${data.length} emails. Analyzing with AI...`);
            
            const enhancedLeads: Lead[] = [];
            for (const emailLead of data) {
                const exists = leads.find(l => l.id === emailLead.id);
                if (exists) {
                    enhancedLeads.push(exists);
                    continue;
                }
                const subject = emailLead.notes?.split('\n')[0] || "No Subject";
                const bodyPreview = emailLead.notes || "";
                
                const analysis = await analyzeIncomingEmail(subject, bodyPreview);
                const enhancedNote = `**Project:** ${analysis.projectName}\n**Client:** ${analysis.clientName}\n**Urgency:** ${analysis.urgency}\n**Summary:** ${analysis.summary}\n\n**Key Details:**\n${analysis.keyDetails?.map((d:string) => `- ${d}`).join('\n')}`.trim();

                enhancedLeads.push({
                    ...emailLead,
                    company: analysis.clientName !== 'Unknown' ? analysis.clientName : emailLead.company,
                    notes: enhancedNote, 
                    phone: analysis.contactInfo?.phone || emailLead.phone,
                });
            }

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
        } catch (error: any) {
            console.error(error);
            const msg = error.message || "Unknown error";
            alert(`Failed to fetch leads. Ensure Client ID is configured in Settings.\n\nDetails: ${msg}`);
        } finally {
            setIsLoading(false);
            setAnalysisProgress('');
        }
    };

    const convertToOpportunity = (lead: Lead) => {
        if (!setProjects) return;
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
        // Fix: Use functional update correctly typed
        setProjects(prev => [...prev, newProject]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setActiveTab('pipeline');
    };

    const handleSendEmail = async () => {
        if (!emailCompose) return;
        setIsSendingEmail(true);
        try {
            await sendOutlookEmail(emailCompose.to, emailCompose.subject, emailCompose.body);
            
            // Update project last contact date if associated
            if (emailCompose.projectId && setProjects) {
                setProjects(prev => prev.map(p => 
                    p.id === emailCompose.projectId 
                    ? { ...p, lastContactDate: new Date().toISOString() } 
                    : p
                ));
            }

            alert(`Email sent to ${emailCompose.to}`);
            setEmailCompose(null);
        } catch (e: any) {
            alert(`Failed to send: ${e.message}`);
        } finally {
            setIsSendingEmail(false);
        }
    };

    const prepareAutoFollowUp = (project: ProjectEstimate) => {
        const template = EMAIL_TEMPLATES[selectedTemplate];
        const subject = template.subject.replace('{project}', project.name);
        const body = template.body
            .replace('{client}', project.client.split(' ')[0]) // First name estimate
            .replace('{project}', project.name);

        setEmailCompose({
            to: project.contactInfo || '',
            name: project.client,
            subject: subject,
            body: body,
            projectId: project.id
        });
    };

    // --- BATCH PROCESSING (SIMULATED AUTO-PILOT) ---
    const handleRunAutoPilot = async () => {
        const eligible = followUpProjects.filter(p => p.daysSinceContact > 5 && p.contactInfo && p.contactInfo.includes('@'));
        
        if (eligible.length === 0) {
            alert("No projects currently meet the criteria for auto-follow up (> 5 days silence).");
            return;
        }

        if (!confirm(`Found ${eligible.length} projects needing follow-up. This will send emails one by one. Proceed?`)) return;

        setAutoPilotProcessing(true);
        let successCount = 0;

        for (const p of eligible) {
            const template = EMAIL_TEMPLATES['check-in']; // Default to check-in for batch
            const subject = template.subject.replace('{project}', p.name);
            const body = template.body.replace('{client}', p.client).replace('{project}', p.name);

            try {
                await sendOutlookEmail(p.contactInfo!, subject, body);
                // Update local state to reflect sent
                if (setProjects) {
                    setProjects(prev => prev.map(proj => proj.id === p.id ? { ...proj, lastContactDate: new Date().toISOString() } : proj));
                }
                successCount++;
                // Small delay to be polite to API
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.error(`Failed to email ${p.client}`, e);
            }
        }

        setAutoPilotProcessing(false);
        alert(`Auto-Pilot Complete. Sent ${successCount} emails.`);
    };

    // --- DRAG AND DROP HANDLERS (KANBAN) ---
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
            setProjects(prev => prev.map(p => {
                if (p.id === projectId) {
                    const today = new Date().toISOString();
                    const updated = { ...p, status: newStatus };
                    if (newStatus === 'Sent' && !p.deliveryDate) updated.deliveryDate = today;
                    if (newStatus === 'Won' && !p.awardedDate) updated.awardedDate = today;
                    return updated;
                }
                return p;
            }));
        }
    };

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
                        </div>
                    ))}
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
                                To sync emails, you must register an app in Azure AD.
                            </p>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Client ID</label>
                                <input className="w-full border p-2 rounded text-sm mt-1" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Tenant ID</label>
                                <input className="w-full border p-2 rounded text-sm mt-1" value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Redirect URI (Use in Azure)</label>
                                <div className="w-full border p-2 rounded text-xs mt-1 bg-slate-100 text-slate-600 break-all select-all">
                                    {window.location.origin}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                            <button onClick={() => { setStoredClientId(clientId); setStoredTenantId(tenantId); setShowSettings(false); }} className="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800">Save</button>
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
                                <input className="w-full border rounded p-2 text-sm mt-1" value={emailCompose.subject} onChange={(e) => setEmailCompose({...emailCompose, subject: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Message</label>
                                <textarea className="w-full border rounded p-2 text-sm mt-1 min-h-[150px]" value={emailCompose.body} onChange={(e) => setEmailCompose({...emailCompose, body: e.target.value})} />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                            <button onClick={() => setEmailCompose(null)} className="px-4 py-2 text-slate-600 text-sm font-bold">Cancel</button>
                            <button onClick={handleSendEmail} disabled={isSendingEmail} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70">
                                {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>} Send Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CRM & Seguimiento</h1>
                    <p className="text-slate-500 mt-1">Manage leads, track sent proposals, and automate follow-ups.</p>
                </div>
                <div className="bg-slate-100 p-1 rounded-lg flex shadow-sm border border-slate-200">
                    <button 
                        onClick={() => setActiveTab('followup')}
                        className={`px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'followup' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Zap className="w-4 h-4" /> Smart Follow-Up
                    </button>
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

            {/* --- SMART FOLLOW UP VIEW (NEW) --- */}
            {activeTab === 'followup' && (
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    {/* Stats Banner */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 rounded-xl shadow-lg">
                            <p className="text-slate-300 text-xs font-bold uppercase tracking-wider">Total Value Sent</p>
                            <p className="text-2xl font-bold mt-1">${totalPipelineValue.toLocaleString()}</p>
                            <p className="text-slate-400 text-[10px] mt-1">{followUpProjects.length} proposals waiting</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Stale Proposals (&gt;7 Days)</p>
                            <div className="flex items-end justify-between mt-1">
                                <p className={`text-2xl font-bold ${staleCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{staleCount}</p>
                                {staleCount > 0 && <AlertTriangle className="w-5 h-5 text-red-500 mb-1" />}
                            </div>
                        </div>
                        <div className="md:col-span-2 bg-indigo-50 border border-indigo-100 p-5 rounded-xl flex items-center justify-between shadow-sm">
                            <div>
                                <h3 className="font-bold text-indigo-900 flex items-center gap-2"><Zap className="w-4 h-4"/> Auto-Pilot Mode</h3>
                                <p className="text-xs text-indigo-700 mt-1 max-w-xs">Send pre-written follow-up emails to all eligible clients instantly.</p>
                            </div>
                            <button 
                                onClick={handleRunAutoPilot}
                                disabled={autoPilotProcessing}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50"
                            >
                                {autoPilotProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Run Batch Follow-Up
                            </button>
                        </div>
                    </div>

                    {/* Main List */}
                    <div className="bg-white border border-slate-200 rounded-xl flex-1 overflow-hidden flex flex-col shadow-sm">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-500"/> Proposals Pending Response</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Default Template:</span>
                                <select 
                                    className="text-xs border border-slate-300 rounded p-1"
                                    value={selectedTemplate}
                                    onChange={(e) => setSelectedTemplate(e.target.value as any)}
                                >
                                    <option value="check-in">Friendly Check-in</option>
                                    <option value="urgent">Urgent Update</option>
                                    <option value="closing">Closing File</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-slate-500 font-bold text-xs border-b border-slate-100 uppercase sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3">Project / Client</th>
                                        <th className="px-4 py-3">Sent Date</th>
                                        <th className="px-4 py-3">Last Contact</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-6 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {followUpProjects.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900">{p.name}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Briefcase className="w-3 h-3"/> {p.client}</div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-600">
                                                {new Date(p.deliveryDate || p.dateCreated).toLocaleDateString()}
                                                <div className="text-[10px] text-slate-400">{p.daysSinceSent} days ago</div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold ${p.urgency === 'High' ? 'bg-red-50 text-red-600 border border-red-100' : p.urgency === 'Medium' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-600'}`}>
                                                    {p.urgency === 'High' && <AlertTriangle className="w-3 h-3" />}
                                                    {p.daysSinceContact} days silent
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-100">Sent</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => prepareAutoFollowUp(p)}
                                                        className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                                                    >
                                                        <Mail className="w-3 h-3" /> Email
                                                    </button>
                                                    {setProjects && (
                                                        <>
                                                            <button onClick={() => { if(confirm("Mark Won?")) setProjects(prev => prev.map(proj => proj.id === p.id ? {...proj, status: 'Won'} : proj)); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Won"><CheckCircle className="w-4 h-4"/></button>
                                                            <button onClick={() => { if(confirm("Mark Lost?")) setProjects(prev => prev.map(proj => proj.id === p.id ? {...proj, status: 'Lost'} : proj)); }} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Lost"><XCircle className="w-4 h-4"/></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {followUpProjects.length === 0 && (
                                        <tr><td colSpan={5} className="py-12 text-center text-slate-400">No sent proposals pending follow-up.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

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
                            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search leads..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div className="flex items-center gap-2">
                            {analysisProgress && <span className="text-xs text-blue-600 font-medium animate-pulse">{analysisProgress}</span>}
                            <button onClick={() => setShowSettings(true)} className="bg-white border border-slate-300 text-slate-700 p-2 rounded-lg hover:bg-slate-50"><Settings className="w-4 h-4" /></button>
                            <button onClick={handleFetchLeads} disabled={isLoading} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2 disabled:opacity-70"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Sync Outlook</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-500 font-bold uppercase text-xs sticky top-0"><tr><th className="px-6 py-3">From (Contact)</th><th className="px-6 py-3">Client / Project</th><th className="px-6 py-3">Summary</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {leads.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase())).map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50 group transition-colors">
                                        <td className="px-6 py-4"><div className="font-bold text-slate-900">{lead.name}</div><div className="text-xs text-slate-500 mt-1">{lead.email}</div></td>
                                        <td className="px-6 py-4"><div className="font-bold text-blue-600 text-xs uppercase">{lead.company}</div><div className="text-[10px] text-slate-400 mt-1">{new Date(lead.dateAdded).toLocaleDateString()}</div></td>
                                        <td className="px-6 py-4"><div className="max-w-md text-slate-500 text-xs">{lead.notes?.substring(0, 60)}...</div></td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setEmailCompose({to: lead.email, name: lead.name, subject: 'Re: Project', body: `Hi ${lead.name},\n\n`})} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><Mail className="w-4 h-4" /></button>
                                                <button onClick={() => convertToOpportunity(lead)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"><Briefcase className="w-4 h-4" /></button>
                                            </div>
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
