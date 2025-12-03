import React, { useState } from 'react';
import { Lead } from '../types';
import { fetchOutlookEmails, getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';
import { Mail, RefreshCw, Settings, User as UserIcon, Phone, Search, Save, Loader2 } from 'lucide-react';

interface CRMProps {
    leads: Lead[];
    setLeads: (leads: Lead[]) => void;
    opportunities: any[];
    setOpportunities: (opps: any[]) => void;
}

export const CRM: React.FC<CRMProps> = ({ leads, setLeads, opportunities, setOpportunities }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    
    // Settings State
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');
    const [clientId, setClientId] = useState(getStoredClientId() || '');

    const handleFetchLeads = async () => {
        setIsLoading(true);
        try {
            const data = await fetchOutlookEmails();
            setLeads(data);
        } catch (error) {
            console.error(error);
            alert("Failed to fetch leads. Check your Azure configuration.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSettings = () => {
        setStoredTenantId(tenantId);
        setStoredClientId(clientId);
        setShowSettings(false);
        alert("Settings saved!");
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CRM & Leads</h1>
                    <p className="text-slate-500 mt-1">Manage inbound leads from Outlook.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg border transition-colors ${showSettings ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleFetchLeads}
                        disabled={isLoading}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync Outlook
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in slide-in-from-top-2">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Azure Integration Settings
                    </h3>
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800">
                        <p className="font-bold mb-1">Vercel Deployment Detected</p>
                        <p>Your redirect URI changes with every deployment preview. <br/>
                        <strong>Current Redirect URI:</strong> <code className="bg-white px-1 py-0.5 rounded border">{window.location.origin}</code>
                        </p>
                        <p className="mt-2 text-xs">If you see error <strong>AADSTS50011</strong>, copy the URI above and add it to your Azure App Registration.</p>
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
                            <p className="text-[10px] text-slate-400 mt-1">Found in Overview &gt; Directory (tenant) ID. Required for Single-Tenant apps.</p>
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

            <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-slate-200">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs sticky top-0">
                        <tr>
                            <th className="px-6 py-4">Source</th>
                            <th className="px-6 py-4">Contact Name</th>
                            <th className="px-6 py-4">Email / Info</th>
                            <th className="px-6 py-4">Received</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {leads.map(lead => (
                            <tr key={lead.id} className="hover:bg-slate-50 group cursor-pointer">
                                <td className="px-6 py-4">
                                    <span className="flex items-center gap-2 text-slate-600 font-medium">
                                        <Mail className="w-4 h-4 text-blue-500" /> Outlook
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-bold text-slate-800">{lead.name}</td>
                                <td className="px-6 py-4 text-slate-600">
                                    <div>{lead.email}</div>
                                    <div className="text-xs text-slate-400 mt-1 truncate max-w-xs">{lead.notes}</div>
                                </td>
                                <td className="px-6 py-4 text-slate-500 text-xs">
                                    {new Date(lead.dateAdded).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">{lead.status}</span>
                                </td>
                            </tr>
                        ))}
                        {leads.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                                    No leads found. Click "Sync Outlook" to fetch recent emails.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};