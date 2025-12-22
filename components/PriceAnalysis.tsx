
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, ReferenceLine, Scatter, AreaChart, Area } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, PieChart, Sparkles, ListFilter, Flame, AlertTriangle, Trash2, Plus, Save, Briefcase, Wallet, RefreshCw, Calendar, Info, Download } from 'lucide-react';
import { extractInvoiceData } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency, normalizeSupplier, robustParseDate } from '../utils/purchaseData';
import { MIAMI_STANDARD_PRICES } from '../utils/miamiStandards';

interface PriceAnalysisProps {
  purchases: PurchaseRecord[];
  setPurchases?: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>;
  materials?: MaterialItem[]; 
  setMaterials?: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  projects?: ProjectEstimate[]; 
  tickets?: ServiceTicket[];
}

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases, setPurchases, materials, setMaterials, projects = [], tickets = [] }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'job-costing' | 'analysis' | 'entry'>('overview');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [sortByValue, setSortByValue] = useState(true);
  const [includeBenchmarks, setIncludeBenchmarks] = useState(false);
  
  // Date Filter State
  const currentYear = new Date().getFullYear();
  const [dateRange, setDateRange] = useState({
      start: `${currentYear}-01-01`,
      end: `${currentYear}-12-31`
  });
  
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

  // --- SMART DEFAULT: Switch to All Time if YTD is empty ---
  useEffect(() => {
      const start = robustParseDate(dateRange.start).getTime();
      const end = robustParseDate(dateRange.end).getTime() + (24 * 60 * 60 * 1000);
      const inRange = purchases.some(p => {
          const d = robustParseDate(p.date).getTime();
          return d >= start && d <= end;
      });
      if (!inRange && purchases.length > 0 && dateRange.start.includes(String(currentYear))) {
          // Switch to all time automatically if current year is empty
          setDateRange({ start: '2020-01-01', end: `${currentYear + 1}-12-31` });
      }
  }, [purchases.length]);

  // --- FILTERED DATA (By Date) ---
  const filteredData = useMemo(() => {
      const start = robustParseDate(dateRange.start).getTime();
      const end = robustParseDate(dateRange.end).getTime() + (24 * 60 * 60 * 1000) - 1;

      const filteredPurchases = purchases.filter(p => {
          const d = robustParseDate(p.date).getTime();
          return d >= start && d <= end;
      });

      const filteredProjects = projects.filter(p => {
          const dateStr = p.awardedDate || p.dateCreated;
          const d = robustParseDate(dateStr).getTime();
          return d >= start && d <= end;
      });

      const filteredTickets = tickets.filter(t => {
          const d = robustParseDate(t.dateCreated).getTime();
          return d >= start && d <= end;
      });

      return { purchases: filteredPurchases, projects: filteredProjects, tickets: filteredTickets };
  }, [purchases, projects, tickets, dateRange]);

  // --- FINANCIAL CALCULATIONS (Using Filtered Data) ---
  const financialData = useMemo(() => {
      const { projects: pList, tickets: tList, purchases: purList } = filteredData;

      const projectRevenue = pList
          .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
          .reduce((sum, p) => sum + (p.contractValue || 0), 0);

      const serviceRevenue = tList
          .filter(t => ['Authorized', 'Completed'].includes(t.status))
          .reduce((sum, t) => {
              const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
              const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
              return sum + mat + lab;
          }, 0);

      const totalRevenue = projectRevenue + serviceRevenue;
      const materialExpense = purList.reduce((sum, p) => sum + p.totalCost, 0);
      const laborCostBasis = 0.4; 
      
      const projectLaborRev = pList
        .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
        .reduce((sum, p) => sum + p.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * p.laborRate), 0), 0);
      
      const ticketLaborRev = tList
        .filter(t => ['Authorized', 'Completed'].includes(t.status))
        .reduce((sum, t) => sum + t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0), 0);

      const totalLaborExpense = (projectLaborRev + ticketLaborRev) * laborCostBasis;
      const totalExpenses = materialExpense + totalLaborExpense;

      const netProfit = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return { totalRevenue, totalExpenses, netProfit, margin, projectRevenue, serviceRevenue, materialExpense, totalLaborExpense };
  }, [filteredData]);

  // --- JOB COSTING DATA CALCULATION ---
  const jobCostingData = useMemo(() => {
      // Filter projects that are in relevant stages for costing
      const activeProjects = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status));
      
      return activeProjects.map(p => {
          // Calculate Estimates from the Project Items
          const estMat = p.items.reduce((sum, i) => sum + (i.quantity * i.unitMaterialCost), 0);
          const estLab = p.items.reduce((sum, i) => sum + (i.quantity * i.unitLaborHours * p.laborRate), 0);
          
          // Calculate Actuals from Purchases (Matching by Project Name)
          // Note: In a real app, this would use ID matching. Here we use Name fuzzy matching.
          const actMat = purchases
              .filter(pur => pur.projectName && pur.projectName.trim().toLowerCase() === p.name.trim().toLowerCase())
              .reduce((sum, pur) => sum + pur.totalCost, 0);
          
          // Actual Labor - Placeholder as we don't have time tracking data yet
          // Can be updated later to pull from a TimeSheet module
          const actLab = 0; 
          
          // Fallback contract value logic if not explicitly set
          const contract = p.contractValue || (estMat + estLab) * 1.3; 
          
          return {
              id: p.id,
              name: p.name,
              status: p.status,
              contract,
              estMat,
              actMat,
              estLab,
              actLab
          };
      }).sort((a, b) => b.contract - a.contract); // Sort by biggest projects first
  }, [projects, purchases]);

  // --- PURCHASING ANALYSIS LOGIC (Including optional Benchmarks) ---
  const processedItemsList = useMemo(() => {
      const itemMap = new Map<string, { total: number, count: number, isBenchmark?: boolean }>();
      
      // 1. Add Real Purchases
      filteredData.purchases.forEach(p => {
          const name = p.itemDescription || 'Unknown';
          if (!itemMap.has(name)) itemMap.set(name, { total: 0, count: 0 });
          const curr = itemMap.get(name)!;
          curr.total += p.totalCost || 0;
          curr.count += 1;
      });

      // 2. Add AI Benchmarks if toggled
      if (includeBenchmarks) {
          MIAMI_STANDARD_PRICES.forEach(standard => {
              if (!itemMap.has(standard.name)) {
                  itemMap.set(standard.name, { total: standard.materialCost, count: 1, isBenchmark: true });
              }
          });
      }

      let items = Array.from(itemMap.entries()).map(([name, data]) => ({
          name,
          total: data.total,
          count: data.count,
          isBenchmark: data.isBenchmark
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
  }, [filteredData.purchases, searchTerm, sortByValue, includeBenchmarks]);

  const supplierScorecard = useMemo(() => {
      if (filteredData.purchases.length === 0) return [];
      const itemStats: Record<string, { totalCost: number, count: number, avg: number }> = {};
      
      filteredData.purchases.forEach(p => {
          const key = p.itemDescription.trim().toLowerCase();
          if (!itemStats[key]) itemStats[key] = { totalCost: 0, count: 0, avg: 0 };
          itemStats[key].totalCost += p.unitCost;
          itemStats[key].count += 1;
      });

      Object.keys(itemStats).forEach(k => {
          itemStats[k].avg = itemStats[k].totalCost / itemStats[k].count;
      });

      const supplierStats: Record<string, { totalVariancePct: number, itemsCount: number }> = {};

      filteredData.purchases.forEach(p => {
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
      .filter(s => s.itemsCount >= 1)
      .sort((a, b) => a.score - b.score);
  }, [filteredData.purchases]);

  const itemSupplierStats = useMemo(() => {
        if (!selectedItem) return [];
        const relevant = filteredData.purchases.filter(p => p.itemDescription === selectedItem);
        const groups: Record<string, { total: number, count: number, min: number, max: number }> = {};
        
        relevant.forEach(r => {
            const sup = normalizeSupplier(r.supplier);
            if (!groups[sup]) groups[sup] = { total: 0, count: 0, min: r.unitCost, max: r.unitCost };
            groups[sup].total += r.unitCost;
            groups[sup].count += 1;
            groups[sup].min = Math.min(groups[sup].min, r.unitCost);
            groups[sup].max = Math.max(groups[sup].max, r.unitCost);
        });

        const results = Object.entries(groups).map(([name, stats]) => ({
            name,
            avgPrice: stats.total / stats.count,
            minPrice: stats.min,
            maxPrice: stats.max,
            count: stats.count
        }));

        // Inject AI Standard for comparison
        const benchmark = MIAMI_STANDARD_PRICES.find(m => m.name === selectedItem);
        if (benchmark) {
            results.push({
                name: 'AI Benchmark',
                avgPrice: benchmark.materialCost,
                minPrice: benchmark.materialCost,
                maxPrice: benchmark.materialCost,
                count: 1
            });
        }

        return results.sort((a,b) => a.avgPrice - b.avgPrice); 
  }, [filteredData.purchases, selectedItem]);

  const showNotification = (type: 'success' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 5000);
  };

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

      setPurchases((prev: PurchaseRecord[]) => [...prev, record]);
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
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Wallet className="w-4 h-4" /> Price Analysis</button>
            <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Database className="w-4 h-4" /> Data Entry</button>
        </div>
      </div>

      {/* --- FINANCIAL DATE FILTER BAR --- */}
      {(activeTab === 'overview' || activeTab === 'analysis') && (
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2">
                    <Calendar className="w-4 h-4" /> Period:
                </div>
                <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50">
                    <input 
                        type="date" 
                        value={dateRange.start}
                        onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                        className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                    />
                    <span className="text-slate-400">-</span>
                    <input 
                        type="date" 
                        value={dateRange.end}
                        onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                        className="bg-transparent text-sm font-medium text-slate-700 outline-none"
                    />
                </div>
                <button 
                    onClick={() => setDateRange({ start: `${currentYear}-01-01`, end: `${currentYear}-12-31` })}
                    className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg"
                >
                    This Year
                </button>
                <button 
                    onClick={() => setDateRange({ start: '2020-01-01', end: `${currentYear + 1}-12-31` })}
                    className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded-lg"
                >
                    All Time
                </button>
              </div>
              
              <div className="px-4 py-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Records in view:</span>
                  <span className="text-sm font-bold text-slate-700">{filteredData.purchases.length}</span>
                  {filteredData.purchases.length === 0 && purchases.length > 0 && (
                      <div className="flex items-center gap-1 text-orange-600 animate-pulse ml-2" title="Items exist but are hidden by date filter">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold">Filtered Out</span>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* --- FINANCIAL OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
          <div className="space-y-6">
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

      {/* --- PRICE ANALYSIS TAB --- */}
      {activeTab === 'analysis' && (
          <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2"><Filter className="w-4 h-4" /> Item Filters:</div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Item or PO..." className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48" />
                    </div>
                    <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                        <option value="All">All Projects</option>
                        {Array.from(new Set(purchases.map(p => p.projectName))).sort().map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 group transition-all hover:bg-blue-100">
                          <input 
                            type="checkbox" 
                            checked={includeBenchmarks} 
                            onChange={(e) => setIncludeBenchmarks(e.target.checked)} 
                            className="w-4 h-4 text-blue-600 rounded border-blue-300 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-blue-700 group-hover:text-blue-800 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" /> Include AI Benchmarks
                          </span>
                      </label>
                      <div className="group relative">
                          <Info className="w-4 h-4 text-slate-400 cursor-help" />
                          <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                              Real Purchases show what you actually paid. AI Benchmarks show standard industry market rates for comparison.
                          </div>
                      </div>
                  </div>
              </div>

              {!selectedItem && supplierScorecard.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Award className="w-5 h-5 text-purple-500" /> Supplier Competitiveness</h3>
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
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                          <div>
                              <h3 className="font-bold text-slate-800">Available Materials</h3>
                              <p className="text-xs text-slate-500">{processedItemsList.length} items found</p>
                          </div>
                          <button onClick={() => setSortByValue(!sortByValue)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><ListFilter className="w-4 h-4" /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                          {processedItemsList.map((item, idx) => (
                              <button 
                                key={idx} 
                                onClick={() => { setSelectedItem(item.name); setShowMobileSelector(false); }} 
                                className={`w-full text-left px-4 py-3 text-sm border-b border-slate-50 hover:bg-blue-50 transition-colors flex justify-between items-center group ${selectedItem === item.name ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-l-blue-500' : 'text-slate-600'}`}
                              >
                                  <div className="flex items-center gap-2 truncate">
                                      {item.isBenchmark && <Sparkles className="w-3 h-3 text-blue-400 shrink-0" />}
                                      <span className="truncate">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-slate-400">{item.isBenchmark ? 'Market rate' : `$${item.total.toLocaleString(undefined, {maximumFractionDigits: 0})}`}</span>
                                  </div>
                              </button>
                          ))}
                      </div>
                  </div>

                  <div className="col-span-2 space-y-6">
                      {selectedItem ? (
                          <>
                              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                  <div className="flex justify-between items-start mb-4">
                                      <div>
                                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Price History: {selectedItem}</h3>
                                      </div>
                                      <button onClick={() => setSelectedItem('')} className="text-xs text-blue-600 hover:underline">Clear Selection</button>
                                  </div>
                                  <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <ComposedChart data={filteredData.purchases.filter(p => p.itemDescription === selectedItem).sort((a,b) => robustParseDate(a.date).getTime() - robustParseDate(b.date).getTime())}>
                                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                              <XAxis dataKey="date" tickFormatter={(t) => new Date(t).toLocaleDateString()} fontSize={12} />
                                              <YAxis domain={['auto', 'auto']} fontSize={12} tickFormatter={(v) => `$${v}`} />
                                              <Tooltip labelFormatter={(t) => new Date(t).toLocaleDateString()} formatter={(val: number) => [`$${val.toFixed(2)}`, 'Unit Cost']} />
                                              <Legend />
                                              <Line type="monotone" dataKey="unitCost" stroke="#3b82f6" strokeWidth={2} dot={{r: 4}} activeDot={{r: 6}} name="Actual Cost" />
                                              {MIAMI_STANDARD_PRICES.find(m => m.name === selectedItem) && (
                                                   <ReferenceLine 
                                                      y={MIAMI_STANDARD_PRICES.find(m => m.name === selectedItem)!.materialCost} 
                                                      label={{ value: 'AI Benchmark', fill: '#94a3b8', fontSize: 10, position: 'insideTopRight' }} 
                                                      stroke="#94a3b8" 
                                                      strokeDasharray="3 3" 
                                                   />
                                              )}
                                          </ComposedChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>

                              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-purple-500" /> Actual vs. Benchmark Breakdown</h3>
                                  <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={itemSupplierStats} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                              <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                                              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                                              <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']} />
                                              <Bar dataKey="avgPrice" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24}>
                                                  {itemSupplierStats.map((entry, index) => (
                                                      <Cell key={`cell-${index}`} fill={entry.name === 'AI Benchmark' ? '#94a3b8' : index === 0 ? '#10b981' : '#3b82f6'} />
                                                  ))}
                                              </Bar>
                                          </BarChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>
                          </>
                      ) : (
                          <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 p-12 text-center">
                              <div>
                                  <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                  <p className="font-medium">Select a material on the left to see price trends.</p>
                                  <p className="text-xs mt-2">Turn on "Include AI Benchmarks" to compare with market standards.</p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- DATA ENTRY & JOB COSTING --- */}
      {activeTab === 'job-costing' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">Project Profitability & Job Costing</h3>
                  <div className="flex items-center gap-2">
                     <span className="text-xs text-slate-500 italic hidden md:inline">* Actual Labor data requires Time Tracking module</span>
                     <button className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg" title="Export CSV"><Download className="w-4 h-4" /></button>
                  </div>
              </div>
              <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left min-w-[1000px]">
                       <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                           <tr>
                               <th className="px-6 py-4">Project Name</th>
                               <th className="px-4 py-4 text-center">Status</th>
                               <th className="px-4 py-4 text-right">Contract</th>
                               <th className="px-4 py-4 text-right border-l border-slate-200">Est. Mat</th>
                               <th className="px-4 py-4 text-right">Act. Mat</th>
                               <th className="px-4 py-4 text-right">Var %</th>
                               <th className="px-4 py-4 text-right border-l border-slate-200">Est. Lab</th>
                               <th className="px-4 py-4 text-right">Act. Lab</th>
                               <th className="px-6 py-4 text-right border-l border-slate-200">Gross Profit</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {jobCostingData.map(row => {
                               const matVar = row.estMat > 0 ? ((row.actMat - row.estMat) / row.estMat) * 100 : 0;
                               const grossProfit = row.contract - (row.actMat + row.actLab); // Using Actuals for profit calculation
                               
                               return (
                                   <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                       <td className="px-6 py-4 font-bold text-slate-800">{row.name}</td>
                                       <td className="px-4 py-4 text-center">
                                           <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${row.status === 'Completed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                                               {row.status}
                                           </span>
                                       </td>
                                       <td className="px-4 py-4 text-right font-bold text-slate-900">${row.contract.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                       
                                       <td className="px-4 py-4 text-right border-l border-slate-200 text-slate-600">${row.estMat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                       <td className="px-4 py-4 text-right font-medium text-slate-800">${row.actMat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                       <td className="px-4 py-4 text-right">
                                           <div className={`flex items-center justify-end gap-1 font-bold ${matVar > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                               {matVar > 0 ? <TrendingUp className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                                               {Math.abs(matVar).toFixed(1)}%
                                           </div>
                                       </td>
                                       
                                       <td className="px-4 py-4 text-right border-l border-slate-200 text-slate-600">${row.estLab.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                       <td className="px-4 py-4 text-right text-slate-400 italic">${row.actLab.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                       
                                       <td className="px-6 py-4 text-right border-l border-slate-200 font-bold text-emerald-700 bg-emerald-50/30">
                                           ${grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                       </td>
                                   </tr>
                               );
                           })}
                           {jobCostingData.length === 0 && (
                               <tr><td colSpan={9} className="p-12 text-center text-slate-400">No active or completed projects found to analyze.</td></tr>
                           )}
                       </tbody>
                   </table>
              </div>
          </div>
      )}

      {activeTab === 'entry' && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600"/> Bulk Import</h3>
                      <button onClick={() => bulkInputRef.current?.click()} className="w-full border border-slate-300 text-slate-700 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 mb-2">Select Excel File</button>
                      <input type="file" ref={bulkInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && setPurchases) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                  const data = event.target?.result;
                                  const workbook = XLSX.read(data, { type: 'array' });
                                  const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                                  const newRecords = jsonData.map((row: any, idx) => ({
                                      id: `bulk-${Date.now()}-${idx}`,
                                      date: robustParseDate(row['Date']).toISOString(),
                                      poNumber: String(row['Purchase Order #'] || ''),
                                      brand: String(row['Brand'] || 'N/A'), // Fix here
                                      itemDescription: String(row['Item'] || ''),
                                      quantity: Number(row['Quantity'] || 0),
                                      unitCost: parseCurrency(String(row['Unit Cost'] || 0)),
                                      totalCost: parseCurrency(String(row['Total'] || 0)),
                                      supplier: normalizeSupplier(String(row['Supplier'] || '')),
                                      projectName: String(row['Project'] || 'Inventory'),
                                      type: 'Material'
                                  }));
                                  setPurchases(prev => [...prev, ...newRecords]);
                                  showNotification('success', `Imported ${newRecords.length} items.`);
                              };
                              reader.readAsArrayBuffer(file);
                          }
                      }} />
                  </div>
                  
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600"/> AI Invoice Extractor</h3>
                      <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${isExtracting ? 'bg-blue-50 border-blue-300' : 'border-slate-300 hover:border-blue-500'}`} onClick={() => !isExtracting && fileInputRef.current?.click()}>
                           <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleInvoiceUpload} />
                           {isExtracting ? <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto" />}
                           <p className="text-sm text-slate-500 mt-2">{isExtracting ? "Analyzing..." : "Upload Invoice"}</p>
                      </div>
                  </div>
              </div>

              {scannedRecords.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-200 animate-in slide-in-from-top-4">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                             <CheckCircle className="w-5 h-5 text-emerald-500" /> Review Scanned Items
                          </h3>
                          <div className="flex gap-2">
                              <button onClick={() => setScannedRecords([])} className="px-4 py-2 text-slate-500 text-sm font-bold hover:bg-slate-100 rounded-lg">Discard</button>
                              <button onClick={() => {
                                  if(setPurchases) {
                                      setPurchases(prev => [...prev, ...scannedRecords]);
                                      setScannedRecords([]);
                                      showNotification('success', 'Records saved.');
                                  }
                              }} className="px-6 py-2 bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4" /> Save to Database
                              </button>
                          </div>
                      </div>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                  <tr><th className="px-4 py-2">Item</th><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit</th><th className="px-4 py-2 text-right">Total</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {scannedRecords.map((rec, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                          <td className="px-4 py-2 font-medium">{rec.itemDescription}</td>
                                          <td className="px-4 py-2 text-slate-600">{rec.supplier}</td>
                                          <td className="px-4 py-2 text-right">{rec.quantity}</td>
                                          <td className="px-4 py-2 text-right">${rec.unitCost.toFixed(2)}</td>
                                          <td className="px-4 py-2 text-right font-bold">${rec.totalCost.toFixed(2)}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};
