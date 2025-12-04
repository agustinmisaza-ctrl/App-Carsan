import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, VarianceItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Cell, ReferenceLine } from 'recharts';
import { Search, TrendingUp, TrendingDown, DollarSign, Calendar, ShoppingCart, Filter, ArrowUp, ArrowDown, Award, FileText, Plus, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, Save, ArrowUpDown, RefreshCw, Download, ArrowRight, Bell, Check, AlertTriangle, PieChart, Sparkles, Percent, ListFilter, Flame } from 'lucide-react';
import { extractInvoiceData } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency, normalizeSupplier } from '../utils/purchaseData';
import { connectToQuickBooks, fetchQuickBooksBills } from '../services/quickbooksService';

interface PriceAnalysisProps {
  purchases: PurchaseRecord[];
  setPurchases?: (records: PurchaseRecord[]) => void;
  materials?: MaterialItem[]; 
  setMaterials?: (items: MaterialItem[]) => void;
  projects?: ProjectEstimate[]; 
}

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases, setPurchases, materials, setMaterials, projects = [] }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'variance' | 'entry'>('dashboard');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [sortByValue, setSortByValue] = useState(true); // Default to Pareto sorting
  
  // Date Range Filter
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Sort Config
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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

  // Notification State
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [isQBSyncing, setIsQBSyncing] = useState(false);
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [showMobileSelector, setShowMobileSelector] = useState(false); 

  // Derived Lists
  const uniqueProjects = Array.from(new Set(purchases.map(p => p.projectName))).sort();
  const uniqueTypes = Array.from(new Set(purchases.map(p => p.type))).sort();
  const uniqueSuppliers = Array.from(new Set(purchases.map(p => normalizeSupplier(p.supplier)))).filter((s): s is string => !!s).sort();
  const uniqueItemNames = Array.from(new Set(purchases.map(p => p.itemDescription))).filter((i): i is string => !!i).sort();
  
  // --- PARETO ANALYSIS LOGIC ---
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

  useEffect(() => {
      if (notification) {
          const timer = setTimeout(() => setNotification(null), 5000);
          return () => clearTimeout(timer);
      }
  }, [notification]);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
      setNotification({ type, message });
  };

  const filteredPurchases = useMemo(() => {
      let result = purchases.filter(p => {
          const matchesSearch = p.itemDescription.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                p.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesProject = selectedProject === 'All' || p.projectName === selectedProject;
          const matchesType = selectedType === 'All' || p.type === selectedType;
          
          const recordDate = new Date(p.date);
          const matchesStart = !dateRange.start || recordDate >= new Date(dateRange.start);
          const matchesEnd = !dateRange.end || recordDate <= new Date(dateRange.end);

          return matchesSearch && matchesProject && matchesType && matchesStart && matchesEnd;
      });

      if (sortConfig && activeTab === 'entry') {
          result.sort((a, b) => {
              // @ts-ignore
              let valA = a[sortConfig.key] ?? '';
              // @ts-ignore
              let valB = b[sortConfig.key] ?? '';
              if (typeof valA === 'string') valA = valA.toLowerCase();
              if (typeof valB === 'string') valB = valB.toLowerCase();
              if (sortConfig.key === 'date') {
                  valA = new Date(a.date).getTime();
                  valB = new Date(b.date).getTime();
              }
              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return result;
  }, [purchases, searchTerm, selectedProject, selectedType, dateRange, sortConfig, activeTab]);

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


  // --- VARIANCE ANALYSIS LOGIC (ESTIMATED VS ACTUAL) ---
  const varianceData = useMemo(() => {
      const varianceItems: VarianceItem[] = [];
      const purchasedMap: Record<string, Record<string, { qty: number, cost: number, count: number }>> = {};
      
      purchases.forEach(p => {
          if (!p.projectName || p.projectName === 'Inventory') return;
          if (!purchasedMap[p.projectName]) purchasedMap[p.projectName] = {};
          
          const key = p.itemDescription.trim();
          if (!purchasedMap[p.projectName][key]) {
              purchasedMap[p.projectName][key] = { qty: 0, cost: 0, count: 0 };
          }
          purchasedMap[p.projectName][key].qty += p.quantity;
          purchasedMap[p.projectName][key].cost += p.totalCost;
          purchasedMap[p.projectName][key].count += 1;
      });

      projects.forEach(proj => {
          const projectKey = Object.keys(purchasedMap).find(k => k.toLowerCase().includes(proj.name.toLowerCase()) || proj.name.toLowerCase().includes(k.toLowerCase()));
          const actuals = projectKey ? purchasedMap[projectKey] : {};

          proj.items.forEach(estItem => {
              const actualItemKey = Object.keys(actuals).find(k => k.toLowerCase().includes(estItem.description.toLowerCase()));
              const actualData = actualItemKey ? actuals[actualItemKey] : { qty: 0, cost: 0, count: 0 };

              if (actualItemKey) delete actuals[actualItemKey];

              const estTotal = estItem.quantity * estItem.unitMaterialCost;
              const actTotal = actualData.cost;
              
              let status: 'OK' | 'Over Budget' | 'Over Quantity' | 'Critical' | 'Unplanned' = 'OK';
              if (actTotal > estTotal * 1.1) status = 'Over Budget';
              if (actualData.qty > estItem.quantity * 1.1) status = 'Over Quantity';
              
              varianceItems.push({
                  id: `var-${proj.id}-${estItem.id}`,
                  projectName: proj.name,
                  itemName: estItem.description,
                  estimatedQty: estItem.quantity,
                  estimatedUnitCost: estItem.unitMaterialCost,
                  purchasedQty: actualData.qty,
                  avgPurchasedCost: actualData.qty > 0 ? actualData.cost / actualData.qty : 0,
                  totalEstimated: estTotal,
                  totalPurchased: actTotal,
                  costVariance: actTotal - estTotal,
                  qtyVariance: actualData.qty - estItem.quantity,
                  status: status
              });
          });

          Object.keys(actuals).forEach(key => {
              const data = actuals[key];
              varianceItems.push({
                  id: `unplanned-${proj.id}-${key}`,
                  projectName: proj.name,
                  itemName: key + " (Unplanned)",
                  estimatedQty: 0,
                  estimatedUnitCost: 0,
                  purchasedQty: data.qty,
                  avgPurchasedCost: data.qty > 0 ? data.cost / data.qty : 0,
                  totalEstimated: 0,
                  totalPurchased: data.cost,
                  costVariance: data.cost,
                  qtyVariance: data.qty,
                  status: 'Unplanned'
              });
          });
      });
      return varianceItems;
  }, [purchases, projects]);

  // Upload & Sync Handlers
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
                  showNotification('success', `AI identified ${records.length} items. Please review.`);
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

  const confirmScannedRecords = () => {
      if (setPurchases) {
          setPurchases([...purchases, ...scannedRecords]);
          setScannedRecords([]);
          showNotification('success', "Invoice items added to database.");
      }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = event.target?.result;
              const workbook = XLSX.read(data, { type: 'array' });
              const worksheet = workbook.Sheets[workbook.SheetNames[0]];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);

              if (Array.isArray(jsonData) && setPurchases) {
                  const newRecords: PurchaseRecord[] = jsonData.map((row: any, idx) => {
                      return {
                        id: `bulk-${Date.now()}-${idx}`,
                        date: row['Date'] ? new Date(row['Date']).toISOString() : new Date().toISOString(),
                        poNumber: String(row['Purchase Order #'] || row['PO'] || ''),
                        brand: String(row['Brand'] || ''),
                        itemDescription: String(row['Item'] || row['Description'] || ''),
                        quantity: Number(row['Quantity'] || 0),
                        unitCost: parseCurrency(String(row['Unit Cost'] || row['Cost'] || 0)),
                        totalCost: parseCurrency(String(row['Total'] || 0)),
                        supplier: normalizeSupplier(String(row['Supplier'] || '')),
                        projectName: String(row['Project'] || ''),
                        type: String(row['TYPE'] || 'Material'),
                        source: 'Bulk Import'
                      }
                  }).filter(r => r.itemDescription); 

                  setPurchases([...purchases, ...newRecords]);
                  showNotification('success', `Successfully imported ${newRecords.length} records.`);
              }
          } catch (err) {
              showNotification('error', "Failed to process Excel file.");
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleSyncToDatabase = () => {
      if (!setMaterials || !materials) return;
      const updates = new Map<string, { cost: number }>();
      purchases.forEach(p => {
          if (p.unitCost > 0) updates.set(p.itemDescription.trim(), { cost: p.unitCost });
      });
      let updatedCount = 0;
      let addedCount = 0;
      const newMaterials = [...materials];

      updates.forEach((val, name) => {
          const existingIdx = newMaterials.findIndex(m => m.name.toLowerCase() === name.toLowerCase());
          if (existingIdx >= 0) {
              if (newMaterials[existingIdx].materialCost !== val.cost) {
                  newMaterials[existingIdx] = { ...newMaterials[existingIdx], materialCost: val.cost };
                  updatedCount++;
              }
          } else {
              newMaterials.push({ id: `gen-${Date.now()}-${Math.random()}`, name, category: 'Uncategorized', unit: 'EA', materialCost: val.cost, laborHours: 0 });
              addedCount++;
          }
      });
      setMaterials(newMaterials);
      showNotification('success', `Sync Complete: Updated ${updatedCount}, Added ${addedCount}.`);
  };

  const handleDownloadTemplate = () => {
      const template = [{ "Date": "2024-01-01", "Purchase Order #": "PO-1001", "Brand": "Square D", "Item": "20A Breaker", "Quantity": 10, "Unit Cost": "$15.00", "TAX": "0", "Total": "$150.00", "Supplier": "World Electric", "Project": "Brickell Condo", "TYPE": "Material" }];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase History");
      XLSX.writeFile(workbook, "Carsan_Purchase_History_Template.xlsx");
  };

  const handleConnectQuickBooks = async () => {
      try {
          setIsQBSyncing(true);
          const url = await connectToQuickBooks();
          if (url.startsWith('http')) { window.location.href = url; } 
          else {
              const bills = await fetchQuickBooksBills();
              if (setPurchases) {
                  setPurchases([...purchases, ...bills]);
                  showNotification('success', `Synced ${bills.length} bills from QuickBooks.`);
              }
          }
      } catch (err) { showNotification('error', "QuickBooks Connection Failed."); } 
      finally { setIsQBSyncing(false); }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {notification && (
          <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 ${
              notification.type === 'success' ? 'bg-emerald-600 text-white' : notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
          }`}>
              {notification.type === 'success' && <CheckCircle className="w-4 h-4" />}
              <span className="font-medium text-sm">{notification.message}</span>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Price Analysis</h1>
          <p className="text-slate-500 mt-1">Track trends, suppliers, and budget variances.</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex">
            <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button onClick={() => setActiveTab('variance')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'variance' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <PieChart className="w-4 h-4" /> Variance
            </button>
            <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <Database className="w-4 h-4" /> Data Entry
            </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
          <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2 text-slate-500 text-sm font-bold uppercase mr-2"><Filter className="w-4 h-4" /> Filters:</div>
                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Item or PO..." className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-48" />
                  </div>
                  <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                      <option value="All">All Projects</option>
                      {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase">Total Spend</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">${filteredPurchases.reduce((sum, p) => sum + p.totalCost, 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase">Suppliers</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{new Set(filteredPurchases.map(p => normalizeSupplier(p.supplier))).size}</p>
                  </div>
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
                                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Price History: {selectedItem}</h3>
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
                          </>
                      ) : (
                          <div className="h-full flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400"><p>Select an item to view analysis.</p></div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'variance' && (
          <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-red-100 text-red-600 rounded-full"><AlertTriangle className="w-6 h-6" /></div>
                      <div>
                          <p className="text-xs font-bold text-slate-500 uppercase">Over Budget Items</p>
                          <p className="text-2xl font-bold text-red-600">{varianceData.filter(v => v.status === 'Over Budget').length}</p>
                      </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-orange-100 text-orange-600 rounded-full"><AlertTriangle className="w-6 h-6" /></div>
                      <div>
                          <p className="text-xs font-bold text-slate-500 uppercase">Unplanned Purchases</p>
                          <p className="text-2xl font-bold text-orange-600">{varianceData.filter(v => v.status === 'Unplanned').length}</p>
                      </div>
                  </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
                              <tr>
                                  <th className="px-6 py-4">Status</th>
                                  <th className="px-6 py-4">Project</th>
                                  <th className="px-6 py-4">Item</th>
                                  <th className="px-6 py-4 text-right">Est. Qty</th>
                                  <th className="px-6 py-4 text-right">Act. Qty</th>
                                  <th className="px-6 py-4 text-right">Est. Cost</th>
                                  <th className="px-6 py-4 text-right">Act. Cost</th>
                                  <th className="px-6 py-4 text-right">Variance</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {varianceData.map(item => (
                                  <tr key={item.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-3">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : item.status === 'Over Budget' ? 'bg-red-100 text-red-700' : item.status === 'Unplanned' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{item.status}</span>
                                      </td>
                                      <td className="px-6 py-3 font-medium text-slate-900">{item.projectName}</td>
                                      <td className="px-6 py-3 text-slate-600">{item.itemName}</td>
                                      <td className="px-6 py-3 text-right text-slate-500">{item.estimatedQty}</td>
                                      <td className="px-6 py-3 text-right font-bold">{item.purchasedQty}</td>
                                      <td className="px-6 py-3 text-right tabular-nums">${item.totalEstimated.toFixed(2)}</td>
                                      <td className="px-6 py-3 text-right tabular-nums font-bold">${item.totalPurchased.toFixed(2)}</td>
                                      <td className={`px-6 py-3 text-right tabular-nums font-bold ${item.costVariance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{item.costVariance > 0 ? '+' : ''}${item.costVariance.toFixed(2)}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'entry' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Sparkles className="w-5 h-5" /></div>
                          <h3 className="font-bold text-slate-800">AI Invoice Extractor</h3>
                      </div>
                      <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isExtracting ? 'bg-blue-50 border-blue-300' : 'border-slate-300 hover:border-blue-500'}`} onClick={() => !isExtracting && fileInputRef.current?.click()}>
                          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleInvoiceUpload} />
                          {isExtracting ? <div className="flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" /><span className="text-sm font-bold text-blue-700">Analyzing {uploadFileName}...</span></div> : <div className="flex flex-col items-center text-slate-400"><Upload className="w-8 h-8 mb-2" /><span className="text-sm font-medium">Click to Upload Invoice</span></div>}
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <div className="flex items-center gap-2 mb-4">
                          <div className="p-2 bg-green-100 text-green-600 rounded-lg"><FileSpreadsheet className="w-5 h-5" /></div>
                          <h3 className="font-bold text-slate-800">Bulk Import</h3>
                      </div>
                      <button onClick={() => bulkInputRef.current?.click()} className="w-full border border-slate-300 text-slate-700 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 mb-2">Select File</button>
                      <input type="file" ref={bulkInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} />
                      <div className="flex gap-2">
                          <button onClick={handleDownloadTemplate} className="flex-1 text-xs text-blue-600 hover:underline">Download Template</button>
                      </div>
                  </div>
              </div>
              <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4">Manual Entry</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <input type="date" className="border border-slate-300 rounded-lg p-2 text-sm" value={manualEntry.date} onChange={e => setManualEntry({...manualEntry, date: e.target.value})} />
                          <div className="relative">
                              <input placeholder="Supplier" className="w-full border border-slate-300 rounded-lg p-2 text-sm" value={manualEntry.supplier} onChange={e => {setManualEntry({...manualEntry, supplier: e.target.value}); setShowSupplierSuggestions(true);}} onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 200)} />
                              {showSupplierSuggestions && <div className="absolute z-10 w-full bg-white border border-slate-200 shadow-lg rounded-lg mt-1 max-h-40 overflow-y-auto">{uniqueSuppliers.filter(s => s.toLowerCase().includes(manualEntry.supplier?.toLowerCase() || '')).map(s => <div key={s} className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm" onClick={() => setManualEntry({...manualEntry, supplier: s})}>{s}</div>)}</div>}
                          </div>
                          <div className="relative col-span-2">
                              <input placeholder="Item Description" className="w-full border border-slate-300 rounded-lg p-2 text-sm" value={manualEntry.itemDescription} onChange={e => {setManualEntry({...manualEntry, itemDescription: e.target.value}); setShowItemSuggestions(true);}} onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)} />
                              {showItemSuggestions && <div className="absolute z-10 w-full bg-white border border-slate-200 shadow-lg rounded-lg mt-1 max-h-40 overflow-y-auto">{uniqueItemNames.filter(i => i.toLowerCase().includes(manualEntry.itemDescription?.toLowerCase() || '')).map(i => <div key={i} className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm" onClick={() => setManualEntry({...manualEntry, itemDescription: i})}>{i}</div>)}</div>}
                          </div>
                          <input type="number" placeholder="Qty" className="border border-slate-300 rounded-lg p-2 text-sm" value={manualEntry.quantity} onChange={e => setManualEntry({...manualEntry, quantity: Number(e.target.value)})} />
                          <input type="number" placeholder="Unit Cost" className="border border-slate-300 rounded-lg p-2 text-sm" value={manualEntry.unitCost} onChange={e => setManualEntry({...manualEntry, unitCost: Number(e.target.value)})} />
                          <input placeholder="Project (Optional)" className="border border-slate-300 rounded-lg p-2 text-sm col-span-2" value={manualEntry.projectName} onChange={e => setManualEntry({...manualEntry, projectName: e.target.value})} />
                      </div>
                      <button onClick={() => { if(manualEntry.itemDescription && setPurchases) { setPurchases([{...manualEntry, id: Date.now().toString(), totalCost: (manualEntry.quantity || 0) * (manualEntry.unitCost || 0)} as PurchaseRecord, ...purchases]); setManualEntry({ ...manualEntry, itemDescription: '', unitCost: 0, quantity: 1 }); showNotification('success', "Record added manually."); } }} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-slate-800">Add Record</button>
                  </div>
                  {scannedRecords.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 animate-in fade-in">
                          <div className="flex justify-between items-center mb-3">
                              <h3 className="font-bold text-blue-800">Review AI Scanned Items</h3>
                              <div className="flex gap-2"><button onClick={() => setScannedRecords([])} className="text-xs font-bold text-red-500 hover:underline">Discard</button><button onClick={confirmScannedRecords} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700">Confirm & Add All</button></div>
                          </div>
                          <div className="bg-white rounded-lg overflow-hidden border border-blue-100 max-h-60 overflow-y-auto">
                              <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Cost</th></tr></thead>
                                  <tbody>{scannedRecords.map((r, i) => <tr key={i} className="border-t border-slate-50"><td className="p-2">{r.itemDescription}</td><td className="p-2 text-right">{r.quantity}</td><td className="p-2 text-right">${r.unitCost}</td></tr>)}</tbody>
                              </table>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};