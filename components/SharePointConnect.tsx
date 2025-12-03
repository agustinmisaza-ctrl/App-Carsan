import React, { useState } from 'react';
import { ProjectEstimate, MaterialItem, ServiceTicket } from '../types';
import { searchSharePointSites, ensureCarsanLists, getSharePointLists, addListItem, updateListItem, getListItems } from '../services/sharepointService';
import { Cloud, Search, Database, Check, Loader2, AlertTriangle, RefreshCw, Upload, FileSpreadsheet, LogOut, Settings, DollarSign } from 'lucide-react';
import { getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId, signOut } from '../services/emailIntegration';
import * as XLSX from 'xlsx';

interface SharePointConnectProps {
    projects: ProjectEstimate[];
    materials: MaterialItem[];
    tickets: ServiceTicket[];
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, materials, tickets }) => {
    const [step, setStep] = useState<'config' | 'search' | 'sync'>('search');
    const [sites, setSites] = useState<any[]>([]);
    const [selectedSite, setSelectedSite] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [rawError, setRawError] = useState<any>(null);

    // Config State
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');
    const [clientId, setClientId] = useState(getStoredClientId() || '');

    const handleSearchSites = async () => {
        setIsLoading(true);
        setError(null);
        setRawError(null);
        try {
            const results = await searchSharePointSites("");
            setSites(results);
            if (results.length === 0) setStatus("No sites found. Check permissions.");
        } catch (e: any) {
            console.error(e);
            if (String(e).includes("AADSTS50194") || String(e).includes("Tenant ID")) {
                setStep('config');
                setError("Configuration Required: Please enter your Azure Tenant ID.");
            } else if (String(e).includes("AADSTS50011")) {
                setStep('config');
                setError("Redirect URI Mismatch. Please check the URL in Azure.");
            } else {
                setError("Failed to search sites. " + e.message);
                setRawError(e);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitialize = async (forceNewToken = false) => {
        if (!selectedSite) return;
        setIsLoading(true);
        setStatus("Initializing Database Lists...");
        setError(null);
        setRawError(null);
        try {
            await ensureCarsanLists(selectedSite.id, forceNewToken);
            setStatus("Database Ready! Lists 'Carsan_Projects', 'Carsan_Materials', and 'Carsan_Purchases' verified.");
            setStep('sync');
        } catch (e: any) {
            console.error("Init Error", e);
            setStatus("Error creating lists.");
            setError(e.message || "Access Denied. Check permissions.");
            setRawError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveConfig = () => {
        setStoredTenantId(tenantId.trim());
        setStoredClientId(clientId.trim());
        setStep('search');
        handleSearchSites();
    };

    const handleSyncUp = async () => {
        if (!selectedSite) return;
        setIsLoading(true);
        setStatus("Finding target lists...");
        
        try {
            const lists = await getSharePointLists(selectedSite.id);
            const projectList = lists.find((l: any) => l.displayName === 'Carsan_Projects');
            
            if (!projectList) throw new Error("Project List not found. Initialize Database first.");

            setStatus(`Syncing ${projects.length} projects...`);
            
            // Batch processing to avoid UI freeze
            const chunkSize = 5;
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < projects.length; i += chunkSize) {
                const chunk = projects.slice(i, i + chunkSize);
                
                await Promise.all(chunk.map(async (p) => {
                    try {
                        await addListItem(selectedSite.id, projectList.id, {
                            Title: p.name,
                            Client: p.client,
                            Status: p.status,
                            Value: p.contractValue || 0,
                            ADDRESS: p.address || '',
                            Estimator: p.estimator || '',
                            'Delivery Date': p.deliveryDate || null,
                            'Expiration Date': p.expirationDate || null,
                            'Awarded Date': p.awardedDate || null,
                            JSON_Data: JSON.stringify(p)
                        });
                        successCount++;
                    } catch (err) {
                        console.error("Failed to upload project", p.name, err);
                        failCount++;
                    }
                }));
                
                setStatus(`Syncing... ${Math.min(i + chunkSize, projects.length)}/${projects.length} (Failed: ${failCount})`);
                // Small delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            setStatus(`Sync Complete! Uploaded: ${successCount}, Failed: ${failCount}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExcelToCloud = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedSite) return;

        setIsLoading(true);
        setStatus("Reading Excel file...");

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const lists = await getSharePointLists(selectedSite.id);
                const projectList = lists.find((l: any) => l.displayName === 'Carsan_Projects');
                
                if (!projectList) throw new Error("List 'Carsan_Projects' not found.");

                let successCount = 0;
                let failCount = 0;
                const total = jsonData.length;

                setStatus(`Uploading ${total} rows...`);

                // Process sequentially to be safe with rate limits
                for (let i = 0; i < total; i++) {
                    const row: any = jsonData[i];
                    
                    // Column Mapping logic
                    const findVal = (keys: string[]) => {
                        for (const key of keys) if (row[key] !== undefined) return row[key];
                        return undefined;
                    };

                    const name = findVal(['Project Name', 'Title', 'Project']) || 'Untitled';
                    const client = findVal(['Client', 'Customer']) || 'Unknown';
                    const value = findVal(['Value', 'Amount', 'Total']) || 0;
                    const statusVal = findVal(['Status']) || 'Draft';
                    const address = findVal(['Address', 'Location', 'Site']) || '';
                    const estimator = findVal(['Estimator', 'Owner']) || '';
                    
                    // Date Parsing
                    const parseExcelDate = (val: any) => {
                        if (!val) return null;
                        if (typeof val === 'number') return new Date(Math.round((val - 25569)*86400*1000)).toISOString();
                        const d = new Date(val);
                        return !isNaN(d.getTime()) ? d.toISOString() : null;
                    };

                    const deliveryDate = parseExcelDate(findVal(['Delivery Date', 'Due Date']));
                    const expirationDate = parseExcelDate(findVal(['Expiration Date', 'Valid Until']));
                    const awardedDate = parseExcelDate(findVal(['Awarded Date', 'Start Date']));

                    try {
                        console.log(`Uploading Row ${i}:`, { name, client, address, estimator }); // Debug Log
                        
                        await addListItem(selectedSite.id, projectList.id, {
                            Title: name,
                            Client: client,
                            Status: statusVal,
                            Value: Number(value),
                            ADDRESS: address,
                            Estimator: estimator,
                            'Delivery Date': deliveryDate,
                            'Expiration Date': expirationDate,
                            'Awarded Date': awardedDate,
                            JSON_Data: JSON.stringify(row) // Backup full row data
                        });
                        successCount++;
                    } catch (err: any) {
                        console.error(`Failed row ${i+1}:`, err);
                        failCount++;
                        setError(`Row ${i+1} Error: ${err.message}`); // Show last error
                    }

                    if (i % 5 === 0) {
                        setStatus(`Uploading row ${i + 1} of ${total}...`);
                        await new Promise(resolve => setTimeout(resolve, 300)); // Throttle
                    }
                }

                alert(`Import Complete!\nUploaded: ${successCount}\nFailed: ${failCount}`);
                setStatus(`Finished. Success: ${successCount}, Fail: ${failCount}`);

            } catch (err: any) {
                setError("Excel processing failed: " + err.message);
            } finally {
                setIsLoading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handlePurchaseHistoryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedSite) return;

        setIsLoading(true);
        setStatus("Reading Purchase History...");

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const lists = await getSharePointLists(selectedSite.id);
                const purchaseList = lists.find((l: any) => l.displayName === 'Carsan_Purchases');
                
                if (!purchaseList) throw new Error("List 'Carsan_Purchases' not found. Please click 'Initialize Database' first.");

                let successCount = 0;
                let failCount = 0;
                const total = jsonData.length;

                setStatus(`Uploading ${total} purchase records...`);

                for (let i = 0; i < total; i++) {
                    const row: any = jsonData[i];
                    
                    const findVal = (keys: string[]) => {
                        for (const key of keys) if (row[key] !== undefined) return row[key];
                        return undefined;
                    };

                    const parseExcelDate = (val: any) => {
                        if (!val) return null;
                        if (typeof val === 'number') return new Date(Math.round((val - 25569)*86400*1000)).toISOString();
                        const d = new Date(val);
                        return !isNaN(d.getTime()) ? d.toISOString() : null;
                    };

                    try {
                        await addListItem(selectedSite.id, purchaseList.id, {
                            Title: `PO-${findVal(['Purchase Order #', 'PO Number', 'PO']) || i}`,
                            PurchaseDate: parseExcelDate(findVal(['Date', 'Invoice Date'])),
                            PO_Number: String(findVal(['Purchase Order #', 'PO Number', 'PO']) || ''),
                            Brand: String(findVal(['Brand']) || ''),
                            Item_Description: String(findVal(['Item', 'Item Description']) || ''),
                            Quantity: Number(findVal(['Quantity', 'Qty']) || 0),
                            Unit_Cost: Number(findVal(['Unit Cost', 'Price', 'Rate']) || 0),
                            Total_Cost: Number(findVal(['Total', 'Total Cost']) || 0),
                            Supplier: String(findVal(['Supplier', 'Vendor']) || ''),
                            Project_Name: String(findVal(['Project', 'Project Name']) || ''),
                            Item_Type: String(findVal(['TYPE', 'Type', 'Category']) || ''),
                            JSON_Data: JSON.stringify(row)
                        });
                        successCount++;
                    } catch (err: any) {
                        console.error(`Failed row ${i+1}:`, err);
                        failCount++;
                        setError(`Row ${i+1} Error: ${err.message}`);
                    }

                    if (i % 5 === 0) {
                        setStatus(`Uploading record ${i + 1} of ${total}...`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }

                alert(`Purchase History Import Complete!\nUploaded: ${successCount}\nFailed: ${failCount}`);
                setStatus(`Finished. Success: ${successCount}, Fail: ${failCount}`);

            } catch (err: any) {
                setError("Excel processing failed: " + err.message);
            } finally {
                setIsLoading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleLogout = async () => {
        await signOut();
        window.location.reload();
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            
            {/* --- CONFIGURATION STEP --- */}
            {step === 'config' && (
                <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <Settings className="w-6 h-6 text-slate-700" /> Configuration
                    </h2>
                    
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800">
                        <p className="font-bold mb-1">Vercel Deployment Detected</p>
                        <p>Your redirect URI changes with every deployment preview. <br/>
                        <strong>Current Redirect URI:</strong> <code className="bg-white px-1 py-0.5 rounded border">{window.location.origin}</code>
                        </p>
                        <p className="mt-2 text-xs">If you see error <strong>AADSTS50011</strong>, copy the URI above and add it to your Azure App Registration.</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Azure Tenant ID</label>
                            <input 
                                value={tenantId}
                                onChange={(e) => setTenantId(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm"
                                placeholder="Paste your Tenant ID here"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Found in Overview &gt; Directory (tenant) ID. Required for Single-Tenant apps.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Client ID</label>
                            <input 
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm"
                                placeholder="Paste your Client ID here"
                            />
                        </div>
                        <button 
                            onClick={handleSaveConfig}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition"
                        >
                            Save & Continue
                        </button>
                    </div>
                </div>
            )}

            {/* --- SITE SEARCH STEP --- */}
            {step === 'search' && (
                <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 text-center">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Cloud className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Connect SharePoint</h2>
                    <p className="text-slate-500 mt-2 mb-8">Select your team site to enable cloud features.</p>
                    
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                            <span className="text-sm text-slate-500">Searching sites...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sites.length > 0 ? (
                                <div className="grid gap-3 text-left">
                                    {sites.map(site => (
                                        <button 
                                            key={site.id}
                                            onClick={() => setSelectedSite(site)}
                                            className={`p-4 rounded-xl border transition-all flex items-center justify-between ${selectedSite?.id === site.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                        >
                                            <span className="font-bold text-slate-800">{site.displayName}</span>
                                            {selectedSite?.id === site.id && <Check className="w-5 h-5 text-blue-600" />}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <button 
                                    onClick={handleSearchSites}
                                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg"
                                >
                                    Search Sites
                                </button>
                            )}
                            
                            {selectedSite && (
                                <div className="pt-6 animate-in fade-in">
                                    <button 
                                        onClick={() => handleInitialize(true)}
                                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg w-full md:w-auto"
                                    >
                                        Connect to: {selectedSite.displayName}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 bg-red-50 text-red-600 p-4 rounded-xl text-sm text-left border border-red-100">
                            <div className="font-bold flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4" /> Error
                            </div>
                            <p className="mb-4">{error}</p>
                            
                            {error.includes("Access Denied") || error.includes("403") ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-red-800">
                                        <strong>Permission Issue:</strong>
                                        <br />1. You are a <strong>Visitor</strong> on this SharePoint site (Need 'Edit' access).
                                        <br />2. The app's security token is outdated or missing scopes.
                                        <br />
                                        <br />
                                        <code className="bg-red-100 p-1 rounded">Access Denied (403). Missing 'Sites.ReadWrite.All' or user lacks Edit permissions on this specific site.</code>
                                    </p>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleInitialize(true)} 
                                            className="w-full bg-white border border-red-200 text-red-600 py-2 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Repair Connection
                                        </button>
                                        <button 
                                            onClick={handleLogout} 
                                            className="w-full bg-red-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-red-700 flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-3 h-3" /> Full Log Out
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {/* --- SYNC DASHBOARD --- */}
            {step === 'sync' && selectedSite && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase">Connected To</p>
                            <h2 className="text-xl font-bold text-slate-900">{selectedSite.displayName}</h2>
                        </div>
                        <button onClick={() => setStep('search')} className="text-sm text-blue-600 font-medium hover:underline">Change Site</button>
                    </div>

                    <div className="p-8 grid md:grid-cols-2 gap-8">
                        {/* Status Card */}
                        <div className="col-span-2 bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-4">
                            <div className="p-3 bg-white rounded-full shadow-sm">
                                {isLoading ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <Database className="w-6 h-6 text-blue-600" />}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-blue-900">Database Status</p>
                                <p className="text-xs text-blue-700">{status || "Ready to sync."}</p>
                            </div>
                        </div>

                        {/* Push Card */}
                        <div className="border border-slate-200 rounded-xl p-6 hover:shadow-md transition">
                            <div className="flex items-center gap-3 mb-4">
                                <Upload className="w-6 h-6 text-indigo-600" />
                                <h3 className="font-bold text-slate-900">Push to Cloud</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-6 min-h-[40px]">
                                Upload your local projects (0) to SharePoint for the team.
                            </p>
                            <div className="space-y-3">
                                <button 
                                    onClick={handleSyncUp}
                                    disabled={isLoading}
                                    className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-slate-800 disabled:opacity-50"
                                >
                                    Upload Local Data
                                </button>
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept=".xlsx, .xls"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={handleExcelToCloud}
                                        disabled={isLoading}
                                    />
                                    <button className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                        <FileSpreadsheet className="w-4 h-4" /> Import Excel to Cloud
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Pull Card (Placeholder for now) */}
                        <div className="border border-slate-200 rounded-xl p-6 bg-slate-50 opacity-75">
                            <div className="flex items-center gap-3 mb-4">
                                <RefreshCw className="w-6 h-6 text-slate-400" />
                                <h3 className="font-bold text-slate-600">Pull from Cloud</h3>
                            </div>
                            <p className="text-sm text-slate-400 mb-6 min-h-[40px]">
                                Download the latest team data. (Overwrites local changes).
                            </p>
                            <button disabled className="w-full bg-slate-200 text-slate-400 py-2.5 rounded-lg font-bold text-sm cursor-not-allowed">
                                Sync Down
                            </button>
                        </div>

                        {/* Purchase History Upload */}
                        <div className="col-span-2 border border-blue-200 bg-blue-50/50 rounded-xl p-6 hover:shadow-md transition">
                            <div className="flex items-center gap-3 mb-4">
                                <DollarSign className="w-6 h-6 text-blue-600" />
                                <h3 className="font-bold text-slate-900">Purchase History (Price Analysis)</h3>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">
                                Upload your Price Analysis Excel file to the 'Carsan_Purchases' SharePoint list.
                            </p>
                            <div className="relative">
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={handlePurchaseHistoryUpload}
                                    disabled={isLoading}
                                    title="Upload Excel File with columns: Date, PO #, Brand, Item, etc."
                                />
                                <button className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                    <Upload className="w-4 h-4" /> Import Purchase History
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="m-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100 break-words">
                            <div className="flex items-center gap-2 font-bold mb-2">
                                <AlertTriangle className="w-4 h-4" /> Error
                            </div>
                            <p className="mb-4">{error}</p>
                            
                            {error.includes("Access Denied") || error.includes("403") ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-red-800">
                                        <strong>Permission Issue:</strong>
                                        <br />1. You are a <strong>Visitor</strong> on this SharePoint site (Need 'Edit' access).
                                        <br />2. The app's security token is outdated or missing scopes.
                                        <br />
                                        <br />
                                        <code className="bg-red-100 p-1 rounded">Access Denied (403). Missing 'Sites.ReadWrite.All' or user lacks Edit permissions on this specific site.</code>
                                    </p>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleInitialize(true)} 
                                            className="w-full bg-white border border-red-200 text-red-600 py-2 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Repair Connection
                                        </button>
                                        <button 
                                            onClick={handleLogout} 
                                            className="w-full bg-red-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-red-700 flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-3 h-3" /> Full Log Out
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};