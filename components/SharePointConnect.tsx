
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Search, Upload, Loader2, Database, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { searchSharePointSites, getSharePointLists, addListItem, SPSite, ensureCarsanLists } from '../services/sharepointService';
import { normalizeSupplier, parseCurrency } from '../utils/purchaseData';
import { signOut } from '../services/emailIntegration';

interface SharePointConnectProps {
    projects: any[];
    materials: any[];
    tickets: any[];
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, materials, tickets }) => {
    const [step, setStep] = useState<number>(0); // 0: Select Site, 1: Action
    const [sites, setSites] = useState<SPSite[]>([]);
    const [selectedSite, setSelectedSite] = useState<SPSite | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string>("");

    const handleSearchSites = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const results = await searchSharePointSites("");
            setSites(results);
        } catch (e: any) {
            setError(e.message || "Failed to fetch sites");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectSite = (site: SPSite) => {
        setSelectedSite(site);
        setStep(1);
    };

    const handleInitialize = async (forceNewToken = false) => {
        if (!selectedSite) return;
        setIsLoading(true);
        setStatusMsg("Initializing Database Lists...");
        setError(null);
        try {
            // Force new token to ensure permissions are fresh
            await ensureCarsanLists(selectedSite.id, forceNewToken);
            setStatusMsg("Database Ready! Lists 'Carsan_Projects', 'Carsan_Materials', and 'Carsan_Purchases' verified.");
        } catch (e: any) {
            console.error("Init Error", e);
            setStatusMsg("Error creating lists.");
            setError(e.message || "Access Denied. Check permissions.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut();
        window.location.reload();
    };

    // FIX: Smart Date Parsing for 1969 Issue and Excel Serial Dates
    const parseExcelDate = (val: any) => {
        if (!val) return null;
        // Excel Serial Number
        if (typeof val === 'number') {
            return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
        }
        
        if (typeof val === 'string') {
            let d = new Date(val);
            // Valid ISO/Standard date
            if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString();
            
            // Fallback: try to split by '/'
            const parts = val.split('/');
            if (parts.length === 3) {
                 // Try determining if it's DD/MM or MM/DD based on values > 12
                 if (parseInt(parts[0]) > 12) {
                     // Likely DD/MM/YYYY
                     d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                 } else {
                     // Likely MM/DD/YYYY
                     d = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
                 }
                 if (!isNaN(d.getTime())) return d.toISOString();
            }
        }
        return new Date().toISOString(); // Default to today if failure
    };

    const handlePurchaseHistoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedSite) return;

        setIsLoading(true);
        setStatusMsg("Reading Excel...");
        
        try {
            // Get Lists to find ID
            const lists = await getSharePointLists(selectedSite.id);
            const purchaseList = lists.find(l => l.displayName === 'Carsan_Purchases');
            
            if (!purchaseList) {
                throw new Error("Carsan_Purchases list not found. Please click 'Initialize Database' first.");
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                setStatusMsg(`Uploading ${jsonData.length} records...`);
                let successCount = 0;

                // Helper to find value case-insensitively
                const findVal = (row: any, keys: string[]) => {
                    const rowKeys = Object.keys(row);
                    for (const key of keys) {
                        // Check exact key
                        if (row[key] !== undefined) return row[key];
                        // Check case-insensitive key
                        const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                    }
                    return undefined;
                };

                const chunkSize = 5; // Process in small batches to allow UI updates
                for (let i = 0; i < jsonData.length; i++) {
                    const row: any = jsonData[i];
                    try {
                        // FIX: Use parseCurrency for all money fields to handle "$ 1,200.00"
                        const unitCost = parseCurrency(String(findVal(row, ['Unit Cost', 'Price', 'Rate']) || 0));
                        const tax = parseCurrency(String(findVal(row, ['TAX', 'Tax', 'Vat']) || 0));
                        const totalCost = parseCurrency(String(findVal(row, ['Total', 'Total Cost']) || 0));
                        const quantity = Number(findVal(row, ['Quantity', 'Qty']) || 0);

                        await addListItem(selectedSite.id, purchaseList.id, {
                            Title: `PO-${findVal(row, ['Purchase Order #', 'PO Number', 'PO']) || i}`,
                            PurchaseDate: parseExcelDate(findVal(row, ['Date', 'Invoice Date', 'PurchaseDate'])),
                            PO_Number: String(findVal(row, ['Purchase Order #', 'PO Number', 'PO']) || ''),
                            Brand: String(findVal(row, ['Brand']) || ''),
                            Item_Description: String(findVal(row, ['Item', 'Item Description']) || ''),
                            Quantity: quantity,
                            Unit_Cost: unitCost,
                            Tax: tax,
                            Total_Cost: totalCost || (quantity * unitCost),
                            Supplier: normalizeSupplier(String(findVal(row, ['Supplier', 'Vendor']) || '')),
                            Project_Name: String(findVal(row, ['Project', 'Project Name']) || ''),
                            Item_Type: String(findVal(row, ['TYPE', 'Type', 'Category']) || ''),
                            JSON_Data: JSON.stringify(row)
                        });
                        successCount++;
                    } catch (err) {
                        console.error("Row upload failed", err);
                    }
                    
                    // Update UI every 5 rows
                    if (i % 5 === 0) {
                        setStatusMsg(`Uploading... ${i + 1} / ${jsonData.length}`);
                        await new Promise(resolve => setTimeout(resolve, 50)); // Tiny break for UI
                    }
                }
                setStatusMsg(`Completed! Uploaded ${successCount} records.`);
                setIsLoading(false);
                alert(`Successfully uploaded ${successCount} records to SharePoint!`);
            };
            reader.readAsArrayBuffer(file);

        } catch (e: any) {
            setError(e.message);
            setIsLoading(false);
        }
    };
    
    // --- Project Upload Logic ---
    const handleExcelToCloud = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedSite) return;

        setIsLoading(true);
        setStatusMsg("Reading Project Excel...");

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const lists = await getSharePointLists(selectedSite.id);
                const projectList = lists.find((l: any) => l.displayName === 'Carsan_Projects');
                
                if (!projectList) throw new Error("List 'Carsan_Projects' not found. Initialize Database first.");

                let successCount = 0;
                let failCount = 0;
                const total = jsonData.length;

                setStatusMsg(`Uploading ${total} projects...`);

                for (let i = 0; i < total; i++) {
                    const row: any = jsonData[i];
                    
                    const findVal = (keys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const key of keys) {
                            const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                            if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                        }
                        return undefined;
                    };

                    const name = findVal(['Project Name', 'Title', 'Project']) || 'Untitled';
                    const client = findVal(['Client', 'Customer']) || 'Unknown';
                    const value = parseCurrency(String(findVal(['Value', 'Amount', 'Total']) || 0));
                    const statusVal = findVal(['Status']) || 'Draft';
                    const address = findVal(['ADDRESS', 'Address', 'Location']) || '';
                    const estimator = findVal(['Estimator', 'Owner']) || '';
                    const deliveryDate = parseExcelDate(findVal(['Delivery Date', 'Due Date']));
                    const expirationDate = parseExcelDate(findVal(['Expiration Date', 'Valid Until']));
                    const awardedDate = parseExcelDate(findVal(['Awarded Date', 'Start Date']));

                    try {
                        await addListItem(selectedSite.id, projectList.id, {
                            Title: name,
                            Client: client,
                            Status: statusVal,
                            Value: value,
                            ADDRESS: address,
                            Estimator: estimator,
                            'Delivery Date': deliveryDate,
                            'Expiration Date': expirationDate,
                            'Awarded Date': awardedDate,
                            JSON_Data: JSON.stringify(row)
                        });
                        successCount++;
                    } catch (err: any) {
                        console.error(`Failed row ${i+1}:`, err);
                        failCount++;
                    }

                    if (i % 5 === 0) {
                        setStatusMsg(`Uploading project ${i + 1} of ${total}...`);
                        await new Promise(resolve => setTimeout(resolve, 100)); 
                    }
                }

                setStatusMsg(`Finished. Success: ${successCount}, Fail: ${failCount}`);
                alert(`Project Import Complete!\nUploaded: ${successCount}\nFailed: ${failCount}`);

            } catch (err: any) {
                setError("Excel processing failed: " + err.message);
            } finally {
                setIsLoading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };


    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Database className="w-8 h-8 text-blue-600" /> Cloud Database Manager
            </h1>
            
            {step === 0 && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold mb-4">Select SharePoint Site</h2>
                    
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800 border border-blue-100">
                        <p className="font-bold mb-1">Vercel Redirect URI</p>
                        <p className="mb-1">Ensure this URL is added to your Azure App Registration:</p> 
                        <code className="bg-white px-2 py-1 rounded border text-slate-700 select-all">{window.location.origin}</code>
                    </div>

                    <button onClick={handleSearchSites} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 mb-4 hover:bg-blue-700">
                        <Search className="w-4 h-4" /> Scan for Sites
                    </button>
                    
                    {isLoading && <Loader2 className="w-6 h-6 animate-spin text-blue-500" />}
                    {error && <div className="text-red-500 bg-red-50 p-3 rounded mb-4">{error}</div>}
                    
                    <div className="space-y-2">
                        {sites.map(site => (
                            <div key={site.id} onClick={() => handleSelectSite(site)} className="p-3 border border-slate-200 rounded hover:bg-blue-50 cursor-pointer flex justify-between items-center">
                                <span className="font-medium">{site.displayName}</span>
                                <span className="text-xs text-slate-400">{site.webUrl}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {step === 1 && selectedSite && (
                <div className="space-y-6">
                    <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-400 uppercase">Connected To</p>
                            <p className="font-bold">{selectedSite.displayName}</p>
                        </div>
                        <button onClick={() => setStep(0)} className="text-xs text-blue-400 hover:text-white">Change Site</button>
                    </div>

                    {/* Database Initialization */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4">1. Provision Lists</h3>
                        <p className="text-sm text-slate-500 mb-4">Ensure the required SharePoint lists exist.</p>
                        
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                                <strong>Error:</strong> {error}
                                <div className="mt-2 flex gap-2">
                                     <button onClick={() => handleInitialize(true)} className="text-xs bg-white border border-red-200 px-2 py-1 rounded font-bold">Retry (Force Token)</button>
                                     <button onClick={handleLogout} className="text-xs bg-red-600 text-white px-2 py-1 rounded font-bold">Log Out</button>
                                </div>
                            </div>
                        )}
                        
                        <button onClick={() => handleInitialize(true)} disabled={isLoading} className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-orange-700 disabled:opacity-50 shadow-sm">
                            {isLoading ? "Processing..." : "Initialize Database"}
                        </button>
                        {statusMsg && <p className="mt-2 text-sm text-slate-600">{statusMsg}</p>}
                    </div>

                    {/* Purchase History Upload */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4">2. Upload Purchase History (Price Analysis)</h3>
                        <p className="text-sm text-slate-500 mb-4">Bulk upload Excel data to <strong>Carsan_Purchases</strong>.</p>
                        
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer relative">
                             <input type="file" onChange={handlePurchaseHistoryUpload} accept=".xlsx,.xls,.csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isLoading} />
                             {isLoading && statusMsg.includes("Uploading") ? (
                                 <div className="flex flex-col items-center">
                                     <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                                     <p className="text-blue-600 font-bold">{statusMsg}</p>
                                 </div>
                             ) : (
                                 <div className="flex flex-col items-center text-slate-400">
                                     <Upload className="w-8 h-8 mb-2" />
                                     <p className="font-medium text-slate-600">Click to Upload Purchase Excel</p>
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* Project Upload */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-4">3. Upload Projects</h3>
                        <p className="text-sm text-slate-500 mb-4">Bulk upload Excel data to <strong>Carsan_Projects</strong>.</p>
                        
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer relative">
                             <input type="file" onChange={handleExcelToCloud} accept=".xlsx,.xls,.csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isLoading} />
                             <div className="flex flex-col items-center text-slate-400">
                                 <Database className="w-8 h-8 mb-2" />
                                 <p className="font-medium text-slate-600">Click to Upload Project Excel</p>
                             </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
