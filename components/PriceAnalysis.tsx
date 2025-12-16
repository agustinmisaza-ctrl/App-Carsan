import React, { useState, useMemo, useRef } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, ReferenceLine, Scatter, AreaChart, Area } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, PieChart, Sparkles, ListFilter, Flame, AlertTriangle, Trash2, Plus, Save, Briefcase, Wallet, RefreshCw } from 'lucide-react';
import { extractInvoiceData } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency, normalizeSupplier } from '../utils/purchaseData';

interface PriceAnalysisProps {
  purchases: PurchaseRecord[];
  setPurchases?: (records: PurchaseRecord[]) => void;
  materials?: MaterialItem[]; 
  setMaterials?: (items: MaterialItem[]) => void;
  projects?: ProjectEstimate[]; 
  tickets?: ServiceTicket[];
}

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases, setPurchases, materials, setMaterials, projects = [], tickets = [] }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'job-costing' | 'purchasing' | 'entry'>('overview');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [sortByValue, setSortByValue] = useState(true);
  
  // Data Entry State
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [scannedRecords, setScannedRecords] = useState<PurchaseRecord[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [manualEntry, setManualEntry] = useState<Partial<PurchaseRecord>>({
      date: new Date().toISOString().split('T')[0],
      supplier: '',
      itemDescription: '',
      quantity: 1,
      unitCost: 0,
      projectName: '',
      poNumber: ''
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showMobileSelector, setShowMobileSelector] = useState(false); 

  // --- FINANCIAL CALCULATIONS ---

  const financialData = useMemo(() => {
      // 1. Revenue
      const projectRevenue = projects
          .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
          .reduce((sum, p) => sum + (p.contractValue || 0), 0);

      const serviceRevenue = tickets
          .filter(t => ['Authorized', 'Completed'].includes(t.status))
          .reduce((sum, t) => {
              const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
              const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
              return sum + mat + lab;
          }, 0);

      const totalRevenue = projectRevenue + serviceRevenue;

      // 2. Expenses (Actuals)
      const materialExpense = purchases.reduce((sum, p) => sum + p.totalCost, 0);
      
      const laborCostBasis = 0.4; 
      
      const projectLaborRev = projects
        .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
        .reduce((sum, p) => sum + p.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * p.laborRate), 0), 0);
      
      const ticketLaborRev = tickets
        .filter(t => ['Authorized', 'Completed'].includes(t.status))
        .reduce((sum, t) => sum + t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0), 0);

      const totalLaborExpense = (projectLaborRev + ticketLaborRev) * laborCostBasis;
      const totalExpenses = materialExpense + totalLaborExpense;

      // 3. Net
      const netProfit = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return { totalRevenue, totalExpenses, netProfit, margin, projectRevenue, serviceRevenue, materialExpense, totalLaborExpense };
  }, [projects, tickets, purchases]);

  // --- JOB COSTING LOGIC ---
  const jobCostingData = useMemo(() => {
      // Get all active projects
      const activeProjects = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status));
      
      return activeProjects.map(proj => {
          // Actual Material Spend
          const actualMaterial = purchases
            .filter(p => p.projectName === proj.name)
            .reduce((sum, p) => sum + p.totalCost, 0);

          // Estimated Labor Cost (from estimate)
          const estLabor = proj.items.reduce((sum, i) => sum + (i.quantity * i.unitLaborHours * proj.laborRate), 0);
          
          // Cost Basis for Labor (Payroll) - simplifying as 40% of billed labor for internal cost
          const internalLaborCost = estLabor * 0.4;

          const totalCost = actualMaterial + internalLaborCost;
          const grossProfit = (proj.contractValue || 0) - totalCost;
          const margin = (proj.contractValue || 0) > 0 ? (grossProfit / (proj.contractValue || 0)) * 100 : 0;

          return {
              id: proj.id,
              name: proj.name,
              status: proj.status,
              contract: proj.contractValue || 0,
              actualMaterial,
              internalLaborCost,
              totalCost,
              grossProfit,
              margin
          };
      }).sort((a, b) => a.margin - b.margin); // Sort by lowest margin first (problem areas)
  }, [projects, purchases]);

  // --- PURCHASING ANALYSIS LOGIC ---
  const processedItemsList = useMemo(() => {
      const itemMap = new Map<string, { total: number, count: number }>();
      purchases.forEach(p => {
          const name = p.itemDescription || 'Unknown';
          if (!itemMap.has(name)) itemMap.set(name, { total: 0, count: 0 });
          const curr = itemMap.get(name)!;
          curr.total += p.totalCost || 0;
          curr.count += 1;
      });

      let items = Array.from(itemMap.entries()).map(([name, data]) => ({
          name,
          total: data.total,
          count: data.count
      }));

      if (searchTerm) {
          items = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      if (sortByValue) {
          items.sort((a, b) => b.total - a.total);
      } else {
          items.sort((a, b) => a.name.localeCompare(b.name));
      }

      return items;
  }, [purchases, searchTerm, sortByValue]);

  const paretoCutoffIndex = Math.floor(processedItemsList.length * 0.2);

  const showNotification = (type: 'success' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 5000);
  };

  const filteredPurchases = useMemo(() => {
      return purchases.filter(p => {
          const matchesSearch = p.itemDescription.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                p.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesProject = selectedProject === 'All' || p.projectName === selectedProject;
          return matchesSearch && matchesProject;
      });
  }, [purchases, searchTerm, selectedProject]);

  const supplierScorecard = useMemo(() => {
      if (purchases.length === 0) return [];
      const itemStats: Record<string, { totalCost: number, count: number, avg: number }> = {};
      
      purchases.forEach(p => {
          const key = p.itemDescription.trim().toLowerCase();
          if (!itemStats[key]) itemStats[key] = { totalCost: 0, count: 0, avg: 0 };
          itemStats[key].totalCost += p.unitCost;
          itemStats[key].count += 1;
      });

      Object.keys(itemStats).forEach(k => {
          itemStats[k].avg = itemStats[k].totalCost / itemStats[k].count;
      });

      const supplierStats: Record<string, { totalVariancePct: number, itemsCount: number }> = {};

      purchases.forEach(p => {
          const key = p.itemDescription.trim().toLowerCase();
          const marketAvg = itemStats[key].avg;
          const normalizedSupplier = normalizeSupplier(p.supplier);
          
          if (marketAvg > 0 && p.unitCost > 0) {
              const variance = ((p.unitCost - marketAvg) / marketAvg) * 100;
              if (!supplierStats[normalizedSupplier]) supplierStats[normalizedSupplier] = { totalVariancePct: 0, itemsCount: 0 };
              supplierStats[normalizedSupplier].totalVariancePct += variance;
              supplierStats[normalizedSupplier].itemsCount += 1;
          }
      });

      return Object.keys(supplierStats).map(supplier => {
          const stats = supplierStats[supplier];
          const score = stats.totalVariancePct / stats.itemsCount;
          return {
              name: supplier,
              score: score,
              itemsCount: stats.itemsCount
          };
      })
      .filter(s => s.itemsCount > 2)
      .sort((a, b) => a.score - b.score);
  }, [purchases]);

  const itemSupplierStats = useMemo(() => {
        if (!selectedItem) return [];
        const relevant = purchases.filter(p => p.itemDescription === selectedItem);
        const groups: Record<string, { total: number, count: number, min: number, max: number }> = {};
        
        relevant.forEach(r => {
            const sup = normalizeSupplier(r.supplier);
            if (!groups[sup]) groups[sup] = { total: 0, count: 0, min: r.unitCost, max: r.unitCost };
            groups[sup].total += r.unitCost;
            groups[sup].count += 1;
            groups[sup].min = Math.min(groups[sup].min, r.unitCost);
            groups[sup].max = Math.max(groups[sup].max, r.unitCost);
        });

        return Object.entries(groups).map(([name, stats]) => ({
            name,
            avgPrice: stats.total / stats.count,
            minPrice: stats.min,
            maxPrice: stats.max,
            count: stats.count
        })).sort((a,b) => a.avgPrice - b.avgPrice); // Cheapest first
  }, [purchases, selectedItem]);

  // --- HANDLERS ---

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsExtracting(true);
      setUploadFileName(file.name);
      e.target.value = '';

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const base64 = event.target?.result as string;
              const records = await extractInvoiceData(base64);
              if (records.length > 0) {
                  setScannedRecords(records);
                  showNotification('success', `AI identified ${records.length} items. Please review below.`);
              } else {
                  showNotification('error', "No items could be extracted.");
              }
          } catch (err) {
              showNotification('error', "Failed to analyze invoice.");
          } finally {
              setIsExtracting(false);
              setUploadFileName(null);
          }
      };
      reader.readAsDataURL(file);
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = ''; // Reset input

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = event.target?.result;
              const workbook = XLSX.read(data, { type: 'array' });
              const worksheet = workbook.Sheets[workbook.SheetNames[0]];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);

              if (Array.isArray(jsonData) && setPurchases) {
                  const newRecords: PurchaseRecord[] = jsonData.map((row: any, idx) => {
                        const qty = Number(row['Quantity'] || row['Qty'] || 0);
                        const unit = parseCurrency(String(row['Unit Cost'] || row['Cost'] || row['Price'] || 0));
                        
                        // FIX: Correct Date Parsing for Excel Serial Dates
                        let finalDate = new Date().toISOString();
                        const val = row['Date'];
                        if (typeof val === 'number') {
                            // Excel serial date to JS date
                            finalDate = new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
                        } else if (typeof val === 'string') {
                            const d = new Date(val);
                            if (!isNaN(d.getTime())) finalDate = d.toISOString();
                        }

                        return {
                            id: `bulk-${Date.now()}-${idx}`,
                            date: finalDate,
                            poNumber: String(row['Purchase Order #'] || row['PO'] || row['PO Number'] || ''),
                            brand: String(row['Brand'] || ''),
                            itemDescription: String(row['Item'] || row['Description'] || row['Item Description'] || ''),
                            quantity: qty,
                            unitCost: unit,
                            totalCost: parseCurrency(String(row['Total'] || row['Total Cost'] || (qty * unit) || 0)),
                            supplier: normalizeSupplier(String(row['Supplier'] || '')),
                            projectName: String(row['Project'] || row['Project Name'] || ''),
                            type: String(row['TYPE'] || row['Type'] || 'Material'),
                            source: 'Bulk Import'
                        };
                  }).filter(r => r.itemDescription); 

                  setPurchases(prev => [...prev, ...newRecords]);
                  showNotification('success', `Successfully imported ${newRecords.length} records.`);
              }
          } catch (err) {
              console.error(err);
              showNotification('error', "Failed to process Excel file.");
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleSaveScanned = () => {
      if (!setPurchases) return;
      setPurchases(prev => [...prev, ...scannedRecords]);
      setScannedRecords([]);
      showNotification('success', 'Scanned records added to database.');
  };

  const handleManualAdd = () => {
      if (!setPurchases) return;
      if (!manualEntry.itemDescription || !manualEntry.supplier) {
          showNotification('error', 'Item description and supplier are required.');
          return;
      }
      
      const record: PurchaseRecord = {
          id: `man-${Date.now()}`,
          date: manualEntry.date || new Date().toISOString(),
          poNumber: manualEntry.poNumber || 'Manual',
          brand: manualEntry.brand || 'N/A',
          itemDescription: manualEntry.itemDescription,
          quantity: Number(manualEntry.quantity) || 1,
          unitCost: Number(manualEntry.unitCost) || 0,
          totalCost: (Number(manualEntry.quantity) || 1) * (Number(manualEntry.unitCost) || 0),
          supplier: normalizeSupplier(manualEntry.supplier),
          projectName: manualEntry.projectName || 'Inventory',
          type: 'Material',
          source: 'Manual Entry'
      };

      setPurchases(prev => [...prev, record]);
      showNotification('success', 'Record added successfully.');
      setManualEntry({
        date: new Date().toISOString().split('T')[0],
        supplier: '',
        itemDescription: '',
        quantity: 1,
        unitCost: 0,
        projectName: '',
        poNumber: ''
      });
  };

  const handleDeleteScanned = (index: number) => {
      setScannedRecords(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadTemplate = () => {
      const template = [{ "Date": "2024-01-01", "Purchase Order #": "PO-1001", "Brand": "Square D", "Item": "20A Breaker", "Quantity": 10, "Unit Cost": "$15.00", "TAX": "0", "Total": "$150.00", "Supplier": "World Electric", "Project": "Brickell Condo", "TYPE": "Material" }];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase History");
      XLSX.writeFile(workbook, "Carsan_Purchase_History_Template.xlsx");
  };

  // Mock Cashflow Data for Chart
  const cashFlowData = [
      { name: 'Jan', revenue: financialData.totalRevenue * 0.1, expenses: financialData.totalExpenses * 0.12 },
      { name: 'Feb', revenue: financialData.totalRevenue * 0.12, expenses: financialData.totalExpenses * 0.11 },
      { name: 'Mar', revenue: financialData.totalRevenue * 0.15, expenses: financialData.totalExpenses * 0.14 },
      { name: 'Apr', revenue: financialData.totalRevenue * 0.18, expenses: financialData.totalExpenses * 0.16 },
      { name: 'May', revenue: financialData.totalRevenue * 0.20, expenses: financialData.totalExpenses * 0.19 },
      { name: 'Jun', revenue: financialData.totalRevenue * 0.25, expenses: financialData.totalExpenses * 0.22 },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {notification && (
          <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium text-sm">{notification.message}</span>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Financial Suite</h1>
          <p className="text-slate-500 mt-1">Enterprise Profitability & Job Costing</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-full">
            <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'overview' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><LayoutDashboard className="w-4 h-4" /> Overview</button>
            <button onClick={() => setActiveTab('job-costing')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'job-costing' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Briefcase className="w-4 h-4" /> Job Costing</button>
            <button onClick={() => setActiveTab('purchasing')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'purchasing' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Wallet className="w-4 h-4" /> Purchasing</button>
            <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Database className="w-4 h-4" /> Data Entry</button>
        </div>
      </div>

      {/* --- FINANCIAL OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
          <div className="space-y-6">
              {/* P&L Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 p-4 opacity-10"><DollarSign className="w-16 h-16 text-emerald-500" /></div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Total Revenue</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">${financialData.totalRevenue.toLocaleString()}</p>
                      <div className="text-xs text-slate-500 mt-2">Projects: ${financialData.projectRevenue.toLocaleString()}</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 p-4 opacity-10"><TrendingUp className="w-16 h-16 text-red-500" /></div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Total Expenses</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">${financialData.totalExpenses.toLocaleString()}</p>
                      <div className="text-xs text-slate-500 mt-2">Materials: ${financialData.materialExpense.toLocaleString()}</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 p-4 opacity-10"><Wallet className="w-16 h-16 text-blue-500" /></div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Net Profit</p>
                      <p className={`text-2xl font-bold mt-1 ${financialData.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${financialData.netProfit.toLocaleString()}</p>
                      <div className="text-xs text-slate-500 mt-2">After Labor & Mat.</div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 p-4 opacity-10"><PieChart className="w-16 h-16 text-indigo-500" /></div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Profit Margin</p>
                      <p className={`text-2xl font-bold mt-1 ${financialData.margin >= 15 ? 'text-emerald-600' : 'text-orange-600'}`}>{financialData.margin.toFixed(1)}%</p>
                      <div className="text-xs text-slate-500 mt-2">Target: 20%</div>
                  </div>
              </div>

              {/* Cash Flow Chart */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-500" /> Cash Flow Trends (Last 6 Months)
                  </h3>
                  <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cashFlowData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                              <defs>
                                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <XAxis dataKey="name" axisLine={false} tickLine={false} />
                              <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                              <CartesianGrid vertical={false} stroke="#f1f5f9" />
                              <Tooltip formatter={(val:number) => [`$${val.toLocaleString()}`, '']} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} />
                              <Legend />
                              <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" name="Revenue" />
                              <Area type="monotone" dataKey="expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExp)" name="Expenses" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      )}

      {/* --- JOB COSTING TAB --- */}
      {activeTab === 'job-costing' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Briefcase className="w-5 h-5 text-slate-500"/> Project Profitability</h3>
                  <div className="text-xs text-slate-500 italic">*Labor Cost Estimated at 40% of Billed Labor</div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-white text-slate-500 font-bold uppercase text-xs border-b border-slate-200">
                          <tr>
                              <th className="px-6 py-4">Project</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4 text-right">Contract</th>
                              <th className="px-6 py-4 text-right">Mat. Cost</th>
                              <th className="px-6 py-4 text-right">Labor (Int)</th>
                              <th className="px-6 py-4 text-right">Total Cost</th>
                              <th className="px-6 py-4 text-right">Net Profit</th>
                              <th className="px-6 py-4 text-right">Margin</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {jobCostingData.map(job => (
                              <tr key={job.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-3 font-medium text-slate-900">{job.name}</td>
                                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${job.status === 'Ongoing' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{job.status}</span></td>
                                  <td className="px-6 py-3 text-right text-slate-600">${job.contract.toLocaleString()}</td>
                                  <td className="px-6 py-3 text-right text-slate-600">${job.actualMaterial.toLocaleString()}</td>
                                  <td className="px-6 py-3 text-right text-slate-600">${job.internalLaborCost.toLocaleString()}</td>
                                  <td className="px-6 py-3 text-right font-medium text-slate-800">${job.totalCost.toLocaleString()}</td>
                                  <td className={`px-6 py-3 text-right font-bold ${job.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${job.grossProfit.toLocaleString()}</td>
                                  <td className="px-6 py-3 text-right">
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${job.margin >= 20 ? 'bg-emerald-100 text-emerald-700' : job.margin >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                          {job.margin.toFixed(1)}%
                                      </span>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* --- PURCHASING TAB (Old Dashboard) --- */}
      {activeTab === 'purchasing' && (
          <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2"><Filter className="w-4 h-4" /> Filters:</div>
                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Item or PO..." className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48" />
                  </div>
                  <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                      <option value="All">All Projects</option>
                      {Array.from(new Set(purchases.map(p => p.projectName))).sort().map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
              </div>

              {!selectedItem && supplierScorecard.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                      <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Award className="w-5 h-5 text-purple-500" /> Supplier Competitiveness</h3>
                      </div>
                      <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={supplierScorecard} layout="horizontal" margin={{top: 20, bottom: 20}}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" tick={{fontSize: 11}} />
                                  <YAxis tickFormatter={(val) => `${val}%`} />
                                  <Tooltip formatter={(val: number) => [`${val.toFixed(1)}%`, 'Price Variance']} />
                                  <ReferenceLine y={0} stroke="#000" />
                                  <Bar dataKey="score" barSize={40} radius={[4, 4, 0, 0]}>
                                      {supplierScorecard.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.score <= 0 ? '#10b981' : '#ef4444'} />))}
                                  </Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className={`lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[500px] ${showMobileSelector ? 'fixed inset-0 z-50 m-0 rounded-none' : 'relative hidden lg:flex'}`}>
                      {showMobileSelector && (
                          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                              <h3 className="font-bold">Select Material</h3>
                              <button onClick={() => setShowMobileSelector(false)}><X className="w-6 h-6" /></button>
                          </div>
                      )}
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                          <div>
                              <h3 className="font-bold text-slate-800">Purchased Items</h3>
                              <p className="text-xs text-slate-500">Sorted by {sortByValue ? 'Value (Pareto)' : 'Name'}</p>
                          </div>
                          <button onClick={() => setSortByValue(!sortByValue)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><ListFilter className="w-4 h-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                          {processedItemsList.map((item, idx) => {
                              const isTopPareto = sortByValue && idx < paretoCutoffIndex;
                              return (
                                  <button key={idx} onClick={() => { setSelectedItem(item.name); setShowMobileSelector(false); }} className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 hover:bg-blue-50 transition-colors flex justify-between items-center group ${selectedItem === item.name ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-l-blue-500' : 'text-slate-600'}`}>
                                      <span className="truncate flex-1">{item.name}</span>
                                      <div className="flex items-center gap-2 text-xs">
                                          <span className="text-slate-400">${item.total.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                          {isTopPareto && <Flame className="w-3 h-3 text-orange-500" />}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  <div className="col-span-2 space-y-6">
                      <button onClick={() => setShowMobileSelector(true)} className="lg:hidden w-full bg-blue-600 text-white py-3 rounded-xl font-bold mb-4">{selectedItem ? `Analyzing: ${selectedItem}` : "Select Material to Analyze"}</button>

                      {selectedItem ? (
                          <>
                              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                  <div className="flex justify-between items-start mb-4">
                                      <div>
                                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Price History: {selectedItem}</h3>
                                          <p className="text-xs text-slate-500">Historical Unit Cost Trend</p>
                                      </div>
                                      <button onClick={() => setSelectedItem('')} className="text-xs text-blue-600 hover:underline">Clear Selection</button>
                                  </div>
                                  <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <ComposedChart data={purchases.filter(p => p.itemDescription === selectedItem).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())}>
                                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                              <XAxis dataKey="date" tickFormatter={(t) => new Date(t).toLocaleDateString()} fontSize={12} />
                                              <YAxis domain={['auto', 'auto']} fontSize={12} tickFormatter={(v) => `$${v}`} />
                                              <Tooltip labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(val: number) => [`$${val.toFixed(2)}`, 'Unit Cost']} />
                                              <Legend />
                                              <Line type="monotone" dataKey="unitCost" stroke="#3b82f6" strokeWidth={2} dot={{r: 4}} activeDot={{r: 6}} name="Unit Cost Trend" />
                                              <Scatter dataKey="unitCost" fill="#3b82f6" />
                                          </ComposedChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>

                              {/* NEW: Supplier Breakdown for Selected Item */}
                              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-purple-500" /> Supplier Breakdown</h3>
                                  <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={itemSupplierStats} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                              <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                                              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                                              <Tooltip 
                                                  cursor={{fill: '#f8fafc'}}
                                                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Avg Unit Cost']}
                                              />
                                              <Bar dataKey="avgPrice" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24}>
                                                  {itemSupplierStats.map((entry, index) => (
                                                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#8b5cf6'} />
                                                  ))}
                                              </Bar>
                                          </BarChart>
                                      </ResponsiveContainer>
                                  </div>
                                  <div className="mt-4 text-xs text-slate-500">
                                      <span className="font-bold text-emerald-600">Best Price:</span> {itemSupplierStats[0]?.name} (${itemSupplierStats[0]?.avgPrice.toFixed(2)}) 
                                      <span className="mx-2">•</span>
                                      <span className="font-bold text-slate-700">Total Purchases:</span> {itemSupplierStats.reduce((s, i) => s + i.count, 0)}
                                  </div>
                              </div>
                          </>
                      ) : (
                          <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400"><p>Select an item to view price analysis and supplier comparison.</p></div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- ENTRY TAB --- */}
      {activeTab === 'entry' && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Bulk Import */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600"/> Bulk Import</h3>
                      <button onClick={() => bulkInputRef.current?.click()} className="w-full border border-slate-300 text-slate-700 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 mb-2">Select Excel File</button>
                      <input type="file" ref={bulkInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} />
                      <button onClick={handleDownloadTemplate} className="text-xs text-blue-600 hover:underline">Download Template</button>
                  </div>
                  
                  {/* AI Extractor */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600"/> AI Invoice Extractor</h3>
                      <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${isExtracting ? 'bg-blue-50 border-blue-300' : 'border-slate-300 hover:border-blue-500'}`} onClick={() => !isExtracting && fileInputRef.current?.click()}>
                           <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleInvoiceUpload} />
                           {isExtracting ? <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto" />}
                           <p className="text-sm text-slate-500 mt-2">{isExtracting ? "Analyzing..." : "Upload Invoice"}</p>
                      </div>
                  </div>
              </div>

              {/* Scanned Items Review - Appears after scan */}
              {scannedRecords.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-200 animate-in slide-in-from-top-4">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                             <CheckCircle className="w-5 h-5 text-emerald-500" /> Review Scanned Items
                          </h3>
                          <div className="flex gap-2">
                              <button onClick={() => setScannedRecords([])} className="px-4 py-2 text-slate-500 text-sm font-bold hover:bg-slate-100 rounded-lg">Discard</button>
                              <button onClick={handleSaveScanned} className="px-6 py-2 bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-2">
                                  <Save className="w-4 h-4" /> Save to Database
                              </button>
                          </div>
                      </div>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                  <tr>
                                      <th className="px-4 py-2">Item</th>
                                      <th className="px-4 py-2">Supplier</th>
                                      <th className="px-4 py-2 text-right">Qty</th>
                                      <th className="px-4 py-2 text-right">Unit Cost</th>
                                      <th className="px-4 py-2 text-right">Total</th>
                                      <th className="px-4 py-2"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {scannedRecords.map((rec, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                          <td className="px-4 py-2 font-medium">{rec.itemDescription}</td>
                                          <td className="px-4 py-2 text-slate-600">{rec.supplier}</td>
                                          <td className="px-4 py-2 text-right">{rec.quantity}</td>
                                          <td className="px-4 py-2 text-right">${rec.unitCost}</td>
                                          <td className="px-4 py-2 text-right font-bold">${rec.totalCost}</td>
                                          <td className="px-4 py-2 text-center">
                                              <button onClick={() => handleDeleteScanned(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {/* Manual Entry Form */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Database className="w-5 h-5 text-slate-500"/> Manual Entry</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
                       <div className="col-span-1">
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Item Description</label>
                           <input 
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" 
                              value={manualEntry.itemDescription} 
                              onChange={(e) => setManualEntry({...manualEntry, itemDescription: e.target.value})}
                              placeholder="e.g. 1/2 EMT Conduit"
                           />
                       </div>
                       <div className="col-span-1">
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Supplier</label>
                           <input 
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" 
                              value={manualEntry.supplier} 
                              onChange={(e) => setManualEntry({...manualEntry, supplier: e.target.value})}
                              placeholder="e.g. Home Depot"
                           />
                       </div>
                       <div className="col-span-1">
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                           <input 
                              type="date"
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" 
                              value={manualEntry.date ? manualEntry.date.split('T')[0] : ''} 
                              onChange={(e) => setManualEntry({...manualEntry, date: new Date(e.target.value).toISOString()})}
                           />
                       </div>
                       <div className="col-span-1">
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
                           <select 
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                              value={manualEntry.projectName}
                              onChange={(e) => setManualEntry({...manualEntry, projectName: e.target.value})}
                           >
                               <option value="">Inventory / Stock</option>
                               {Array.from(new Set(projects.map(p => p.name))).map(p => <option key={p} value={p}>{p}</option>)}
                           </select>
                       </div>
                       <div className="col-span-1">
                           <button onClick={handleManualAdd} className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-800 flex items-center justify-center gap-2">
                               <Plus className="w-4 h-4" /> Add Record
                           </button>
                       </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};