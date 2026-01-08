
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket, SupplierStatus, ShoppingItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, Sparkles, AlertTriangle, Trash2, Plus, ShoppingCart, RefreshCw, Calendar, Download, Settings, FileText } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'procurement' | 'entry'>('dashboard');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
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
  const shoppingListInputRef = useRef<HTMLInputElement>(null);

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

  // --- SMART DEFAULT: Switch to All Time if YTD is empty ---
  useEffect(() => {
      const start = robustParseDate(dateRange.start).getTime();
      const end = robustParseDate(dateRange.end).getTime() + (24 * 60 * 60 * 1000);
      const inRange = purchases.some(p => {
          const d = robustParseDate(p.date).getTime();
          return d >= start && d <= end;
      });
      if (!inRange && purchases.length > 0 && dateRange.start.includes(String(currentYear))) {
          setDateRange({ start: '2020-01-01', end: `${currentYear + 1}-12-31` });
      }
  }, [purchases.length]);

  // --- INIT SUPPLIER STATUSES ---
  useEffect(() => {
      const uniqueSuppliers = Array.from(new Set(purchases.map(p => normalizeSupplier(p.supplier))));
      setSupplierStatuses(prev => {
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

      return { purchases: filteredPurchases };
  }, [purchases, dateRange]);

  // --- PROCUREMENT METRICS ---
  const procurementMetrics = useMemo(() => {
      const data = filteredData.purchases;
      const totalSpend = data.reduce((acc, p) => acc + (p.totalCost || 0), 0);
      const uniqueSuppliers = new Set(data.map(p => normalizeSupplier(p.supplier))).size;
      const totalPOs = new Set(data.map(p => p.poNumber)).size; // Approximate count of orders
      const avgOrderValue = totalPOs > 0 ? totalSpend / totalPOs : 0;

      // Spend by Supplier
      const supplierSpendMap: Record<string, number> = {};
      data.forEach(p => {
          const s = normalizeSupplier(p.supplier);
          supplierSpendMap[s] = (supplierSpendMap[s] || 0) + p.totalCost;
      });
      const topSuppliers = Object.entries(supplierSpendMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a,b) => b.value - a.value)
          .slice(0, 10);

      // Spend by Month
      const monthlySpendMap: Record<string, number> = {};
      data.forEach(p => {
          const date = robustParseDate(p.date);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
          monthlySpendMap[key] = (monthlySpendMap[key] || 0) + p.totalCost;
      });
      const monthlyTrend = Object.entries(monthlySpendMap)
          .map(([date, value]) => ({ date, value }))
          .sort((a,b) => a.date.localeCompare(b.date));

      return { totalSpend, uniqueSuppliers, totalPOs, avgOrderValue, topSuppliers, monthlyTrend };
  }, [filteredData]);

  // --- MARKET TRENDS LOGIC ---
  const processedItemsList = useMemo(() => {
      const itemMap = new Map<string, { total: number, count: number }>();
      
      filteredData.purchases.forEach(p => {
          const name = p.itemDescription || 'Unknown';
          if (!itemMap.has(name)) itemMap.set(name, { total: 0, count: 0 });
          const curr = itemMap.get(name)!;
          curr.total += p.totalCost || 0;
          curr.count += 1;
      });

      let items = Array.from(itemMap.entries()).map(([name, data]) => ({
          name,
          total: data.total,
          count: data.count,
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
  }, [filteredData.purchases, searchTerm, sortByValue]);

  // Simple Line Chart Data for "Older Version" feel
  const simpleTrendData = useMemo(() => {
      if (!selectedItem) return [];
      const relevant = purchases.filter(p => p.itemDescription === selectedItem);
      relevant.sort((a,b) => robustParseDate(a.date).getTime() - robustParseDate(b.date).getTime());
      
      return relevant.map(p => ({
          date: robustParseDate(p.date).toLocaleDateString(),
          price: p.unitCost,
          supplier: normalizeSupplier(p.supplier)
      }));
  }, [selectedItem, purchases]);

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

  const handleUploadShoppingList = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = event.target?.result;
              const workbook = XLSX.read(data, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);

              // Expected format: Column 'Item' and 'Quantity'
              const newItems: ShoppingItem[] = [];
              jsonData.forEach((row: any) => {
                  const name = row['Item'] || row['Name'] || row['Description'] || row['Material'];
                  const qty = row['Quantity'] || row['Qty'] || row['Count'] || 1;
                  
                  if (name) {
                      newItems.push({
                          id: Math.random().toString(36).substr(2, 9),
                          name: String(name),
                          quantity: Number(qty) || 1
                      });
                  }
              });

              if (newItems.length > 0) {
                  setShoppingList(prev => [...prev, ...newItems]);
                  showNotification('success', `Added ${newItems.length} items to Shopping List`);
              } else {
                  showNotification('error', "No valid items found. Ensure columns 'Item' and 'Quantity' exist.");
              }
          } catch (err) {
              console.error(err);
              showNotification('error', "Failed to parse file.");
          }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = ''; // Reset input
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Procurement Hub</h1>
          <p className="text-slate-500 mt-1">Track material spend, analyze trends, and optimize purchasing.</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-full">
            <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><LayoutDashboard className="w-4 h-4" /> Dashboard</button>
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp className="w-4 h-4" /> Market Trends</button>
            <button onClick={() => setActiveTab('procurement')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'procurement' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><ShoppingCart className="w-4 h-4" /> Smart Buy</button>
            <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Database className="w-4 h-4" /> Data Entry</button>
        </div>
      </div>

      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-4 shadow-sm w-fit">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="text-sm font-bold text-slate-700 outline-none"
          />
          <span className="text-slate-300">-</span>
          <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="text-sm font-bold text-slate-700 outline-none"
          />
      </div>

      {activeTab === 'dashboard' && (
          <div className="space-y-6">
              {/* Procurement KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Spend</p>
                      <p className="text-2xl font-bold text-slate-900">${procurementMetrics.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Purchase Orders</p>
                      <p className="text-2xl font-bold text-slate-900">{procurementMetrics.totalPOs}</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Avg Order Value</p>
                      <p className="text-2xl font-bold text-slate-900">${procurementMetrics.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Active Suppliers</p>
                      <p className="text-2xl font-bold text-slate-900">{procurementMetrics.uniqueSuppliers}</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Monthly Spend Trend */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
                      <h3 className="font-bold text-slate-800 mb-6">Monthly Spend Trend</h3>
                      <ResponsiveContainer width="100%" height="85%">
                          <AreaChart data={procurementMetrics.monthlyTrend}>
                              <defs>
                                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(val) => `$${val/1000}k`} />
                              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                              <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSpend)" name="Spend" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>

                  {/* Spend by Supplier */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
                      <h3 className="font-bold text-slate-800 mb-6">Top Suppliers by Spend</h3>
                      <ResponsiveContainer width="100%" height="85%">
                          <BarChart data={procurementMetrics.topSuppliers} layout="vertical" margin={{ left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fill: '#64748b'}} />
                              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                              <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* Recent Transactions List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                      <h3 className="font-bold text-slate-800">Recent Transactions</h3>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-white text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                              <tr>
                                  <th className="px-6 py-3">Date</th>
                                  <th className="px-6 py-3">Supplier</th>
                                  <th className="px-6 py-3">Item</th>
                                  <th className="px-6 py-3 text-right">Qty</th>
                                  <th className="px-6 py-3 text-right">Cost</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {filteredData.purchases.slice(0, 10).map((purchase) => (
                                  <tr key={purchase.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-3 text-slate-600">{new Date(purchase.date).toLocaleDateString()}</td>
                                      <td className="px-6 py-3 font-medium text-slate-900">{purchase.supplier}</td>
                                      <td className="px-6 py-3 text-slate-600 truncate max-w-xs">{purchase.itemDescription}</td>
                                      <td className="px-6 py-3 text-right text-slate-600">{purchase.quantity}</td>
                                      <td className="px-6 py-3 text-right font-bold text-slate-800">${purchase.totalCost.toFixed(2)}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'analysis' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
              {/* Item List */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-200">
                      <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                              placeholder="Search item history..." 
                              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                      {processedItemsList.map(item => (
                          <div 
                              key={item.name} 
                              onClick={() => setSelectedItem(item.name)}
                              className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-blue-50 transition flex justify-between items-center ${selectedItem === item.name ? 'bg-blue-50 border-blue-200' : ''}`}
                          >
                              <div className="truncate pr-4 flex-1">
                                  <p className="font-bold text-sm text-slate-800 truncate">{item.name}</p>
                                  <p className="text-xs text-slate-400">{item.count} purchases</p>
                              </div>
                              <div className="text-right">
                                  <p className="font-bold text-xs text-emerald-600">${item.total.toLocaleString()}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Chart Area */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
                  {selectedItem ? (
                      <>
                          <div className="flex justify-between items-start mb-6">
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">{selectedItem}</h3>
                                  <p className="text-sm text-slate-500">Price Trend (Unit Cost)</p>
                              </div>
                          </div>
                          
                          <div className="flex-1 min-h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={simpleTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                      <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} />
                                      <YAxis domain={['auto', 'auto']} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v}`} />
                                      <Tooltip 
                                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                          formatter={(val: number) => [`$${val.toFixed(2)}`, 'Unit Cost']}
                                      />
                                      <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                  </LineChart>
                              </ResponsiveContainer>
                          </div>

                          <div className="mt-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                              <h4 className="font-bold text-sm text-slate-800 mb-2">Purchase History</h4>
                              <div className="flex flex-wrap gap-2">
                                  {simpleTrendData.slice(-5).reverse().map((pt, i) => (
                                      <div key={i} className="bg-white px-3 py-1.5 rounded border border-slate-200 text-xs">
                                          <span className="text-slate-500">{pt.date}:</span> <span className="font-bold text-slate-800">${pt.price.toFixed(2)}</span> <span className="text-slate-400">({pt.supplier})</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </>
                  ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                          <TrendingUp className="w-16 h-16 mb-4 opacity-20" />
                          <p>Select an item to view price trends.</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'procurement' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Shopping List Section */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ShoppingCart className="w-5 h-5"/> Shopping List</h3>
                  
                  {/* File Upload Button */}
                  <div className="mb-4">
                      <button 
                          onClick={() => shoppingListInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 py-3 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                      >
                          <FileSpreadsheet className="w-4 h-4" /> Upload Excel List
                      </button>
                      <input 
                          type="file" 
                          ref={shoppingListInputRef}
                          className="hidden"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleUploadShoppingList}
                      />
                      <p className="text-[10px] text-center text-slate-400 mt-1">Columns needed: Item, Quantity</p>
                  </div>

                  <div className="flex gap-2 mb-4">
                      <input 
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none"
                          placeholder="Or add manually..."
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                      />
                      <input 
                          type="number" 
                          className="w-16 border border-slate-300 rounded-lg px-2 py-2 text-sm outline-none"
                          value={newItemQty}
                          onChange={(e) => setNewItemQty(Number(e.target.value))}
                      />
                      <button onClick={handleAddItemToShoppingList} className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800">
                          <Plus className="w-5 h-5" />
                      </button>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[400px] border-t border-slate-100 pt-2">
                      {shoppingList.map(item => (
                          <div key={item.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 group">
                              <span className="text-sm font-medium text-slate-700">{item.name} <span className="text-slate-400 text-xs">x{item.quantity}</span></span>
                              <button onClick={() => setShoppingList(s => s.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X className="w-4 h-4" /></button>
                          </div>
                      ))}
                      {shoppingList.length === 0 && <p className="text-center text-slate-400 text-xs py-8">List is empty.</p>}
                  </div>
                  
                  {shoppingList.length > 0 && (
                      <button onClick={() => setShoppingList([])} className="mt-4 text-xs text-red-500 font-bold hover:underline self-center">Clear List</button>
                  )}
              </div>

              {/* Optimization Results */}
              <div className="lg:col-span-2 space-y-6">
                  {Object.entries(optimizedProcurement.plan).map(([supplier, rawData]) => {
                      const data = rawData as { items: ShoppingItem[], totalEst: number };
                      return (
                      <div key={supplier} className="bg-white rounded-xl shadow-sm border border-emerald-100 p-6 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                              <Award className="w-24 h-24 text-emerald-600" />
                          </div>
                          <div className="flex justify-between items-start mb-4 relative z-10">
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">{supplier}</h3>
                                  <p className="text-emerald-600 text-sm font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Best Price Option</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-xs text-slate-400 uppercase font-bold">Est. Total</p>
                                  <p className="text-2xl font-bold text-slate-900">${data.totalEst.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                              </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 space-y-2 relative z-10 border border-slate-100">
                              {data.items.map(item => (
                                  <div key={item.id} className="flex justify-between text-sm">
                                      <span>{item.name}</span>
                                      <span className="font-bold text-slate-700">x{item.quantity}</span>
                                  </div>
                              ))}
                          </div>
                          <button className="mt-4 w-full bg-slate-900 text-white py-2 rounded-lg font-bold text-sm hover:bg-slate-800 flex items-center justify-center gap-2">
                              <Download className="w-4 h-4" /> Export PO PDF
                          </button>
                      </div>
                  )})}
                  
                  {optimizedProcurement.unknownItems.length > 0 && (
                      <div className="bg-orange-50 rounded-xl border border-orange-200 p-6">
                          <h3 className="font-bold text-orange-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> No Price History</h3>
                          <p className="text-xs text-orange-700 mb-4">We couldn't find recent prices for these items from your allowed suppliers.</p>
                          <ul className="list-disc list-inside text-sm text-orange-800 space-y-1">
                              {optimizedProcurement.unknownItems.map(i => <li key={i.id}>{i.name}</li>)}
                          </ul>
                      </div>
                  )}
                  
                  {Object.keys(optimizedProcurement.plan).length === 0 && optimizedProcurement.unknownItems.length === 0 && (
                      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center h-full flex flex-col items-center justify-center">
                          <ShoppingCart className="w-12 h-12 text-slate-300 mb-3" />
                          <p className="text-slate-500 font-medium">Add items to generate a smart buying plan.</p>
                          <p className="text-slate-400 text-sm mt-1">We'll find the best suppliers based on your history.</p>
                      </div>
                  )}

                  {/* Supplier Blocking */}
                  <div className="mt-6 pt-6 border-t border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-3 text-xs uppercase">Supplier Management</h4>
                      <div className="flex flex-wrap gap-2">
                          {supplierStatuses.map(s => (
                              <button 
                                  key={s.name}
                                  onClick={() => toggleSupplierBlock(s.name)}
                                  className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1 transition-all ${s.isBlocked ? 'bg-red-50 border-red-200 text-red-600 line-through' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                              >
                                  {s.name}
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
      
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
                                      brand: String(row['Brand'] || 'N/A'),
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
      
      {activeTab !== 'entry' && activeTab !== 'analysis' && activeTab !== 'dashboard' && activeTab !== 'procurement' && <div>Tab Not Found</div>}
    </div>
  );
};
