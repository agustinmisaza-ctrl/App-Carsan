import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Upload, Loader2, Database, AlertTriangle, RefreshCw, LogOut, FileSpreadsheet, DollarSign } from 'lucide-react';
import { searchSharePointSites, getSharePointLists, addListItem, SPSite, ensureCarsanLists, getAllProjects, getAllPurchaseRecords } from '../services/sharepointService';
import { normalizeSupplier, parseCurrency } from '../utils/purchaseData';
import { signOut } from '../services/emailIntegration';

interface SharePointConnectProps {
    projects: any[];
    setProjects?: (projects: any[]) => void;
    materials: any[];
    tickets: any[];
    purchases?: any[];
    setPurchases?: (purchases: any[]) => void;
}

interface RowError {
    row: number;
    message: string;
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, setProjects, materials, tickets, purchases, setPurchases }) => {
    const [step, setStep] = useState<number>(0);
    const [sites, setSites] = useState<SPSite[]>([]);
    const [selectedSite, setSelectedSite] = useState<SPSite | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string>("");
    const [rowErrors, setRowErrors] = useState<RowError[]>([]);

    const handleSearchSites = async () => {
        setIsLoading(true); setError(null);
        try { const results = await searchSharePointSites(""); setSites(results); } 
        catch (e: any) { setError(e.message || "Failed to fetch sites"); } 
        finally { setIsLoading(false); }
    };

    const handleSelectSite = (site: SPSite) => { setSelectedSite(site); setStep(1); };

    const handleInitialize = async (forceNewToken = false) => {
        if (!selectedSite) return;
        setIsLoading(true); setStatusMsg("Initializing Database Lists (Checking Schema)..."); setError(null);
        try {
            await ensureCarsanLists(selectedSite.id, forceNewToken);
            setStatusMsg("Database Ready! Lists verified and columns updated.");
        } catch (e: any) {
            console.error("Init Error", e);
            setStatusMsg("Error creating lists.");
            setError(e.message || "Access Denied.");
        } finally { setIsLoading(false); }
    };

    const handleLogout = async () => { await signOut(); window.location.reload(); };

    const handleSyncDown = async () => {
        if (!selectedSite || !setProjects) return;
        setIsLoading(true); setStatusMsg("Downloading projects...");
        try {
            const cloudProjects = await getAllProjects(selectedSite.id);
            if (cloudProjects.length > 0) {
                setProjects(cloudProjects);
                setStatusMsg(`Success! Downloaded ${cloudProjects.length} projects.`);
                alert(`Sync Complete! Loaded ${cloudProjects.length} projects.`);
            } else { setStatusMsg("No projects found in cloud."); }
        } catch (e: any) { console.error(e); setError("Failed: " + e.message); } 
        finally { setIsLoading(false); }
    };

    const handlePurchaseSyncDown = async () => {
        if (!selectedSite || !setPurchases) return;
        setIsLoading(true); setStatusMsg("Downloading purchase history...");
        try {
            const cloudPurchases = await getAllPurchaseRecords(selectedSite.id);
            if (cloudPurchases.length > 0) {
                setPurchases(cloudPurchases);
                setStatusMsg(`Success! Downloaded ${cloudPurchases.length} records.`);
                alert(`Sync Complete! Loaded ${cloudPurchases.length} purchase records.`);
            } else { setStatusMsg("No purchase records found in cloud."); }
        } catch (e: any) { console.error(e); setError("Failed: " + e.message); } 
        finally { setIsLoading(false); }
    };

    // --- CRITICAL FIX: DD/MM/YYYY Date Parsing ---
    const parseExcelDate = (val: any) => {
        if (!val) return null;
        
        // 1. Handle Excel Serial Numbers (e.g. 45321)
        if (typeof val === 'number') {
            return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
        }
        
        // 2. Handle Strings
        if (typeof val === 'string') {
            let cleanVal = val.trim();
            
            // Check for DD/MM/YYYY (e.g. 25/12/2024 or 1/2/2025)
            const dmyMatch = cleanVal.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
            if (dmyMatch) {
                // dmyMatch[1] = Day, [2] = Month, [3] = Year
                // Construct proper ISO string YYYY-MM-DD
                const d = new Date(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`);
                if (!isNaN(d.getTime())) return d.toISOString();
            }

            // Fallback: Try standard Date parsing (for ISO strings or MM/DD/YYYY)
            const d = new Date(cleanVal);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString();
        }
        return null; // Return null if invalid, so SharePoint ignores it rather than crashing
    };

    const handlePurchaseHistoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file || !selectedSite) return;
        setIsLoading(true); setRowErrors([]); setStatusMsg("Reading Excel...");
        try {
            const lists = await getSharePointLists(selectedSite.id);
            const purchaseList = lists.find(l => l.displayName === 'Carsan_Purchases');
            if (!purchaseList) throw new Error("List 'Carsan_Purchases' not found.");

            const reader = new FileReader();
            reader.onload = async (event) => {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                setStatusMsg(`Uploading ${jsonData.length} records...`);
                let successCount = 0; let failCount = 0;

                const findVal = (row: any, keys: string[]) => {
                    const rowKeys = Object.keys(row);
                    for (const key of keys) {
                        if (row[key] !== undefined) return row[key];
                        const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                    }
                    return undefined;
                };

                for (let i = 0; i < jsonData.length; i++) {
                    const row: any = jsonData[i];
                    try {
                        await addListItem(selectedSite.id, purchaseList.id, {
                            Title: `PO-${findVal(row, ['PO Number', 'PO']) || i}`,
                            PurchaseDate: parseExcelDate(findVal(row, ['Date', 'Invoice Date'])),
                            PO_Number: String(findVal(row, ['PO Number', 'PO']) || ''),
                            Brand: String(findVal(row, ['Brand']) || ''),
                            Item_Description: String(findVal(row, ['Item', 'Item Description']) || ''),
                            Quantity: Number(findVal(row, ['Quantity', 'Qty']) || 0),
                            Unit_Cost: parseCurrency(String(findVal(row, ['Unit Cost', 'Price']) || 0)),
                            Tax: parseCurrency(String(findVal(row, ['TAX', 'Tax']) || 0)),
                            Total_Cost: parseCurrency(String(findVal(row, ['Total', 'Total Cost']) || 0)),
                            Supplier: normalizeSupplier(String(findVal(row, ['Supplier']) || '')),
                            Project_Name: String(findVal(row, ['Project']) || ''),
                            Item_Type: String(findVal(row, ['TYPE']) || ''),
                            JSON_Data: JSON.stringify(row)
                        });
                        successCount++;
                    } catch (err: any) { failCount++; setRowErrors(prev => [...prev, { row: i + 2, message: err.message }]); }
                    if (i % 5 === 0) { setStatusMsg(`Uploading... ${i + 1} / ${jsonData.length}`); await new Promise(resolve => setTimeout(resolve, 50)); }
                }
                setStatusMsg(`Finished. Success: ${successCount}, Fail: ${failCount}`); setIsLoading(false); alert(`Uploaded ${successCount} records.`);
            };
            reader.readAsArrayBuffer(file);
        } catch (e: any) { setError(e.message); setIsLoading(false); }
    };

    const handleExcelToCloud = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file || !selectedSite) return;
        setIsLoading(true); setRowErrors([]); setStatusMsg("Reading Project Excel...");
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                const lists = await getSharePointLists(selectedSite.id);
                const projectList = lists.find((l: any) => l.displayName === 'Carsan_Projects');
                if (!projectList) throw new Error("List 'Carsan_Projects' not found.");

                let successCount = 0; let failCount = 0;
                setStatusMsg(`Uploading ${jsonData.length} projects...`);

                for (let i = 0; i < jsonData.length; i++) {
                    const row: any = jsonData[i];
                    const findVal = (keys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const key of keys) {
                            const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                            if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                        }
                        return undefined;
                    };

                    try {
                        // Use the strict date parser
                        const deliveryDate = parseExcelDate(findVal(['Delivery Date', 'Due Date']));
                        const expirationDate = parseExcelDate(findVal(['Expiration Date', 'Valid Until']));
                        const awardedDate = parseExcelDate(findVal(['Awarded Date', 'Start Date']));

                        await addListItem(selectedSite.id, projectList.id, {
                            Title: findVal(['Project Name', 'Title', 'Project']) || 'Untitled',
                            Client: findVal(['Client', 'Customer']) || 'Unknown',
                            Status: findVal(['Status']) || 'Draft',
                            Value: parseCurrency(String(findVal(['Value', 'Total']) || 0)),
                            ADDRESS: findVal(['ADDRESS', 'Address', 'Location']) || '',
                            Estimator: findVal(['Estimator', 'Owner']) || '',
                            'Delivery Date': deliveryDate, // Now handles DD/MM/YYYY or returns null
                            'Expiration Date': expirationDate,
                            'Awarded Date': awardedDate,
                            JSON_Data: JSON.stringify(row)
                        });
                        successCount++;
                    } catch (err: any) { 
                         failCount++; 
                         setRowErrors(prev => [...prev, { row: i + 2, message: err.message }]);
                    }
                    if (i % 5 === 0) { setStatusMsg(`Uploading project ${i + 1} of ${jsonData.length}...`); await new Promise(resolve => setTimeout(resolve, 100)); }
                }
                setStatusMsg(`Finished. Success: ${successCount}, Fail: ${failCount}`); setIsLoading(false); alert(`Uploaded ${successCount} projects.`);
            } catch (err: any) { setError(err.message); setIsLoading(false); if (e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Database className="w-8 h-8 text-blue-600" /> Cloud Database Manager</h1>
            {step === 0 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold mb-4">Select SharePoint Site</h2>
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800 border border-blue-100"><p className="font-bold mb-1">Vercel Redirect URI</p><code className="bg-white px-2 py-1 rounded border text-slate-700 select-all">{window.location.origin}</code></div>
                    <button onClick={handleSearchSites} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 mb-4 hover:bg-blue-700"><Search className="w-4 h-4" /> Scan for Sites</button>
                    {isLoading && <Loader2 className="w-6 h-6 animate-spin text-blue-500" />}
                    {error && <div className="text-red-500 bg-red-50 p-3 rounded mb-4">{error}</div>}
                    <div className="space-y-2">{sites.map(site => (<div key={site.id} onClick={() => handleSelectSite(site)} className="p-3 border border-slate-200 rounded hover:bg-blue-50 cursor-pointer flex justify-between items-center"><span className="font-medium">{site.displayName}</span><span className="text-xs text-slate-400">{site.webUrl}</span></div>))}</div>
                </div>
            )}
            {step === 1 && selectedSite && (
                <div className="space-y-6">
                    <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center"><div><p className="text-xs text-slate-400 uppercase">Connected To</p><p className="font-bold">{selectedSite.displayName}</p></div><button onClick={() => setStep(0)} className="text-xs text-blue-400 hover:text-white">Change Site</button></div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h3 className="font-bold text-slate-800 mb-4">1. Provision Lists (Auto-Repair)</h3><p className="text-sm text-slate-500 mb-4">Click this if columns are missing or sync fails.</p>{error && <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600"><strong>Error:</strong> {error} <div className="mt-2 flex gap-2"><button onClick={() => handleInitialize(true)} className="text-xs bg-white border border-red-200 px-2 py-1 rounded font-bold">Retry</button><button onClick={handleLogout} className="text-xs bg-red-600 text-white px-2 py-1 rounded font-bold">Log Out</button></div></div>}<button onClick={() => handleInitialize(true)} disabled={isLoading} className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-orange-700 disabled:opacity-50 shadow-sm">{isLoading ? "Processing..." : "Initialize / Repair Database"}</button>{statusMsg && <p className="mt-2 text-sm text-slate-600">{statusMsg}</p>}</div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h3 className="font-bold text-slate-800 mb-4">2. Purchase History (Price Analysis)</h3><p className="text-sm text-slate-500 mb-4">Manage 'Carsan_Purchases' list.</p><div className="grid md:grid-cols-2 gap-4"><div className="border border-slate-200 rounded-lg p-4"><div className="flex items-center gap-2 mb-2 font-bold text-blue-700"><Upload className="w-4 h-4"/> Push (Upload)</div><div className="relative"><input type="file" onChange={handlePurchaseHistoryUpload} accept=".xlsx,.xls,.csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isLoading} /><button className="w-full bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded-lg text-sm font-bold hover:bg-blue-100">Import Excel</button></div></div><div className="border border-slate-200 rounded-lg p-4"><div className="flex items-center gap-2 mb-2 font-bold text-indigo-700"><RefreshCw className="w-4 h-4"/> Pull (Download)</div><button onClick={handlePurchaseSyncDown} disabled={isLoading || !setPurchases} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">Sync Down from Cloud</button></div></div></div>
                    
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h3 className="font-bold text-slate-800 mb-4">3. Manage Projects</h3><p className="text-sm text-slate-500 mb-4">Sync project data with <strong>Carsan_Projects</strong>.</p><div className="grid md:grid-cols-2 gap-4"><div className="border border-slate-200 rounded-lg p-4"><div className="flex items-center gap-2 mb-2 font-bold text-emerald-700"><Upload className="w-4 h-4"/> Push (Upload)</div><div className="relative"><input type="file" onChange={handleExcelToCloud} accept=".xlsx,.xls,.csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isLoading} /><button className="w-full bg-emerald-50 text-emerald-700 border border-emerald-200 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100">Import Excel to Cloud</button></div></div><div className="border border-slate-200 rounded-lg p-4"><div className="flex items-center gap-2 mb-2 font-bold text-blue-700"><RefreshCw className="w-4 h-4"/> Pull (Download)</div><button onClick={handleSyncDown} disabled={isLoading || !setProjects} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">{isLoading && statusMsg.includes("Downloading") ? <Loader2 className="w-3 h-3 animate-spin"/> : null} Sync Down from Cloud</button></div></div></div>

                    {rowErrors.length > 0 && (
                        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl animate-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Upload Errors ({rowErrors.length})</h4>
                                <button onClick={() => setRowErrors([])} className="text-xs text-red-500 hover:underline font-bold">Clear Log</button>
                            </div>
                            <div className="max-h-60 overflow-y-auto text-xs font-mono text-red-700 bg-white p-3 rounded border border-red-100 shadow-inner custom-scrollbar">
                                {rowErrors.map((e, idx) => (<div key={idx} className="border-b border-red-50 last:border-0 py-1"><span className="font-bold text-slate-500 mr-2">Row {e.row}:</span> {e.message}</div>))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};