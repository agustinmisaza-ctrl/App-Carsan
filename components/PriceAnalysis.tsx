
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket, SupplierStatus, ShoppingItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, ReferenceLine, Scatter, AreaChart, Area } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, PieChart, Sparkles, ListFilter, Flame, AlertTriangle, Trash2, Plus, Save, Briefcase, Wallet, RefreshCw, Calendar, Info, Download, ShoppingCart, Ban, ShieldAlert, ArrowRight } from 'lucide-react';
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

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases = [], setPurchases, materials = [], setMaterials, projects = [], tickets = [] }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'job-costing' | 'analysis' | 'procurement' | 'entry'>('overview');
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

  // Procurement State
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [supplierStatuses, setSupplierStatuses] = useState<SupplierStatus[]>([]);

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

  // --- INIT SUPPLIER STATUSES ---
  useEffect(() => {
      const uniqueSuppliers = Array.from(new Set(purchases.map(p => normalizeSupplier(p.supplier))));
      setSupplierStatuses(prev => {
          // Keep existing status if set, otherwise default to unblocked
          return uniqueSuppliers.map(name => {
              const existing = prev.find(s => s.name === name);
              return existing || { name, isBlocked: false };
          });
      });
  }, [purchases]);

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

  // --- FINANCIAL CALCULATIONS ---
  const financialData = useMemo(() => {
      const { projects: pList, tickets: tList, purchases: purList } = filteredData;

      const projectRevenue = pList
          .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
          .reduce((sum, p) => sum + (p.contractValue || 0), 0);

      const serviceRevenue = tList
          .filter(t => ['Authorized', 'Completed'].includes(t.status))
          .reduce((sum, t) => {
              const mat = (t.items || []).reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
              const lab = (t.items || []).reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
              return sum + mat + lab;
          }, 0);

      const totalRevenue = projectRevenue + serviceRevenue;
      const materialExpense = purList.reduce((sum, p) => sum + p.totalCost, 0);
      const laborCostBasis = 0.4; 
      
      const projectLaborRev = pList
        .filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status))
        .reduce((sum, p) => sum + (p.items || []).reduce((s, i) => s + (i.quantity * i.unitLaborHours * p.laborRate), 0), 0);
      
      const ticketLaborRev = tList
        .filter(t => ['Authorized', 'Completed'].includes(t.status))
        .reduce((sum, t) => sum + (t.items || []).reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0), 0);

      const totalLaborExpense = (projectLaborRev + ticketLaborRev) * laborCostBasis;
      const totalExpenses = materialExpense + totalLaborExpense;

      const netProfit = totalRevenue - totalExpenses;
      const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return { totalRevenue, totalExpenses, netProfit, margin, projectRevenue, serviceRevenue, materialExpense, totalLaborExpense };
  }, [filteredData]);

  // --- JOB COSTING DATA ---
  const jobCostingData = useMemo(() => {
      const activeProjects = projects.filter(p => ['Won', 'Ongoing', 'Completed'].includes(p.status));
      
      return activeProjects.map(p => {
          const estMat = (p.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitMaterialCost || 0)), 0);
          const estLab = (p.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitLaborHours || 0) * (p.laborRate || 0)), 0);
          
          const actMat = purchases
              .filter(pur => pur.projectName && pur.projectName.trim().toLowerCase() === p.name.trim().toLowerCase())
              .reduce((sum, pur) => sum + (pur.totalCost || 0), 0);
          
          const actLab = 0; 
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
      }).sort((a, b) => b.contract - a.contract);
  }, [projects, purchases]);

  // --- PURCHASING ANALYSIS LOGIC ---
  const processedItemsList = useMemo(() => {
      const itemMap = new Map<string, { total: number, count: number, isBenchmark?: boolean }>();
      
      filteredData.purchases.forEach(p => {
          const name = p.itemDescription || 'Unknown';
          if (!itemMap.has(name)) itemMap.set(name, { total: 0, count: 0 });
          const curr = itemMap.get(name)!;
          curr.total += p.totalCost || 0;
          curr.count += 1;
      });

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

  // --- MULTI-SUPPLIER FLUCTUATION DATA ---
  const multiSupplierChartData = useMemo(() => {
      if (!selectedItem) return [];
      
      const relevantPurchases = purchases.filter(p => p.itemDescription === selectedItem);
      // Sort by date asc
      relevantPurchases.sort((a,b) => robustParseDate(a.date).getTime() - robustParseDate(b.date).getTime());

      // We need a structure like: [{date: '2023-01', 'World Electric': 10, 'Graybar': 12}, ...]
      // But recharts handles varying keys if we structure data correctly or iterate lines.
      // Easiest is to create a list of data points, each point has date and specific supplier price.
      
      return relevantPurchases.map(p => ({
          date: robustParseDate(p.date).toLocaleDateString(),
          timestamp: robustParseDate(p.date).getTime(),
          [normalizeSupplier(p.supplier)]: p.unitCost,
          supplierName: normalizeSupplier(p.supplier),
          price: p.unitCost
      }));
  }, [selectedItem, purchases]);

  const supplierColors = ['#2563eb', '#16a34a', '#db2777', '#ca8a04', '#9333ea', '#0891b2'];

  const selectedItemSupplierStats = useMemo(() => {
        if (!selectedItem) return [];
        const relevant = purchases.filter(p => p.itemDescription === selectedItem);
        const groups: Record<string, { total: number, count: number, min: number, max: number, lastDate: number, lastPrice: number }> = {};
        
        relevant.forEach(r => {
            const sup = normalizeSupplier(r.supplier);
            const date = robustParseDate(r.date).getTime();
            
            if (!groups[sup]) groups[sup] = { total: 0, count: 0, min: r.unitCost, max: r.unitCost, lastDate: date, lastPrice: r.unitCost };
            
            groups[sup].total += r.unitCost;
            groups[sup].count += 1;
            groups[sup].min = Math.min(groups[sup].min, r.unitCost);
            groups[sup].max = Math.max(groups[sup].max, r.unitCost);
            
            if (date > groups[sup].lastDate) {
                groups[sup].lastDate = date;
                groups[sup].lastPrice = r.unitCost;
            }
        });

        return Object.entries(groups).map(([name, stats]) => ({
            name,
            avgPrice: stats.total / stats.count,
            minPrice: stats.min,
            maxPrice: stats.max,
            lastPrice: stats.lastPrice,
            lastDate: new Date(stats.lastDate).toLocaleDateString(),
            count: stats.count
        })).sort((a,b) => a.lastPrice - b.lastPrice); // Cheapest Last Price first
  }, [purchases, selectedItem]);

  // --- SMART PROCUREMENT LOGIC ---
  const optimizedProcurement = useMemo(() => {
      const plan: Record<string, { items: ShoppingItem[], totalEst: number }> = {};
      const unknownItems: ShoppingItem[] = [];

      shoppingList.forEach(item => {
          // Find historical prices for this item
          const history = purchases.filter(p => p.itemDescription.toLowerCase().includes(item.name.toLowerCase()));
          
          if (history.length === 0) {
              unknownItems.push(item);
              return;
          }

          // Filter out blocked suppliers
          const validHistory = history.filter(p => {
              const supName = normalizeSupplier(p.supplier);
              const status = supplierStatuses.find(s => s.name === supName);
              return !status?.isBlocked;
          });

          if (validHistory.length === 0) {
              // All known suppliers are blocked
              unknownItems.push(item);
              return;
          }

          // Find lowest recent price (simple logic: lowest price in history from valid suppliers)
          // Ideally: Weighted by recency, but min price is good for "Smart Shopping"
          validHistory.sort((a, b) => a.unitCost - b.unitCost);
          const bestOption = validHistory[0];
          const bestSupplier = normalizeSupplier(bestOption.supplier);

          if (!plan[bestSupplier]) plan[bestSupplier] = { items: [], totalEst: 0 };
          
          plan[bestSupplier].items.push(item);
          plan[bestSupplier].totalEst += (bestOption.unitCost * item.quantity);
      });

      return { plan, unknownItems };
  }, [shoppingList, purchases, supplierStatuses]);

  const toggleSupplierBlock = (name: string) => {
      setSupplierStatuses(prev => prev.map(s => s.name === name ? { ...s, isBlocked: !s.isBlocked } : s));
  };

  const handleAddItemToShoppingList = () => {
      if (!newItemName) return;
      setShoppingList([...shoppingList, { id: Date.now().toString(), name: newItemName, quantity: newItemQty }]);
      setNewItemName('');
      setNewItemQty(1);
  };

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
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp className="w-4 h-4" /> Market Trends</button>
            <button onClick={() => setActiveTab('procurement')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'procurement' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><ShoppingCart className="w-4 h-4" /> Smart Buy</button>
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

      {/* --- PRICE ANALYSIS / MARKET TRENDS TAB --- */}
      {activeTab === 'analysis' && (
          <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2"><Filter className="w-4 h-4" /> Item Filters:</div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Item or PO..." className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48" />
                    </div>
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
                  </div>
              </div>

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
                                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Price Fluctuation: {selectedItem}</h3>
                                          <p className="text-xs text-slate-500">Historical price tracking by supplier</p>
                                      </div>
                                      <button onClick={() => setSelectedItem('')} className="text-xs text-blue-600 hover:underline">Clear Selection</button>
                                  </div>
                                  <div className="h-72 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <LineChart data={multiSupplierChartData}>
                                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                              <XAxis dataKey="date" fontSize={11} tickMargin={10} />
                                              <YAxis domain={['auto', 'auto']} fontSize={11} tickFormatter={(v) => `$${v}`} />
                                              <Tooltip labelStyle={{color: '#333'}} formatter={(val: number, name: string) => [`$${val.toFixed(2)}`, name]} />
                                              <Legend verticalAlign="top" height={36} />
                                              {/* Generate a Line for each supplier found in this data set */}
                                              {Array.from(new Set(multiSupplierChartData.map(d => d.supplierName))).map((supplierName, idx) => (
                                                  <Line 
                                                    key={supplierName}
                                                    type="monotone" 
                                                    dataKey={supplierName} 
                                                    stroke={supplierColors[idx % supplierColors.length]} 
                                                    strokeWidth={2} 
                                                    dot={{r: 4}} 
                                                    connectNulls={true}
                                                    name={supplierName}
                                                  />
                                              ))}
                                          </LineChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>

                              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-purple-500" /> Supplier Breakdown</h3>
                                  <div className="overflow-x-auto">
                                      <table className="w-full text-sm text-left">
                                          <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase">
                                              <tr>
                                                  <th className="px-4 py-3">Supplier</th>
                                                  <th className="px-4 py-3 text-right">Last Price</th>
                                                  <th className="px-4 py-3 text-right">Avg Price</th>
                                                  <th className="px-4 py-3 text-right">Min Price</th>
                                                  <th className="px-4 py-3 text-right">Last Bought</th>
                                                  <th className="px-4 py-3 text-center">Trend</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {selectedItemSupplierStats.map((stat) => {
                                                  const trend = stat.lastPrice < stat.avgPrice ? 'down' : 'up';
                                                  return (
                                                      <tr key={stat.name} className="hover:bg-slate-50">
                                                          <td className="px-4 py-3 font-bold text-slate-700">{stat.name}</td>
                                                          <td className="px-4 py-3 text-right font-bold text-slate-900">${stat.lastPrice.toFixed(2)}</td>
                                                          <td className="px-4 py-3 text-right text-slate-500">${stat.avgPrice.toFixed(2)}</td>
                                                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">${stat.minPrice.toFixed(2)}</td>
                                                          <td className="px-4 py-3 text-right text-slate-500 text-xs">{stat.lastDate}</td>
                                                          <td className="px-4 py-3 text-center flex justify-center">
                                                              {trend === 'down' ? (
                                                                  <TrendingUp className="w-4 h-4 text-emerald-500 rotate-180" />
                                                              ) : (
                                                                  <TrendingUp className="w-4 h-4 text-red-500" />
                                                              )}
                                                          </td>
                                                      </tr>
                                                  );
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </>
                      ) : (
                          <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 p-12 text-center">
                              <div>
                                  <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                  <p className="font-medium">Select a material on the left to analyze supplier pricing.</p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- SMART PROCUREMENT TAB --- */}
      {activeTab === 'procurement' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              {/* Left: Shopping List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-blue-500"/> Procurement List</h3>
                  </div>
                  <div className="p-4 border-b border-slate-100">
                      <div className="flex gap-2">
                          <input 
                              placeholder="Item Name (e.g. 1/2 EMT)" 
                              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newItemName}
                              onChange={(e) => setNewItemName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddItemToShoppingList()}
                          />
                          <input 
                              type="number" 
                              className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                              value={newItemQty}
                              onChange={(e) => setNewItemQty(Number(e.target.value))}
                          />
                          <button onClick={handleAddItemToShoppingList} className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-700">
                              <Plus className="w-4 h-4" />
                          </button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                      {shoppingList.map(item => (
                          <div key={item.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded group">
                              <span className="text-sm font-medium text-slate-700">{item.quantity}x {item.name}</span>
                              <button onClick={() => setShoppingList(list => list.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                      ))}
                      {shoppingList.length === 0 && (
                          <div className="text-center text-slate-400 p-8 text-sm italic">Add items to build your shopping list.</div>
                      )}
                  </div>
              </div>

              {/* Middle: Supplier Health */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-orange-500"/> Supplier Status</h3>
                      <p className="text-[10px] text-slate-500">Block suppliers > 60 days past due</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                      {supplierStatuses.map(supplier => (
                          <div key={supplier.name} className={`flex justify-between items-center p-3 rounded border transition-all ${supplier.isBlocked ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                              <div className="flex items-center gap-2">
                                  {supplier.isBlocked ? <Ban className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                                  <span className={`text-sm font-bold ${supplier.isBlocked ? 'text-red-700' : 'text-slate-700'}`}>{supplier.name}</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" className="sr-only peer" checked={supplier.isBlocked} onChange={() => toggleSupplierBlock(supplier.name)} />
                                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                              </label>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Right: Optimization Result */}
              <div className="bg-slate-900 text-white rounded-xl shadow-lg flex flex-col h-full overflow-hidden">
                  <div className="p-6 border-b border-slate-700">
                      <h3 className="font-bold text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-yellow-400"/> AI Smart Plan</h3>
                      <p className="text-slate-400 text-xs mt-1">Optimization based on lowest historical price from allowed suppliers.</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                      {Object.keys(optimizedProcurement.plan).length === 0 && optimizedProcurement.unknownItems.length === 0 ? (
                          <div className="text-center text-slate-500 mt-10">Add items to see recommendations.</div>
                      ) : (
                          <>
                              {Object.entries(optimizedProcurement.plan).map(([supplier, data]) => (
                                  <div key={supplier} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                      <div className="flex justify-between items-center mb-2">
                                          <span className="font-bold text-emerald-400 text-sm">{supplier}</span>
                                          <span className="text-xs bg-slate-700 px-2 py-1 rounded text-white">Est. ${data.totalEst.toFixed(2)}</span>
                                      </div>
                                      <ul className="space-y-1">
                                          {data.items.map((item, i) => (
                                              <li key={i} className="text-xs text-slate-300 flex justify-between">
                                                  <span>{item.quantity}x {item.name}</span>
                                                  <CheckCircle className="w-3 h-3 text-emerald-500 opacity-50" />
                                              </li>
                                          ))}
                                      </ul>
                                  </div>
                              ))}

                              {optimizedProcurement.unknownItems.length > 0 && (
                                  <div className="bg-slate-800 rounded-lg p-4 border border-dashed border-slate-600 opacity-75">
                                      <div className="flex justify-between items-center mb-2">
                                          <span className="font-bold text-slate-400 text-sm">Unknown Items</span>
                                          <span className="text-xs bg-slate-700 px-2 py-1 rounded text-white">Get Quote</span>
                                      </div>
                                      <ul className="space-y-1">
                                          {optimizedProcurement.unknownItems.map((item, i) => (
                                              <li key={i} className="text-xs text-slate-400">{item.quantity}x {item.name}</li>
                                          ))}
                                      </ul>
                                  </div>
                              )}
                          </>
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
                               const grossProfit = row.contract - (row.actMat + row.actLab); 
                               
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
