
import React, { useState, useEffect } from 'react';
import { Lead, Opportunity, OpportunityStage, User, ProjectEstimate } from '../types';
import { extractLeadFromText } from '../services/geminiService';
import { getStoredClientId, setStoredClientId, fetchOutlookEmails, getStoredTenantId, setStoredTenantId } from '../services/emailIntegration';
import { Search, Plus, Mail, Phone, Calendar, MoreHorizontal, CheckCircle, ArrowRight, Loader2, RefreshCw, LayoutTemplate, List, Sparkles, Settings, Copy, ExternalLink, Save, Check, LayoutDashboard, Clock, AlertTriangle, Users, Trash2, Forward, TrendingUp, ArrowUpRight, ArrowDownRight, DollarSign, XCircle, Trophy } from 'lucide-react';

interface CRMProps {
  user: User;
  projects?: ProjectEstimate[]; // Projects passed from App.tsx
  leads: Lead[];
  setLeads: (leads: Lead[]) => void;
  opportunities: Opportunity[];
  setOpportunities: (ops: Opportunity[]) => void;
}

const STAGES: OpportunityStage[] = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];

export const CRM: React.FC<CRMProps> = ({ user, projects = [], leads, setLeads, opportunities, setOpportunities }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline' | 'leads' | 'outlook'>('dashboard');
  
  // Outlook / AI State
  const [isSyncing, setIsSyncing] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiResult, setAiResult] = useState<Partial<Lead> | null>(null);

  // Configuration State
  const [clientId, setClientId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
      const storedClient = getStoredClientId();
      const storedTenant = getStoredTenantId();
      if (storedClient) setClientId(storedClient);
      if (storedTenant) setTenantId(storedTenant);
  }, []);

  // Filter Ops
  const myOps = user.role === 'admin' ? opportunities : opportunities.filter(o => o.owner === user.name);

  // --- ACTIONS ---

  const handleStageChange = (id: string, newStage: OpportunityStage) => {
    setOpportunities(opportunities.map(op => op.id === id ? { ...op, stage: newStage } : op));
  };

  const handleSaveConfig = () => {
      setStoredClientId(clientId);
      setStoredTenantId(tenantId);
      setConfigError(null);
      alert("Configuration saved!");
      setShowConfig(false);
  };

  const handleCopyUrl = () => {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncOutlook = async () => {
    setIsSyncing(true);
    setConfigError(null);
    try {
        const newLeads = await fetchOutlookEmails();
        if (newLeads.length > 0) {
            setLeads([
                ...newLeads.filter(l => !leads.some(existing => existing.id === l.id)),
                ...leads
            ]);
            alert(`Synced ${newLeads.length} leads from Outlook.`);
        } else {
            alert("Sync complete. No new relevant emails found (looking for 'Quote', 'Estimate', etc).");
        }
    } catch (e: any) {
        const errStr = String(e).toLowerCase();
        
        // Handle Redirect URI Mismatch (AADSTS50011)
        if (errStr.includes("aadsts50011")) {
            const msg = "Azure Configuration Error: The current URL is not authorized.";
            setConfigError(msg);
            setShowConfig(true);
            return;
        }

        // If user cancelled manually, don't show a scary error
        if (errStr.includes("user_cancelled") || errStr.includes("interaction_in_progress")) {
            console.log("Sync cancelled by user.");
            return;
        }
        
        alert("Sync failed. Check your Tenant ID and Client ID in settings.");
    } finally {
        setIsSyncing(false);
    }
  };

  const handleAIParse = async () => {
      if (!emailText) return;
      setIsProcessingAI(true);
      try {
          const result = await extractLeadFromText(emailText);
          setAiResult(result);
      } catch (e) {
          alert("AI extraction failed.");
      } finally {
          setIsProcessingAI(false);
      }
  };

  const saveAILead = () => {
      if (!aiResult || !aiResult.name) return;
      const newLead: Lead = {
          id: Date.now().toString(),
          name: aiResult.name,
          company: aiResult.company || '',
          email: aiResult.email || '',
          phone: aiResult.phone || '',
          source: 'Outlook',
          status: 'New',
          notes: aiResult.notes || 'Extracted via AI',
          dateAdded: new Date().toISOString()
      };
      setLeads([newLead, ...leads]);
      setAiResult(null);
      setEmailText('');
      setActiveTab('leads');
  };

  const handleDiscardLead = (id: string) => {
      if (confirm('Are you sure you want to discard this lead?')) {
          setLeads(leads.filter(l => l.id !== id));
      }
  };

  const handleForwardLead = (lead: Lead) => {
      const to = 'simon.martinez@carsanelectric.com';
      const subject = `Fwd: Lead - ${lead.name} (${lead.company})`;
      const body = `Forwarding lead information:\n\nName: ${lead.name}\nEmail: ${lead.email}\nPhone: ${lead.phone}\n\nOriginal Content:\n${lead.notes}`;
      
      window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  // --- DASHBOARD HELPERS ---
  const getProjectValue = (p: ProjectEstimate) => {
      if (p.contractValue) return p.contractValue;
      const mat = p.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
      const lab = p.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * i.laborRate), 0);
      const sub = mat + lab;
      return sub + (sub * 0.25); // + Overhead & Profit
  };

  const getStaleEstimates = () => {
      const today = new Date();
      return projects.filter(p => {
          if (p.status !== 'Sent') return false;
          const created = new Date(p.dateCreated);
          // Older than 30 days
          const diffTime = Math.abs(today.getTime() - created.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays > 30;
      });
  };

  // Groups all SENT estimates by client to enable bulk follow up
  const getPendingByClient = () => {
      const pending = projects.filter(p => p.status === 'Sent');
      const grouped: Record<string, ProjectEstimate[]> = {};
      pending.forEach(p => {
          if (!grouped[p.client]) grouped[p.client] = [];
          grouped[p.client].push(p);
      });
      // Sort by number of pending projects
      return Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
  };

  const handleCall = (number: string) => {
      window.location.href = `tel:${number}`;
  };

  const handleEmailFollowUp = (project: ProjectEstimate) => {
      const email = extractEmail(project.contactInfo) || '';
      const subject = `Follow up: ${project.name} - Carsan Electric`;
      const body = `Hi ${project.client},\n\nI'm checking in regarding the estimate we sent for ${project.name} on ${new Date(project.dateCreated).toLocaleDateString()}. \n\nDo you have any questions about the proposal? We are ready to schedule this work.\n\nBest regards,\n${user.name}\nCarsan Electric`;
      
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleBulkEmail = (clientName: string, clientProjects: ProjectEstimate[]) => {
      const contactInfo = clientProjects[0].contactInfo || '';
      const email = extractEmail(contactInfo) || '';
      
      const projectNames = clientProjects.map(p => `- ${p.name}`).join('\n');
      const subject = `Pending Estimates - Carsan Electric`;
      const body = `Hi ${clientName},\n\nWe have the following pending estimates for you:\n\n${projectNames}\n\nI wanted to follow up to see if you have made a decision on any of these projects. Please let us know if you need any revisions.\n\nBest regards,\n${user.name}\nCarsan Electric`;
      
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const extractEmail = (contact?: string) => {
      if (!contact) return null;
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
      const match = contact.match(emailRegex);
      return match ? match[0] : null;
  };
  
  const extractPhone = (contact?: string) => {
      if (!contact) return null;
      // Simple digit extractor for MVP
      const phoneRegex = /(\+?1?[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}/g;
      const match = contact.match(phoneRegex);
      return match ? match[0] : null;
  };

  const formatCurrency = (val: number) => '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // FINANCIAL STATS CALCULATION
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  // Helpers
  const sumProjects = (projList: ProjectEstimate[]) => projList.reduce((acc, p) => acc + getProjectValue(p), 0);
  
  const thisYearProjects = projects.filter(p => new Date(p.dateCreated).getFullYear() === currentYear);
  const lastYearProjects = projects.filter(p => new Date(p.dateCreated).getFullYear() === lastYear);

  // 1. Quoted Volume (Everything Sent out, including Won/Lost, excluding Drafts)
  const quotedThisYear = sumProjects(thisYearProjects.filter(p => p.status !== 'Draft'));
  const quotedLastYear = sumProjects(lastYearProjects.filter(p => p.status !== 'Draft'));
  const quotedGrowth = quotedLastYear > 0 ? ((quotedThisYear - quotedLastYear) / quotedLastYear) * 100 : 0;

  // 2. Won Volume
  const wonThisYear = sumProjects(thisYearProjects.filter(p => p.status === 'Won'));
  const wonLastYear = sumProjects(lastYearProjects.filter(p => p.status === 'Won'));
  const wonGrowth = wonLastYear > 0 ? ((wonThisYear - wonLastYear) / wonLastYear) * 100 : 0;

  // 3. Lost Volume
  const lostThisYear = sumProjects(thisYearProjects.filter(p => p.status === 'Lost'));
  const lostLastYear = sumProjects(lastYearProjects.filter(p => p.status === 'Lost'));
  const lostChange = lostLastYear > 0 ? ((lostThisYear - lostLastYear) / lostLastYear) * 100 : 0;


  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              CRM & Sales
              <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">v2.0</span>
          </h1>
          <p className="text-slate-500 mt-1">Manage leads, track pipeline, and automate follow-ups.</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-full">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button 
                onClick={() => setActiveTab('pipeline')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'pipeline' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <LayoutTemplate className="w-4 h-4" /> Pipeline
            </button>
            <button 
                onClick={() => setActiveTab('leads')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <List className="w-4 h-4" /> Leads
            </button>
            <button 
                onClick={() => setActiveTab('outlook')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'outlook' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <Mail className="w-4 h-4" /> Outlook
            </button>
        </div>
      </div>

      {/* --- CRM DASHBOARD --- */}
      {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* Year over Year Financials */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {/* Total Quoted */}
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                       <div className="flex justify-between items-start mb-2">
                           <div>
                               <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Total Quoted (YTD)</h3>
                               <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(quotedThisYear)}</p>
                           </div>
                           <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                               <DollarSign className="w-5 h-5" />
                           </div>
                       </div>
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                           {quotedGrowth >= 0 ? (
                               <span className="text-emerald-600 flex items-center"><ArrowUpRight className="w-3 h-3 mr-0.5" /> {quotedGrowth.toFixed(1)}%</span>
                           ) : (
                               <span className="text-red-600 flex items-center"><ArrowDownRight className="w-3 h-3 mr-0.5" /> {Math.abs(quotedGrowth).toFixed(1)}%</span>
                           )}
                           <span className="text-slate-400">vs Last Year ({formatCurrency(quotedLastYear)})</span>
                       </div>
                   </div>

                   {/* Total Won */}
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                       <div className="flex justify-between items-start mb-2">
                           <div>
                               <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Revenue Won (YTD)</h3>
                               <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(wonThisYear)}</p>
                           </div>
                           <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                               <Trophy className="w-5 h-5" />
                           </div>
                       </div>
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                           {wonGrowth >= 0 ? (
                               <span className="text-emerald-600 flex items-center"><ArrowUpRight className="w-3 h-3 mr-0.5" /> {wonGrowth.toFixed(1)}%</span>
                           ) : (
                               <span className="text-red-600 flex items-center"><ArrowDownRight className="w-3 h-3 mr-0.5" /> {Math.abs(wonGrowth).toFixed(1)}%</span>
                           )}
                           <span className="text-slate-400">vs Last Year ({formatCurrency(wonLastYear)})</span>
                       </div>
                   </div>

                   {/* Total Lost */}
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                       <div className="flex justify-between items-start mb-2">
                           <div>
                               <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Volume Lost (YTD)</h3>
                               <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(lostThisYear)}</p>
                           </div>
                           <div className="p-2 bg-red-50 rounded-lg text-red-600">
                               <XCircle className="w-5 h-5" />
                           </div>
                       </div>
                       <div className="flex items-center gap-1.5 text-xs font-medium">
                           {lostChange <= 0 ? (
                               <span className="text-emerald-600 flex items-center"><ArrowDownRight className="w-3 h-3 mr-0.5" /> {Math.abs(lostChange).toFixed(1)}%</span>
                           ) : (
                               <span className="text-red-600 flex items-center"><ArrowUpRight className="w-3 h-3 mr-0.5" /> {lostChange.toFixed(1)}%</span>
                           )}
                           <span className="text-slate-400">vs Last Year ({formatCurrency(lostLastYear)})</span>
                       </div>
                   </div>
              </div>
              
              {/* Pipeline KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Projected Pipeline Value</h3>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{formatCurrency(opportunities.reduce((acc, curr) => acc + curr.value, 0))}</p>
                      <div className="mt-2 text-xs text-blue-600 font-medium">{opportunities.length} open opportunities</div>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Open Leads</h3>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{leads.filter(l => l.status === 'New' || l.status === 'Contacted').length}</p>
                      <div className="mt-2 text-xs text-green-600 font-medium">Ready for outreach</div>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wide">Priority Follow-Ups</h3>
                      <p className="text-3xl font-bold text-red-600 mt-2">{getStaleEstimates().length}</p>
                      <div className="mt-2 text-xs text-red-600 font-medium">Pending &gt; 30 Days</div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Col: Priority Follow Ups (The Stale List) */}
                  <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-5 border-b border-slate-100 bg-red-50/30 flex justify-between items-center">
                              <div>
                                  <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                      <AlertTriangle className="w-5 h-5 text-red-500" />
                                      Priority Follow-Ups
                                  </h3>
                                  <p className="text-sm text-slate-500">Estimates sent over 30 days ago with no update.</p>
                              </div>
                              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">Action Required</span>
                          </div>
                          <div className="divide-y divide-slate-100">
                              {getStaleEstimates().length > 0 ? getStaleEstimates().map(project => (
                                  <div key={project.id} className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center group hover:bg-slate-50 transition">
                                      <div>
                                          <div className="font-bold text-slate-900">{project.name}</div>
                                          <div className="text-sm text-slate-500">{project.client} • {formatCurrency(getProjectValue(project))}</div>
                                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                              <Clock className="w-3 h-3" />
                                              Sent: {new Date(project.dateCreated).toLocaleDateString()} ({Math.floor((new Date().getTime() - new Date(project.dateCreated).getTime()) / (1000 * 3600 * 24))} days ago)
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          {extractPhone(project.contactInfo) && (
                                              <button 
                                                  onClick={() => handleCall(extractPhone(project.contactInfo)!)}
                                                  className="p-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-white hover:text-green-600 hover:border-green-300 transition shadow-sm"
                                                  title="Call Client"
                                              >
                                                  <Phone className="w-4 h-4" />
                                              </button>
                                          )}
                                          {extractEmail(project.contactInfo) && (
                                              <button 
                                                  onClick={() => handleEmailFollowUp(project)}
                                                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-sm shadow-md shadow-blue-500/20"
                                              >
                                                  <Mail className="w-4 h-4" />
                                                  Auto Email
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              )) : (
                                  <div className="p-8 text-center text-slate-500">
                                      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                                      <p>Great job! No stale estimates found.</p>
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Bulk Follow Up by Client */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                  <Users className="w-5 h-5 text-blue-500" />
                                  Client Consolidation
                              </h3>
                              <p className="text-sm text-slate-500">Clients with multiple pending estimates. Follow up in bulk.</p>
                          </div>
                          <div className="divide-y divide-slate-100">
                              {getPendingByClient().slice(0, 5).map(([clientName, clientProjects]) => (
                                  clientProjects.length > 0 && (
                                      <div key={clientName} className="p-5 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                                          <div>
                                              <div className="font-bold text-slate-900">{clientName}</div>
                                              <div className="text-sm text-slate-500 mb-2">{clientProjects.length} Pending Projects</div>
                                              <div className="flex flex-wrap gap-2">
                                                  {clientProjects.map(p => (
                                                      <span key={p.id} className="text-[10px] bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-600 truncate max-w-[150px]">
                                                          {p.name}
                                                      </span>
                                                  ))}
                                              </div>
                                          </div>
                                          {extractEmail(clientProjects[0].contactInfo) && (
                                              <button 
                                                  onClick={() => handleBulkEmail(clientName, clientProjects)}
                                                  className="px-4 py-2 border border-blue-200 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-bold text-sm shrink-0"
                                              >
                                                  Email about All
                                              </button>
                                          )}
                                      </div>
                                  )
                              ))}
                              {getPendingByClient().length === 0 && (
                                  <div className="p-8 text-center text-slate-500">
                                      <p>No clients with pending estimates found.</p>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>

                  {/* Right Col: Recent Activity & Leads */}
                  <div className="space-y-6">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                          <div className="flex justify-between items-center mb-4">
                              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Recent Leads</h3>
                              <button onClick={() => setActiveTab('leads')} className="text-blue-600 text-xs font-bold hover:underline">View All</button>
                          </div>
                          <div className="space-y-4">
                              {leads.slice(0, 4).map(lead => (
                                  <div key={lead.id} className="flex items-start gap-3">
                                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                                          {lead.name.charAt(0)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <div className="text-sm font-semibold text-slate-900 truncate">{lead.name}</div>
                                          <div className="text-xs text-slate-500 truncate">{lead.company}</div>
                                          <div className="text-[10px] text-slate-400 mt-1 flex gap-2">
                                              <span>{lead.source}</span>
                                              <span>•</span>
                                              <span>{new Date(lead.dateAdded).toLocaleDateString()}</span>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                          <button 
                              onClick={() => setActiveTab('leads')}
                              className="w-full mt-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50"
                          >
                              Add New Lead
                          </button>
                      </div>

                      {/* Quick Actions Card */}
                      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-5 text-white shadow-lg">
                          <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
                          <div className="space-y-3">
                              <button onClick={() => setActiveTab('outlook')} className="w-full text-left px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition flex items-center gap-3">
                                  <RefreshCw className="w-4 h-4 text-blue-400" />
                                  <span className="text-sm font-medium">Sync Outlook</span>
                              </button>
                              <button onClick={() => setActiveTab('leads')} className="w-full text-left px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg transition flex items-center gap-3">
                                  <Plus className="w-4 h-4 text-green-400" />
                                  <span className="text-sm font-medium">Create Lead Manually</span>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- PIPELINE VIEW (KANBAN) --- */}
      {activeTab === 'pipeline' && (
          <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
              <div className="flex gap-4 min-w-[1200px] h-full">
                  {STAGES.map(stage => {
                      const stageOps = myOps.filter(o => o.stage === stage);
                      const stageValue = stageOps.reduce((acc, curr) => acc + curr.value, 0);
                      
                      return (
                          <div key={stage} className="w-80 flex flex-col bg-slate-100/50 rounded-xl border border-slate-200 h-full max-h-[70vh]">
                              <div className="p-3 border-b border-slate-200 bg-slate-50/80 rounded-t-xl backdrop-blur-sm sticky top-0">
                                  <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide flex justify-between">
                                      {stage}
                                      <span className="bg-slate-200 text-slate-600 px-1.5 rounded text-xs">{stageOps.length}</span>
                                  </h3>
                                  <p className="text-xs text-slate-400 font-semibold mt-1">{formatCurrency(stageValue)}</p>
                              </div>
                              <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                                  {stageOps.map(op => (
                                      <div key={op.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition group cursor-grab active:cursor-grabbing">
                                          <div className="flex justify-between items-start mb-2">
                                              <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{op.clientName}</span>
                                              <button className="text-slate-300 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                                          </div>
                                          <h4 className="font-bold text-slate-800 text-sm mb-1">{op.title}</h4>
                                          <div className="flex justify-between items-center text-xs text-slate-500 mb-3">
                                              <span>{formatCurrency(op.value)}</span>
                                              <span>{new Date(op.closeDate).toLocaleDateString()}</span>
                                          </div>
                                          
                                          {/* Stage Mover */}
                                          <div className="pt-3 border-t border-slate-100 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                              <span className="text-[10px] text-slate-400">{op.owner}</span>
                                              <div className="flex gap-1">
                                                  {STAGES.indexOf(stage) > 0 && (
                                                      <button onClick={() => handleStageChange(op.id, STAGES[STAGES.indexOf(stage) - 1])} className="p-1 hover:bg-slate-100 rounded" title="Move Back">
                                                          <ArrowRight className="w-3 h-3 rotate-180 text-slate-500" />
                                                      </button>
                                                  )}
                                                  {STAGES.indexOf(stage) < STAGES.length - 1 && (
                                                      <button onClick={() => handleStageChange(op.id, STAGES[STAGES.indexOf(stage) + 1])} className="p-1 hover:bg-slate-100 rounded" title="Move Forward">
                                                          <ArrowRight className="w-3 h-3 text-slate-500" />
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

      {/* --- LEADS VIEW --- */}
      {activeTab === 'leads' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                  <div className="relative max-w-sm w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="Search leads..." />
                  </div>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Lead
                  </button>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
                          <tr>
                              <th className="px-6 py-4">Name</th>
                              <th className="px-6 py-4">Company</th>
                              <th className="px-6 py-4">Contact</th>
                              <th className="px-6 py-4">Source</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {leads.map(lead => (
                              <tr key={lead.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-4 font-semibold text-slate-900">{lead.name}</td>
                                  <td className="px-6 py-4 text-slate-600">{lead.company}</td>
                                  <td className="px-6 py-4">
                                      <div className="flex flex-col gap-1">
                                          <span className="flex items-center gap-1 text-slate-600"><Mail className="w-3 h-3" /> {lead.email}</span>
                                          <span className="flex items-center gap-1 text-slate-500 text-xs"><Phone className="w-3 h-3" /> {lead.phone}</span>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium text-slate-600">{lead.source}</span></td>
                                  <td className="px-6 py-4">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                          lead.status === 'New' ? 'bg-blue-100 text-blue-700' :
                                          lead.status === 'Converted' ? 'bg-emerald-100 text-emerald-700' :
                                          'bg-slate-100 text-slate-600'
                                      }`}>
                                          {lead.status}
                                      </span>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                          <button className="text-blue-600 hover:underline font-medium text-xs">Convert</button>
                                          <div className="h-4 w-px bg-slate-200"></div>
                                          <button 
                                              onClick={() => handleForwardLead(lead)}
                                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                              title="Forward to Simon"
                                          >
                                              <Forward className="w-4 h-4" />
                                          </button>
                                          <button 
                                              onClick={() => handleDiscardLead(lead.id)}
                                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                              title="Discard Lead"
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* --- OUTLOOK SYNC --- */}
      {activeTab === 'outlook' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-start">
              {/* Left: Configuration & Sync */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <Mail className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-900">Outlook Integration</h3>
                            <p className="text-sm text-slate-500">Connect your Microsoft account.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowConfig(!showConfig)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
                        title="Configure Settings"
                      >
                          <Settings className="w-5 h-5" />
                      </button>
                  </div>
                  
                  {/* Configuration Panel */}
                  {showConfig || !clientId || configError ? (
                      <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-5 animate-in slide-in-from-top-2">
                          <h4 className="font-bold text-slate-800 text-sm mb-3">Setup Instructions</h4>
                          
                          {configError && (
                              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4 text-red-700 text-xs font-bold shadow-sm">
                                  <div className="flex items-center gap-2 mb-2">
                                      <AlertTriangle className="w-5 h-5" />
                                      {configError}
                                  </div>
                              </div>
                          )}

                          <div className="bg-white border-2 border-blue-100 p-4 rounded-lg mb-6 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-blue-800 uppercase">Current App URL (Add to Azure)</label>
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">ADD TO AZURE</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-slate-700 break-all text-xs bg-slate-50 p-2 rounded border border-slate-200">
                                <span className="flex-1">{window.location.origin}</span>
                                <button onClick={handleCopyUrl} className="text-blue-600 hover:text-blue-800 shrink-0 font-bold">
                                    {copied ? "COPIED" : "COPY"}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                                <strong>Vercel Users:</strong> You are currently on a specific deployment URL. 
                                <br/>• If this is for testing, add this URL to Azure Portal &gt; Authentication &gt; Redirect URIs.
                                <br/>• For production, use your main domain (e.g., carsan-app.vercel.app) to avoid changing this constantly.
                            </p>
                          </div>

                          <div className="space-y-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Azure Client ID</label>
                                  <input 
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="e.g. f13f2359-eec6-..."
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Azure Tenant ID</label>
                                  <input 
                                    value={tenantId}
                                    onChange={(e) => setTenantId(e.target.value)}
                                    placeholder="e.g. 555y1dg..."
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                  <p className="text-[10px] text-slate-400 mt-1">Found in Overview &gt; Directory (tenant) ID. Required for Single-Tenant apps.</p>
                              </div>
                          </div>
                          <div className="mt-4 flex justify-end">
                              <button 
                                onClick={handleSaveConfig}
                                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2"
                              >
                                  <Save className="w-4 h-4" /> Save Configuration
                              </button>
                          </div>
                      </div>
                  ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6 flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <div>
                              <p className="text-sm font-bold text-green-800">Ready to Sync</p>
                              <p className="text-xs text-green-700">Client ID Configured: {clientId.slice(0,6)}...</p>
                          </div>
                          <button onClick={() => setShowConfig(true)} className="ml-auto text-xs text-green-800 underline">Change</button>
                      </div>
                  )}

                  <button 
                    onClick={handleSyncOutlook}
                    disabled={isSyncing || !clientId}
                    className="w-full py-3 bg-[#0078D4] text-white font-bold rounded-lg hover:bg-[#006abc] transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      {isSyncing ? "Scanning Inbox..." : "Sync with Outlook"}
                  </button>
              </div>

              {/* Right: AI Extraction */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <Sparkles className="w-8 h-8 text-purple-600" />
                      </div>
                      <div>
                          <h3 className="font-bold text-lg text-slate-900">AI Email Parser</h3>
                          <p className="text-sm text-slate-500">Paste raw email text to extract a Lead automatically.</p>
                      </div>
                  </div>

                  {!aiResult ? (
                      <div className="flex-1 flex flex-col gap-4">
                          <textarea 
                             className="flex-1 w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                             placeholder="Paste email content here... e.g. 'Hi, my name is John from Acme Corp, looking for a quote. Call me at 555-0199.'"
                             value={emailText}
                             onChange={(e) => setEmailText(e.target.value)}
                          ></textarea>
                          <button 
                             onClick={handleAIParse}
                             disabled={!emailText || isProcessingAI}
                             className="py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                             {isProcessingAI ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                             Extract Lead Info
                          </button>
                      </div>
                  ) : (
                      <div className="flex-1 flex flex-col">
                          <h4 className="font-bold text-slate-800 mb-4 border-b pb-2">Extracted Information</h4>
                          <div className="space-y-3 flex-1">
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase font-bold">Name</label>
                                      <div className="font-medium">{aiResult.name}</div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase font-bold">Company</label>
                                      <div className="font-medium">{aiResult.company || '-'}</div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase font-bold">Email</label>
                                      <div className="font-medium">{aiResult.email || '-'}</div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-slate-500 uppercase font-bold">Phone</label>
                                      <div className="font-medium">{aiResult.phone || '-'}</div>
                                  </div>
                              </div>
                              <div className="mt-2">
                                  <label className="text-xs text-slate-500 uppercase font-bold">Notes</label>
                                  <div className="text-sm bg-slate-50 p-2 rounded border border-slate-100">{aiResult.notes}</div>
                              </div>
                          </div>
                          <div className="flex gap-3 mt-4">
                              <button onClick={() => setAiResult(null)} className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 font-bold hover:bg-slate-50">Cancel</button>
                              <button onClick={saveAILead} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Save Lead</button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};
