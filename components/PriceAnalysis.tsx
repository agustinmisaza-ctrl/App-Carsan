import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Cell } from 'recharts';
import { Search, TrendingUp, TrendingDown, DollarSign, Calendar, ShoppingCart, Filter, ArrowUp, ArrowDown, Award, FileText, Plus, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, Save, ArrowUpDown, RefreshCw, Download, ArrowRight, Bell, Check } from 'lucide-react';
import { extractInvoiceData } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency } from '../utils/purchaseData';
import { connectToQuickBooks, fetchQuickBooksBills } from '../services/quickbooksService';

interface PriceAnalysisProps {
  purchases: PurchaseRecord[];
  setPurchases?: (records: PurchaseRecord[]) => void;
  materials?: MaterialItem[]; // Added for Sync
  setMaterials?: (items: MaterialItem[]) => void; // Added for Sync
}

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases, setPurchases, materials, setMaterials }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entry'>('dashboard');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  
  // Date Range Filter
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Sort Config
  const [sortConfig, setSortConfig] = useState<{ key: keyof PurchaseRecord; direction: 'asc' | 'desc' } | null>(null);

  // Data Entry State
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [scannedRecords, setScannedRecords] = useState<PurchaseRecord[]>([]); // New state for review modal
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

  // QuickBooks State
  const [isQBSyncing, setIsQBSyncing] = useState(false);

  // Autocomplete State
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);

  // Derived Lists
  const uniqueProjects = Array.from(new Set(purchases.map(p => p.projectName))).sort();
  const uniqueTypes = Array.from(new Set(purchases.map(p => p.type))).sort();
  
  // Lists for Auto-Complete Suggestions
  const uniqueSuppliers = Array.from(new Set(purchases.map(p => p.supplier))).filter((s): s is string => !!s).sort();
  const uniqueItemNames = Array.from(new Set(purchases.map(p => p.itemDescription))).filter((i): i is string => !!i).sort();
  
  // Clear notification after 5 seconds
  useEffect(() => {
      if (notification) {
          const timer = setTimeout(() => setNotification(null), 5000);
          return () => clearTimeout(timer);
      }
  }, [notification]);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
      setNotification({ type, message });
  };

  // Filter purchases based on search/project/type/date
  const filteredPurchases = useMemo(() => {
      let result = purchases.filter(p => {
          const matchesSearch = p.itemDescription.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                p.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesProject = selectedProject === 'All' || p.projectName === selectedProject;
          const matchesType = selectedType === 'All' || p.type === selectedType;
          
          // Date Range Logic
          const recordDate = new Date(p.date);
          const matchesStart = !dateRange.start || recordDate >= new Date(dateRange.start);
          const matchesEnd = !dateRange.end || recordDate <= new Date(dateRange.end);

          return matchesSearch && matchesProject && matchesType && matchesStart && matchesEnd;
      });

      // Sorting Logic
      if (sortConfig) {
          result.sort((a, b) => {
              let valA = a[sortConfig.key];
              let valB = b[sortConfig.key];

              // Handle string case insensitivity
              if (typeof valA === 'string') valA = valA.toLowerCase();
              if (typeof valB === 'string') valB = valB.toLowerCase();

              // Handle dates
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
  }, [purchases, searchTerm, selectedProject, selectedType, dateRange, sortConfig]);

  // Get unique items for selection (sorted by most frequent)
  const itemFrequency = useMemo(() => {
      const freq: Record<string, number> = {};
      filteredPurchases.forEach(p => {
          freq[p.itemDescription] = (freq[p.itemDescription] || 0) + 1;
      });
      return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [filteredPurchases]);

  // Set default selected item if none
  if (!selectedItem && itemFrequency.length > 0) {
      setSelectedItem(itemFrequency[0][0]);
  }

  // --- ACTIONS ---

  const handleDownloadTemplate = () => {
      const templateData = [
          {
              "Date": "2024-01-25",
              "Supplier": "World Electric",
              "Item": "1/2 EMT Pipe Conduit",
              "Quantity": 100,
              "Unit Cost": 0.45,
              "Project": "Example Project",
              "PO": "1001"
          }
      ];
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Template");
      XLSX.writeFile(workbook, "Carsan_PriceAnalysis_Import_Template.xlsx");
      showNotification('success', 'Template downloaded successfully.');
  };

  const handleSyncToDatabase = () => {
      if (!materials || !setMaterials) {
          showNotification('error', "Material Database connection error.");
          return;
      }

      if (purchases.length === 0) {
          showNotification('error', "No purchase history found. Please upload data first.");
          return;
      }

      if (!confirm("This will update your main Price Database with the most recent costs found in your Purchase History. New items will be added. Continue?")) return;

      // 1. Group purchases by Item Name to find the most recent entry
      const itemGroups: Record<string, PurchaseRecord> = {};
      purchases.forEach(p => {
          const existing = itemGroups[p.itemDescription];
          // Logic: Keep the one with the later date
          if (!existing || new Date(p.date) > new Date(existing.date)) {
              itemGroups[p.itemDescription] = p;
          }
      });

      let updatedCount = 0;
      let addedCount = 0;
      
      // Clone materials
      const updatedMaterials = [...materials];

      // 2. Iterate and Update/Add
      Object.values(itemGroups).forEach(latestPurchase => {
          // Skip if cost is 0 or weird
          if (!latestPurchase.unitCost || latestPurchase.unitCost <= 0) return;

          // Fuzzy find in existing materials
          const index = updatedMaterials.findIndex(m => m.name.toLowerCase() === latestPurchase.itemDescription.toLowerCase());

          if (index >= 0) {
              // Update existing
              const oldCost = updatedMaterials[index].materialCost;
              if (oldCost !== latestPurchase.unitCost) {
                  updatedMaterials[index] = {
                      ...updatedMaterials[index],
                      materialCost: latestPurchase.unitCost
                  };
                  updatedCount++;
              }
          } else {
              // Add new
              updatedMaterials.push({
                  id: `imp-${Date.now()}-${Math.random()}`,
                  name: latestPurchase.itemDescription,
                  category: 'General', // Default
                  unit: 'EA', // Default, ideally extracted
                  materialCost: latestPurchase.unitCost,
                  laborHours: 0 // Manual entry required later
              });
              addedCount++;
          }
      });

      setMaterials(updatedMaterials);
      showNotification('success', `Sync Complete! Updated Prices: ${updatedCount}, New Items: ${addedCount}`);
  };

  const handleSort = (key: keyof PurchaseRecord) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!setPurchases) {
          showNotification('error', "Database update function missing.");
          return;
      }

      setUploadFileName(file.name);
      setIsExtracting(true);
      showNotification('info', `Analyzing invoice: ${file.name}...`);

      const reader = new FileReader();
      reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          try {
              const newRecords = await extractInvoiceData(base64);
              console.log("Records extracted:", newRecords);
              if (newRecords.length > 0) {
                  setScannedRecords(newRecords);
                  showNotification('success', `Analysis complete! Found ${newRecords.length} items.`);
              } else {
                  showNotification('error', "AI extracted 0 records. Please check the invoice image quality.");
              }
          } catch (err) {
              console.error("Extraction error:", err);
              showNotification('error', "Failed to extract data from invoice. Please ensure the PDF/Image is clear.");
          } finally {
              setIsExtracting(false);
              setUploadFileName(null);
              if (fileInputRef.current) {
                  fileInputRef.current.value = ''; // Reset input to allow re-uploading same file
              }
          }
      };
      reader.readAsDataURL(file);
  };

  const confirmScannedRecords = () => {
      if (setPurchases) {
          setPurchases([...scannedRecords, ...purchases]);
          setScannedRecords([]);
          showNotification('success', `Successfully added ${scannedRecords.length} records to database!`);
      }
  };

  const handleManualSubmit = () => {
      if (!manualEntry.itemDescription || !manualEntry.unitCost || !setPurchases) return;
      
      const newRecord: PurchaseRecord = {
          id: Date.now().toString(),
          date: new Date(manualEntry.date || '').toISOString(),
          poNumber: manualEntry.poNumber || 'MANUAL',
          brand: 'N/A',
          itemDescription: manualEntry.itemDescription,
          quantity: Number(manualEntry.quantity),
          unitCost: Number(manualEntry.unitCost),
          totalCost: Number(manualEntry.quantity) * Number(manualEntry.unitCost),
          supplier: manualEntry.supplier || 'Unknown',
          projectName: manualEntry.projectName || 'Inventory',
          type: 'Material',
          source: 'Manual'
      };

      setPurchases([newRecord, ...purchases]);
      setManualEntry({ ...manualEntry, itemDescription: '', unitCost: 0, quantity: 1 });
      showNotification('success', "Record added manually.");
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !setPurchases) return;

      showNotification('info', `Processing bulk file: ${file.name}...`);

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = event.target?.result;
              const workbook = XLSX.read(data, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);

              if (Array.isArray(jsonData)) {
                  const newRecords: PurchaseRecord[] = jsonData.map((row: any, index: number) => {
                      // Helper to find value case-insensitive
                      const findVal = (keys: string[]) => {
                          const rowKeys = Object.keys(row);
                          for (const key of keys) {
                              if (row[key] !== undefined) return row[key];
                              const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                              if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                          }
                          return undefined;
                      };

                      // Map Data
                      const dateVal = findVal(['Date', 'Invoice Date']);
                      const supplier = findVal(['Supplier', 'Vendor']) || 'Unknown';
                      const itemDesc = findVal(['Item', 'Description', 'Item Description', 'Material']) || 'Imported Item';
                      const qty = Number(findVal(['Quantity', 'Qty'])) || 1;
                      const cost = Number(findVal(['Unit Cost', 'Cost', 'Price', 'Rate'])) || 0;
                      const total = Number(findVal(['Total', 'Total Cost', 'Amount'])) || (qty * cost);
                      const project = findVal(['Project', 'Job', 'Project Name']) || 'Inventory';
                      const po = findVal(['PO', 'PO #', 'Purchase Order', 'Invoice #']) || 'N/A';

                      return {
                          id: `bulk-${Date.now()}-${index}`,
                          date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
                          poNumber: po,
                          brand: 'N/A',
                          itemDescription: itemDesc,
                          quantity: qty,
                          unitCost: cost,
                          totalCost: total,
                          supplier: supplier,
                          projectName: project,
                          type: 'Material',
                          source: 'Bulk Import'
                      };
                  });

                  setPurchases([...newRecords, ...purchases]);
                  showNotification('success', `Successfully imported ${newRecords.length} records.`);
              }
          } catch (err) {
              console.error("Bulk upload error:", err);
              showNotification('error', "Failed to process file. Ensure it is a valid Excel or CSV file.");
          } finally {
              if (bulkInputRef.current) bulkInputRef.current.value = '';
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleConnectQuickBooks = async () => {
      try {
          const url = await connectToQuickBooks();
          // In a real app, you'd redirect. For simulation, we just proceed.
          if (url.includes('status=success')) {
              handleSyncQuickBooks();
          } else {
              window.location.href = url;
          }
      } catch (e) {
          showNotification('error', "Connection failed. See console.");
      }
  };

  const handleSyncQuickBooks = async () => {
      if (!setPurchases) return;
      setIsQBSyncing(true);
      try {
          const bills = await fetchQuickBooksBills();
          setPurchases([...bills, ...purchases]);
          showNotification('success', `Synced ${bills.length} records from QuickBooks!`);
      } catch (e) {
          showNotification('error', "Sync failed.");
      } finally {
          setIsQBSyncing(false);
      }
  };

  // --- ANALYTICS LOGIC ---

  // 1. Price History Data for Chart
  const priceHistoryData = useMemo(() => {
      if (!selectedItem) return [];
      return purchases
          .filter(p => p.itemDescription === selectedItem)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(p => ({
              date: new Date(p.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: '2-digit'}),
              fullDate: p.date,
              price: p.unitCost,
              supplier: p.supplier,
              project: p.projectName,
              qty: p.quantity
          }));
  }, [purchases, selectedItem]);

  // 2. Supplier Comparison Data
  const supplierComparisonData = useMemo(() => {
      if (!selectedItem) return [];
      const items = purchases.filter(p => p.itemDescription === selectedItem);
      const supplierStats: Record<string, { totalCost: number, count: number, min: number, max: number }> = {};

      items.forEach(p => {
          if (!supplierStats[p.supplier]) {
              supplierStats[p.supplier] = { totalCost: 0, count: 0, min: 999999, max: 0 };
          }
          supplierStats[p.supplier].totalCost += p.unitCost;
          supplierStats[p.supplier].count += 1;
          supplierStats[p.supplier].min = Math.min(supplierStats[p.supplier].min, p.unitCost);
          supplierStats[p.supplier].max = Math.max(supplierStats[p.supplier].max, p.unitCost);
      });

      return Object.entries(supplierStats).map(([name, stats]) => ({
          name,
          avgPrice: stats.totalCost / stats.count,
          minPrice: stats.min,
          maxPrice: stats.max,
          count: stats.count
      })).sort((a, b) => a.avgPrice - b.avgPrice);
  }, [purchases, selectedItem]);

  // 3. Stats
  const stats = useMemo(() => {
      const totalSpend = filteredPurchases.reduce((acc, p) => acc + p.totalCost, 0);
      const avgTicket = totalSpend / filteredPurchases.length || 0;
      const uniqueSuppliers = new Set(filteredPurchases.map(p => p.supplier)).size;
      return { totalSpend, avgTicket, uniqueSuppliers };
  }, [filteredPurchases]);

  // 4. Best Buy Recommendation
  const bestBuy = supplierComparisonData.length > 0 ? supplierComparisonData[0] : null;

  const renderSortIcon = (key: keyof PurchaseRecord) => {
      if (sortConfig?.key !== key) return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  const SortableHeader = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey: keyof PurchaseRecord, align?: 'left' | 'center' | 'right', className?: string }) => (
      <th 
          className={`px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group select-none whitespace-nowrap ${className}`}
          onClick={() => handleSort(sortKey)}
      >
          <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
              {label}
              {renderSortIcon(sortKey)}
          </div>
      </th>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col relative">
        
        {/* NOTIFICATION BANNER */}
        {notification && (
            <div className={`absolute top-2 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5 ${
                notification.type === 'success' ? 'bg-emerald-600 text-white' : 
                notification.type === 'error' ? 'bg-red-600 text-white' : 
                'bg-blue-600 text-white'
            }`}>
                {notification.type === 'success' && <Check className="w-5 h-5" />}
                {notification.type === 'error' && <X className="w-5 h-5" />}
                {notification.type === 'info' && <Loader2 className="w-5 h-5 animate-spin" />}
                <span className="font-medium text-sm">{notification.message}</span>
                <button onClick={() => setNotification(null)} className="ml-2 p-1 hover:bg-white/20 rounded-full">
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    Price Analysis
                    <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Procurement Intelligence</span>
                </h1>
                <p className="text-slate-500 mt-1">Analyze purchasing trends, compare supplier rates, and optimize spending.</p>
            </div>
            
            {/* Navigation Tabs */}
            <div className="bg-slate-100 p-1 rounded-lg flex">
                <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <LayoutDashboard className="w-4 h-4" /> Analysis
                </button>
                <button 
                    onClick={() => setActiveTab('entry')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Database className="w-4 h-4" /> Data Entry
                </button>
            </div>
        </div>

        {/* REVIEW MODAL FOR AI SCAN */}
        {scannedRecords.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
                    <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">Review Scanned Invoice</h3>
                                <p className="text-xs text-slate-500">Found {scannedRecords.length} items. Please verify before saving.</p>
                            </div>
                        </div>
                        <button onClick={() => setScannedRecords([])} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-0">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Supplier</th>
                                    <th className="px-4 py-3">Item</th>
                                    <th className="px-4 py-3 text-right">Qty</th>
                                    <th className="px-4 py-3 text-right">Unit Cost</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {scannedRecords.map((rec, idx) => (
                                    <tr key={idx} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(rec.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800">{rec.supplier}</td>
                                        <td className="px-4 py-3 text-slate-700">{rec.itemDescription}</td>
                                        <td className="px-4 py-3 text-right">{rec.quantity}</td>
                                        <td className="px-4 py-3 text-right font-medium">${rec.unitCost.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">${rec.totalCost.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                        <button onClick={() => setScannedRecords([])} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition">
                            Discard
                        </button>
                        <button onClick={confirmScannedRecords} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-2 transition">
                            <CheckCircle className="w-4 h-4" /> Confirm & Add to Database
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && (
            <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Spend (View)</p>
                        <p className="text-xl font-bold text-slate-900 tabular-nums">${stats.totalSpend.toLocaleString()}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Active Vendors</p>
                        <p className="text-xl font-bold text-slate-900">{stats.uniqueSuppliers}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Records</p>
                        <p className="text-xl font-bold text-slate-900">{filteredPurchases.length}</p>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input 
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" 
                                placeholder="Search materials (e.g. 1/2 EMT)..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                            <select 
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 outline-none focus:border-blue-500"
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                            >
                                <option value="All">All Projects</option>
                                {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <select 
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 outline-none focus:border-blue-500"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                            >
                                <option value="All">All Types</option>
                                {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    {/* Date Range Filters */}
                    <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="font-bold uppercase text-xs text-slate-400 flex items-center gap-1"><Filter className="w-3 h-3" /> Date Range:</span>
                        <div className="flex items-center gap-2">
                            <input 
                                type="date" 
                                className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            />
                            <span className="text-slate-400">-</span>
                            <input 
                                type="date" 
                                className="border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            />
                        </div>
                        {(dateRange.start || dateRange.end) && (
                            <button onClick={() => setDateRange({start: '', end: ''})} className="text-xs text-blue-600 hover:underline ml-auto">Clear Dates</button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                    {/* LEFT COLUMN: Item Selection & Details */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden lg:h-[calc(100vh-350px)]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <h3 className="font-bold text-slate-800 text-sm uppercase flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4" /> Purchased Items
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {itemFrequency.map(([itemName, count]) => (
                                <button
                                    key={itemName}
                                    onClick={() => setSelectedItem(itemName)}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors flex justify-between items-center ${
                                        selectedItem === itemName ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                                    }`}
                                >
                                    <span className="truncate mr-2" title={itemName}>{itemName}</span>
                                    <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-400">{count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* CENTER/RIGHT COLUMN: Visuals */}
                    <div className="lg:col-span-2 space-y-6 overflow-y-auto custom-scrollbar lg:h-[calc(100vh-350px)]">
                        
                        {/* Price Trend Chart */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">{selectedItem}</h3>
                                    <p className="text-sm text-slate-500">Unit Cost History</p>
                                </div>
                                {bestBuy && (
                                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-lg flex items-center gap-3">
                                        <div className="p-1.5 bg-emerald-100 rounded-full">
                                            <Award className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Best Supplier</p>
                                            <p className="font-bold text-sm">{bestBuy.name} <span className="font-normal">@</span> ${bestBuy.avgPrice.toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={priceHistoryData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="date" tick={{fontSize: 12}} />
                                        <YAxis tickFormatter={(val) => `$${val}`} tick={{fontSize: 12}} />
                                        <Tooltip 
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg text-xs">
                                                            <p className="font-bold text-slate-800 mb-1">{label}</p>
                                                            <p className="text-blue-600 font-medium">Price: ${data.price.toFixed(2)}</p>
                                                            <p className="text-slate-500">Vendor: {data.supplier}</p>
                                                            <p className="text-slate-500">Project: {data.project}</p>
                                                            <p className="text-slate-500">Qty: {data.qty}</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                        <Scatter dataKey="price" fill="#2563eb" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Supplier Comparison Chart */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-900 text-lg mb-4">Supplier Comparison (Avg Unit Cost)</h3>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={supplierComparisonData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                                        <XAxis type="number" tickFormatter={(val) => `$${val}`} />
                                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fontWeight: 500}} />
                                        <Tooltip 
                                            cursor={{fill: '#f8fafc'}}
                                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Avg Price']}
                                        />
                                        <Bar dataKey="avgPrice" radius={[0, 4, 4, 0]} barSize={32}>
                                            {supplierComparisonData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#64748b'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>
                </div>
            </>
        )}

        {/* --- DATA ENTRY TAB --- */}
        {activeTab === 'entry' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
                {/* Left Column: Import Tools */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* SYNC TO DB CARD */}
                    <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-blue-600" /> Update Price DB
                        </h3>
                        <p className="text-slate-500 text-xs mb-4">
                            Scan purchase history and update your material database with the latest prices. Adds new items if missing.
                        </p>
                        <button 
                            onClick={handleSyncToDatabase}
                            className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-md"
                        >
                            Sync to Price Database
                        </button>
                    </div>

                    {/* AI Invoice Card */}
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
                        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            AI Invoice Extractor
                        </h3>
                        <p className="text-blue-100 text-sm mb-6">
                            Upload a PDF or Image invoice. AI will extract line items automatically.
                        </p>
                        <div 
                            className="border-2 border-dashed border-white/30 rounded-xl p-8 text-center hover:bg-white/10 transition cursor-pointer relative"
                            onClick={() => !isExtracting && fileInputRef.current?.click()}
                        >
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept=".pdf,image/*" 
                                className="hidden" 
                                onChange={handleInvoiceUpload}
                            />
                            {isExtracting ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                    <span className="text-sm font-bold">Analyzing...</span>
                                    {uploadFileName && <span className="text-xs opacity-80 mt-1 truncate max-w-[200px]">{uploadFileName}</span>}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <Upload className="w-8 h-8 mb-2 opacity-80" />
                                    <span className="text-sm font-bold">Upload Invoice</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bulk Import Card */}
                    <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Bulk Data Import
                        </h3>
                        <p className="text-slate-500 text-xs mb-4">
                            Upload Excel/CSV with purchase history.
                        </p>
                        <div className="flex gap-2 mb-3">
                             <button 
                                onClick={handleDownloadTemplate}
                                className="flex-1 py-2 border border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold rounded hover:bg-slate-100 flex items-center justify-center gap-1"
                             >
                                 <Download className="w-3 h-3" /> Template
                             </button>
                        </div>
                        <div className="relative">
                            <input 
                                type="file" 
                                accept=".csv, .xlsx, .xls" 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                ref={bulkInputRef}
                                onChange={handleBulkUpload}
                            />
                            <button className="w-full py-2.5 border border-slate-300 bg-slate-50 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition flex items-center justify-center gap-2">
                                <Upload className="w-4 h-4" /> Select File
                            </button>
                        </div>
                    </div>

                    {/* QuickBooks Card */}
                    <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-green-600" /> QuickBooks Sync
                        </h3>
                        <p className="text-slate-500 text-xs mb-4">
                            Pull recent bills directly from QuickBooks Online.
                        </p>
                        <button 
                            onClick={handleConnectQuickBooks}
                            disabled={isQBSyncing}
                            className="w-full py-2.5 bg-[#2CA01C] text-white font-bold rounded-lg hover:bg-[#248317] transition flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isQBSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect QuickBooks"}
                        </button>
                    </div>
                </div>

                {/* Center/Right: Manual Entry & Table */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Manual Entry Form */}
                    <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Manual Entry
                        </h3>
                        <div className="space-y-4">
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Item Description</label>
                                <input 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    value={manualEntry.itemDescription}
                                    onChange={(e) => {
                                        setManualEntry({...manualEntry, itemDescription: e.target.value});
                                        setShowItemSuggestions(true);
                                    }}
                                    onFocus={() => setShowItemSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)}
                                    placeholder="Search or type new item..."
                                    autoComplete="off"
                                />
                                {showItemSuggestions && (
                                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                        {uniqueItemNames
                                            .filter(i => i.toLowerCase().includes((manualEntry.itemDescription || '').toLowerCase()))
                                            .slice(0, 20)
                                            .map((item, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer text-slate-700"
                                                    onMouseDown={() => {
                                                        setManualEntry({...manualEntry, itemDescription: item});
                                                        setShowItemSuggestions(false);
                                                    }}
                                                >
                                                    {item}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                    <input 
                                        type="date"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                        value={manualEntry.date}
                                        onChange={(e) => setManualEntry({...manualEntry, date: e.target.value})}
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Supplier</label>
                                    <input 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                        value={manualEntry.supplier}
                                        onChange={(e) => {
                                            setManualEntry({...manualEntry, supplier: e.target.value});
                                            setShowSupplierSuggestions(true);
                                        }}
                                        onFocus={() => setShowSupplierSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 200)}
                                        placeholder="Select or type..."
                                        autoComplete="off"
                                    />
                                    {showSupplierSuggestions && (
                                        <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                            {uniqueSuppliers
                                                .filter(s => s.toLowerCase().includes((manualEntry.supplier || '').toLowerCase()))
                                                .map((supplier, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer text-slate-700"
                                                        onMouseDown={() => {
                                                            setManualEntry({...manualEntry, supplier: supplier});
                                                            setShowSupplierSuggestions(false);
                                                        }}
                                                    >
                                                        {supplier}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                        value={manualEntry.quantity}
                                        onChange={(e) => setManualEntry({...manualEntry, quantity: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit Cost</label>
                                    <input 
                                        type="number"
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                        value={manualEntry.unitCost}
                                        onChange={(e) => setManualEntry({...manualEntry, unitCost: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleManualSubmit}
                                className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg hover:bg-slate-800 transition shadow-sm mt-2"
                            >
                                Add Record
                            </button>
                        </div>
                    </div>

                    {/* Database Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col lg:h-[calc(100vh-500px)] overflow-hidden">
                        <div className="p-4 border-b border-slate-200">
                            <h3 className="font-bold text-slate-800 text-sm uppercase">Recent Entries</h3>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-200">
                                    <tr>
                                        <SortableHeader label="Date" sortKey="date" />
                                        <SortableHeader label="Supplier" sortKey="supplier" />
                                        <SortableHeader label="Item" sortKey="itemDescription" />
                                        <SortableHeader label="Cost" sortKey="unitCost" align="right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredPurchases.slice(0, 50).map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(p.date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-medium text-slate-700">{p.supplier}</td>
                                            <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={p.itemDescription}>{p.itemDescription}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium">${p.unitCost.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {filteredPurchases.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                                                No records found. Upload data to get started.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};