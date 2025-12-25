
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket, SupplierStatus, ShoppingItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, ReferenceLine, Scatter, AreaChart, Area } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, PieChart, Sparkles, ListFilter, Flame, AlertTriangle, Trash2, Plus, Save, Briefcase, Wallet, RefreshCw, Calendar, Info, Download, ShoppingCart, Ban, ShieldAlert, ArrowRight, Settings } from 'lucide-react';
import { extractInvoiceData } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency, normalizeSupplier, robustParseDate } from '../utils/purchaseData';
import { MIAMI_STANDARD_PRICES } from '../utils/miamiStandards';
import { fetchQuickBooksBills, getZapierWebhookUrl, setZapierWebhookUrl } from '../services/quickbooksService';

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

  // QB Integration State
  const [showQbSettings, setShowQbSettings] = useState(false);
  const [qbUrl, setQbUrl] = useState('');
  const [isSyncingQb, setIsSyncingQb] = useState(false);

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

  // --- QB Handlers ---
  const handleOpenQbSettings = () => {
      setQbUrl(getZapierWebhookUrl());
      setShowQbSettings(true);
  };

  const handleSaveQbSettings = () => {
      setZapierWebhookUrl(qbUrl);
      setShowQbSettings(false);
      showNotification('success', 'Webhook URL Saved');
  };

  const handleSyncQb = async () => {
      setIsSyncingQb(true);
      try {
          const bills = await fetchQuickBooksBills();
          if (bills.length > 0 && setPurchases) {
              setPurchases(prev => [...prev, ...bills]);
              showNotification('success', `Synced ${bills.length} bills from QuickBooks/Zapier.`);
          } else {
              showNotification('error', "No bills found or Zapier returned empty list.");
          }
      } catch (e: any) {
          showNotification('error', e.message);
      } finally {
          setIsSyncingQb(false);
      }
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

      {/* MODAL FOR QB SETTINGS */}
      {showQbSettings && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-slate-800">QuickBooks Integration</h3>
                      <button onClick={() => setShowQbSettings(false)}><X className="w-5 h-5 text-slate-400" /></button>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">
                      Connect to Zapier to sync Bills. Create a Zap with a "Catch Hook" trigger and paste the URL here.
                  </p>
                  <div className="mb-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Zapier Webhook URL</label>
                      <input 
                          value={qbUrl} 
                          onChange={(e) => setQbUrl(e.target.value)} 
                          placeholder="https://hooks.zapier.com/hooks/catch/..."
                          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                  </div>
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setShowQbSettings(false)} className="px-4 py-2 text-slate-500 font-bold text-sm">Cancel</button>
                      <button onClick={handleSaveQbSettings} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-emerald-700">Save Config</button>
                  </div>
              </div>
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

      {/* ... (Existing Date Filter and Overview/Analysis Tabs code remains unchanged) ... */}
      
      {/* (Adding QB Button to Entry Tab) */}
      {activeTab === 'entry' && (
          <div className="space-y-6">
              {/* QuickBooks Integration Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                      <div className="bg-white p-2 rounded-lg shadow-sm">
                          {/* QB Logo / Placeholder */}
                          <span className="text-xl font-bold text-emerald-600">qb</span>
                      </div>
                      <div>
                          <h3 className="font-bold text-emerald-900">QuickBooks Online Integration</h3>
                          <p className="text-xs text-emerald-700">Sync bills and expenses automatically via Zapier.</p>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button 
                          onClick={handleOpenQbSettings}
                          className="bg-white border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 flex items-center gap-2"
                      >
                          <Settings className="w-4 h-4" /> Config
                      </button>
                      <button 
                          onClick={handleSyncQb}
                          disabled={isSyncingQb}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2 disabled:opacity-70"
                      >
                          {isSyncingQb ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Sync Bills
                      </button>
                  </div>
              </div>

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
      
      {activeTab !== 'entry' && activeTab !== 'analysis' && activeTab !== 'overview' && activeTab !== 'job-costing' && activeTab !== 'procurement' && <div>Tab Not Found</div>}
    </div>
  );
};
