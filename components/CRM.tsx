
import React, { useState } from 'react';
import { Lead, ProjectEstimate } from '../types';
import { fetchOutlookEmails, sendOutlookEmail } from '../services/emailIntegration';
import { Trello, List, Plus, Search, Calendar, RefreshCw, User, Briefcase, DollarSign, Mail, CheckCircle, XCircle, ArrowRight, Trash2, Send, Clock, AlertCircle, ChevronRight, Inbox } from 'lucide-react';
import { robustParseDate } from '../utils/purchaseData';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
    projects?: ProjectEstimate[];
    setProjects?: (projects: ProjectEstimate[]) => void;
}

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, projects = [], setProjects }) => {
    const [activeTab, setActiveTab] = useState<'pipeline' | 'leads' | 'followup' | 'email'>('pipeline');
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Email State
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [replySubject, setReplySubject] = useState('');
    const [replyBody, setReplyBody] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);

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
            if (activeTab === 'email' && !selectedLead && data.length > 0) {
                 // Optionally select first email
            }
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
        if(confirm("Are you sure you want to discard this item?")) {
            setLeads(leads.filter(l => l.id !== id));
            if (selectedLead?.id === id) setSelectedLead(null);
        }
    };

    const handleSendReply = async () => {
        if (!selectedLead || !replyBody) return;
        setSendingEmail(true);
        try {
            await sendOutlookEmail(selectedLead.email, replySubject, replyBody);
            alert("Email sent successfully!");
            setReplyBody('');
            // Mark as contacted or similar logic could go here
        } catch (e: any) {
            alert("Failed to send: " + e.message);
        } finally {
            setSendingEmail(false);
        }
    };

    const upcomingFollowUps = projects
        .filter(p => p.followUpDate && new Date(p.followUpDate) <= new Date() && !['Won', 'Lost', 'Completed'].includes(p.status))
        .sort((a,b) => new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime());

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
                    <p className="text-slate-500 mt-1">Manage leads, follow-ups, and project stages.</p>
                </div>
                <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-full">
                    <button 
                        onClick={() => setActiveTab('pipeline')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'pipeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Trello className="w-4 h-4" /> Pipeline
                    </button>
                    <button 
                        onClick={() => setActiveTab('followup')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'followup' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock className="w-4 h-4" /> Follow Up
                        {upcomingFollowUps.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{upcomingFollowUps.length}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('email')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'email' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Mail className="w-4 h-4" /> Email
                    </button>
                    <button 
                        onClick={() => setActiveTab('leads')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
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

            {/* --- FOLLOW UP VIEW --- */}
            {activeTab === 'followup' && (
                <div className="max-w-4xl mx-auto w-full">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                             <AlertCircle className="w-5 h-5 text-orange-500" />
                             <h2 className="font-bold text-slate-800">Pending Follow Ups</h2>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {upcomingFollowUps.map(p => (
                                <div key={p.id} className="p-6 flex flex-col md:flex-row justify-between md:items-center hover:bg-orange-50/50 transition-colors gap-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-900 text-lg">{p.name}</h3>
                                            <span className="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium text-slate-500">{p.status}</span>
                                        </div>
                                        <p className="text-slate-500 flex items-center gap-2 mt-1">
                                            <User className="w-4 h-4" /> {p.client} 
                                            <span className="text-slate-300">|</span> 
                                            <DollarSign className="w-4 h-4" /> ${(p.contractValue || 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-2 text-orange-600 font-bold bg-orange-100 px-3 py-1 rounded-lg text-sm">
                                            <Clock className="w-4 h-4" />
                                            Due: {new Date(p.followUpDate!).toLocaleDateString()}
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => {
                                                    const subject = `Follow up: ${p.name}`;
                                                    const body = `Hello ${p.client.split(' ')[0]},\n\nI wanted to follow up on the estimate for ${p.name}. Do you have any questions?\n\nBest regards,\nCarsan Electric`;
                                                    window.open(`mailto:${p.contactInfo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                                                }}
                                                className="text-sm bg-white border border-slate-300 px-3 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                                <Mail className="w-4 h-4" /> Email Client
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (setProjects) {
                                                        const nextWeek = new Date();
                                                        nextWeek.setDate(nextWeek.getDate() + 7);
                                                        const upd = projects.map(proj => proj.id === p.id ? {...proj, followUpDate: nextWeek.toISOString()} : proj);
                                                        setProjects(upd);
                                                    }
                                                }}
                                                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700"
                                            >
                                                Snooze 1 Week
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {upcomingFollowUps.length === 0 && (
                                <div className="p-12 text-center text-slate-400">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                                    <p className="font-medium">All caught up! No pending follow ups.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- EMAIL VIEW --- */}
            {activeTab === 'email' && (
                <div className="flex h-[calc(100vh-240px)] gap-6">
                    {/* Sidebar List */}
                    <div className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Inbox className="w-4 h-4" /> Inbox</h3>
                            <button onClick={handleFetchLeads} disabled={isLoading} className="text-slate-500 hover:text-blue-600 disabled:animate-spin">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                            {leads.filter(l => l.source === 'Outlook').map(lead => (
                                <div 
                                    key={lead.id} 
                                    onClick={() => {
                                        setSelectedLead(lead);
                                        setReplySubject(`Re: ${lead.notes?.split('\n')[0].replace('Subject: ', '') || 'Project Inquiry'}`);
                                    }}
                                    className={`p-4 cursor-pointer transition-colors hover:bg-blue-50 ${selectedLead?.id === lead.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="font-bold text-slate-900 text-sm truncate w-2/3">{lead.name}</p>
                                        <span className="text-[10px] text-slate-400">{new Date(lead.dateAdded).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate">{lead.notes?.split('\n')[0].replace('Subject: ', '') || 'No Subject'}</p>
                                </div>
                            ))}
                            {leads.filter(l => l.source === 'Outlook').length === 0 && (
                                <div className="p-8 text-center">
                                    <button onClick={handleFetchLeads} className="text-sm text-blue-600 font-bold hover:underline">Sync Outlook</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Email Content */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        {selectedLead ? (
                            <>
                                <div className="p-6 border-b border-slate-200">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900 mb-2">{selectedLead.notes?.split('\n')[0].replace('Subject: ', '')}</h2>
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                                    {selectedLead.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-900">{selectedLead.name}</span>
                                                    <span className="text-slate-400 mx-1">&lt;{selectedLead.email}&gt;</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => convertToOpportunity(selectedLead)} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200">
                                                Convert to Project
                                            </button>
                                            <button onClick={() => deleteLead(selectedLead.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
                                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                        {selectedLead.notes?.split('Preview: ')[1] || selectedLead.notes || "No content."}
                                    </div>
                                </div>
                                <div className="p-4 bg-white border-t border-slate-200">
                                    <div className="mb-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Reply</label>
                                        <input 
                                            value={replySubject} 
                                            onChange={(e) => setReplySubject(e.target.value)}
                                            className="w-full text-sm border-b border-slate-200 py-1 mb-2 outline-none font-medium"
                                        />
                                        <textarea 
                                            value={replyBody}
                                            onChange={(e) => setReplyBody(e.target.value)}
                                            className="w-full p-3 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:border-blue-500 outline-none h-24 resize-none"
                                            placeholder="Type your reply..."
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={handleSendReply} 
                                            disabled={sendingEmail}
                                            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {sendingEmail ? 'Sending...' : <><Send className="w-4 h-4" /> Send Reply</>}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                <Mail className="w-12 h-12 mb-3 text-slate-300" />
                                <p>Select an email to view</p>
                            </div>
                        )}
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
