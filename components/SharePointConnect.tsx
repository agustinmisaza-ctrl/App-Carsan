
import React, { useState, useEffect } from 'react';
import { Cloud, Check, Loader2, Database, AlertTriangle, RefreshCw, Globe, ChevronRight, Settings, Save, Copy, LogOut, ShieldAlert } from 'lucide-react';
import { searchSharePointSites, ensureCarsanLists, addListItem, getSharePointLists, getListItems, updateListItem, SPSite } from '../services/sharepointService';
import { ProjectEstimate, MaterialItem } from '../types';
import { getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId, signOut, getGraphToken } from '../services/emailIntegration';

interface SharePointConnectProps {
    projects: ProjectEstimate[];
    materials: MaterialItem[];
    setProjects: (p: ProjectEstimate[]) => void;
    setMaterials: (m: MaterialItem[]) => void;
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, materials, setProjects, setMaterials }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [sites, setSites] = useState<SPSite[]>([]);
    const [selectedSite, setSelectedSite] = useState<SPSite | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [dbInitialized, setDbInitialized] = useState(false);

    // Config State
    const [showConfig, setShowConfig] = useState(false);
    const [tenantId, setTenantId] = useState('');
    const [clientId, setClientId] = useState('');
    const [configError, setConfigError] = useState<string | null>(null);
    const [permissionError, setPermissionError] = useState(false);
    const [rawError, setRawError] = useState<string>('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setTenantId(getStoredTenantId() || '');
        setClientId(getStoredClientId() || '');
    }, []);

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(window.location.origin);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveConfig = () => {
        if (!tenantId.trim()) {
            setConfigError("Tenant ID is required.");
            return;
        }
        setStoredTenantId(tenantId.trim());
        if (clientId.trim()) setStoredClientId(clientId.trim());
        setConfigError(null);
        setShowConfig(false);
        alert("Configuration saved. Retrying connection...");
        handleSearchSites();
    };

    const handleResetSession = async () => {
        await signOut();
        window.location.reload();
    };

    const handleForceRepair = async () => {
        try {
            // Force an interactive login specifically for SharePoint scopes
            await getGraphToken(['Sites.ReadWrite.All'], true);
            setPermissionError(false);
            setRawError('');
            alert("Permissions refreshed! Please try 'Initialize Database' again.");
        } catch (e: any) {
            console.error(e);
            alert(`Repair failed: ${e.message}`);
        }
    };

    const handleSearchSites = async () => {
        setLoading(true);
        setConfigError(null);
        setPermissionError(false);
        try {
            const results = await searchSharePointSites("");
            setSites(results);
            setStep(2);
            setShowConfig(false);
        } catch (e: any) {
            console.error(e);
            const errStr = String(e).toLowerCase();
            
            if (errStr.includes("user_cancelled") || errStr.includes("interaction_in_progress")) {
                console.log("Connection cancelled by user.");
                return;
            }

            if (errStr.includes("aadsts50194") || errStr.includes("single-tenant") || errStr.includes("tenant-specific")) {
                setConfigError("Authentication Error: Single-Tenant App requires Tenant ID.");
                setShowConfig(true);
            } else if (errStr.includes("aadsts50011")) {
                setConfigError(`Redirect URI Mismatch.`);
                setShowConfig(true);
            } else {
                alert("Connection Failed. Check console for details.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSite = async (site: SPSite) => {
        setSelectedSite(site);
        // Check if DB exists
        setLoading(true);
        try {
            const lists = await getSharePointLists(site.id);
            const hasProjectList = lists.some(l => l.displayName === 'Carsan_Projects');
            setDbInitialized(hasProjectList);
            setStep(3);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleInitializeDB = async () => {
        if (!selectedSite) return;
        setLoading(true);
        setStatus('Creating SharePoint Lists...');
        setPermissionError(false);
        setRawError('');
        
        try {
            await ensureCarsanLists(selectedSite.id);
            setDbInitialized(true);
            setStatus('Database Created!');
        } catch (e: any) {
            setStatus('Error creating lists.');
            setRawError(e.message || JSON.stringify(e));
            
            if (e.message.includes('Sites.ReadWrite.All') || e.message.includes('Access Denied') || e.message.includes('403')) {
                setPermissionError(true);
            } else {
                alert(e.message || "Failed to create lists. Check console.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSyncUp = async () => {
        if (!selectedSite) return;
        if (!confirm("This will overwrite SharePoint data with your local data. Continue?")) return;
        
        setLoading(true);
        setStatus('Syncing Projects...');
        
        try {
            const lists = await getSharePointLists(selectedSite.id);
            const projList = lists.find(l => l.displayName === 'Carsan_Projects');
            
            if (projList) {
                for (const p of projects) {
                    await addListItem(selectedSite.id, projList.id, {
                        Title: p.name,
                        Client: p.client,
                        Status: p.status,
                        Value: p.contractValue || 0,
                        JSON_Data: JSON.stringify(p)
                    });
                }
            }
            setStatus('Sync Complete!');
        } catch (e) {
            setStatus('Sync Failed.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncDown = async () => {
        if (!selectedSite) return;
        setLoading(true);
        setStatus('Pulling from Cloud...');
        try {
            const lists = await getSharePointLists(selectedSite.id);
            const projList = lists.find(l => l.displayName === 'Carsan_Projects');
            
            if (projList) {
                const items = await getListItems(selectedSite.id, projList.id);
                const cloudProjects = items.map(i => {
                    try {
                        return JSON.parse(i.fields.JSON_Data);
                    } catch { return null; }
                }).filter(Boolean);
                
                if (cloudProjects.length > 0) {
                    setProjects(cloudProjects);
                    setStatus(`Downloaded ${cloudProjects.length} projects.`);
                } else {
                    setStatus('No projects found in cloud.');
                }
            }
        } catch (e) {
            setStatus('Download Failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Cloud className="w-8 h-8 text-blue-600" /> Cloud Database
            </h1>
            <p className="text-slate-500 mb-8">Connect your SharePoint Team Site to share data with your estimators.</p>

            <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
                
                {/* CONFIGURATION PANEL */}
                {showConfig && (
                    <div className="mb-8 bg-slate-50 border border-slate-200 rounded-xl p-5 animate-in slide-in-from-top-2">
                        <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Connection Settings
                        </h4>
                        
                        {configError && (
                            <div className="bg-red-50 border border-red-200 p-3 rounded-lg mb-4 text-red-700 text-xs font-bold shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="w-5 h-5" /> 
                                    {configError}
                                </div>
                            </div>
                        )}

                        <div className="bg-white border-2 border-blue-100 p-4 rounded-lg mb-6 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-blue-800 uppercase">Current App URL</label>
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
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Azure Tenant ID (Required)</label>
                                <input 
                                value={tenantId}
                                onChange={(e) => setTenantId(e.target.value)}
                                placeholder="e.g. 555y1dg-..."
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">Found in Azure Portal &gt; Overview. Required to fix AADSTS50194.</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Client ID</label>
                                <input 
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                placeholder="Default used if empty"
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setShowConfig(false)} className="px-4 py-2 text-slate-600 font-bold text-sm">Cancel</button>
                            <button 
                                onClick={handleSaveConfig}
                                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> Save & Retry
                            </button>
                        </div>
                    </div>
                )}

                {step === 1 && !showConfig && (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Globe className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Connect to Microsoft 365</h3>
                        <p className="text-slate-500 mb-6">We will search for your available SharePoint Sites.</p>
                        
                        <div className="flex justify-center gap-3">
                            <button 
                                onClick={() => setShowConfig(true)} 
                                className="px-4 py-3 border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 flex items-center gap-2"
                            >
                                <Settings className="w-4 h-4" /> Config
                            </button>
                            <button 
                                onClick={handleSearchSites} 
                                disabled={loading}
                                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                                Find Sites
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && !showConfig && (
                    <div>
                        <h3 className="font-bold text-slate-800 mb-4">Select Database Site</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {sites.map(site => (
                                <button 
                                    key={site.id} 
                                    onClick={() => handleSelectSite(site)}
                                    className="w-full text-left p-4 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition flex justify-between items-center group"
                                >
                                    <span className="font-medium text-slate-700">{site.displayName}</span>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && selectedSite && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase">Connected To</p>
                                <p className="text-lg font-bold text-slate-900">{selectedSite.displayName}</p>
                            </div>
                            <button onClick={() => setStep(2)} className="text-sm text-blue-600 hover:underline">Change</button>
                        </div>

                        {!dbInitialized ? (
                            <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl text-center">
                                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                                <h3 className="font-bold text-amber-900">Database Not Found</h3>
                                <p className="text-amber-700 text-sm mb-4">
                                    The required lists (Carsan_Projects, Carsan_Materials) do not exist on this site.
                                </p>
                                {permissionError && (
                                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-left mb-4">
                                        <p className="text-red-800 font-bold text-sm mb-2 flex items-center gap-2">
                                            <ShieldAlert className="w-4 h-4" /> Permission Issue
                                        </p>
                                        <p className="text-red-700 text-xs mb-3 leading-relaxed">
                                            The app cannot create lists. Possible reasons:<br/>
                                            1. You are a <strong>Visitor</strong> on this SharePoint site (Need 'Edit' access).<br/>
                                            2. The app's security token is outdated or missing scopes.
                                        </p>
                                        <p className="text-[10px] font-mono bg-red-100 p-2 rounded mb-3 break-all">{rawError}</p>
                                        
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleForceRepair}
                                                className="flex-1 bg-white border border-red-200 text-red-700 py-2 rounded-lg font-bold text-sm hover:bg-red-50 flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw className="w-4 h-4" /> Repair Connection
                                            </button>
                                            <button 
                                                onClick={handleResetSession}
                                                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-red-700 flex items-center justify-center gap-2"
                                            >
                                                <LogOut className="w-4 h-4" /> Full Log Out
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <button 
                                    onClick={handleInitializeDB}
                                    disabled={loading}
                                    className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-amber-700 disabled:opacity-50"
                                >
                                    {loading ? 'Creating...' : 'Initialize Database'}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition">
                                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                        <Database className="w-4 h-4 text-blue-500" /> Push to Cloud
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Upload your local projects ({projects.length}) to SharePoint for the team.
                                    </p>
                                    <button 
                                        onClick={handleSyncUp}
                                        disabled={loading}
                                        className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        Upload Local Data
                                    </button>
                                </div>

                                <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition">
                                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4 text-green-500" /> Pull from Cloud
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Download the latest team data. (Overwrites local changes).
                                    </p>
                                    <button 
                                        onClick={handleSyncDown}
                                        disabled={loading}
                                        className="w-full bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        Sync Down
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {status && (
                            <div className={`p-3 rounded-lg text-center text-sm font-bold animate-in fade-in ${status.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                                {status}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
