
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PurchaseRecord, MaterialItem, ProjectEstimate, ServiceTicket, SupplierStatus, ShoppingItem, VarianceItem } from '../types';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from 'recharts';
import { Search, TrendingUp, DollarSign, Filter, Award, Upload, Loader2, FileSpreadsheet, LayoutDashboard, Database, X, CheckCircle, Sparkles, AlertTriangle, Trash2, Plus, ShoppingCart, RefreshCw, Calendar, Download, Settings, FileText, ArrowRightLeft, Percent, ArrowUpRight, ArrowDownRight, Globe, ExternalLink, Cloud, Link as LinkIcon, Save } from 'lucide-react';
import { extractInvoiceData, fetchLiveWebPrices } from '../services/geminiService';
import * as XLSX from 'xlsx';
import { parseCurrency, parseNumber, normalizeSupplier, robustParseDate } from '../utils/purchaseData';
import { MIAMI_STANDARD_PRICES } from '../utils/miamiStandards';
import { fetchQuickBooksBills, getZapierWebhookUrl, setZapierWebhookUrl } from '../services/quickbooksService';
import { searchSharePointSites, getSiteDrive, searchExcelFiles, downloadFileContent, SPSite, SPDriveItem } from '../services/sharepointService';

interface PriceAnalysisProps {
  purchases: PurchaseRecord[];
  setPurchases?: React.Dispatch<React.SetStateAction<PurchaseRecord[]>>;
  materials?: MaterialItem[]; 
  setMaterials?: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  projects?: ProjectEstimate[]; 
  tickets?: ServiceTicket[];
}

export const PriceAnalysis: React.FC<PriceAnalysisProps> = ({ purchases = [], setPurchases, materials = [], setMaterials, projects = [], tickets = [] }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'procurement' | 'entry' | 'variance'>('dashboard');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByValue, setSortByValue] = useState(true);
  
  // Live Price State
  const [isSearchingLive, setIsSearchingLive] = useState(false);
  const [livePriceResult, setLivePriceResult] = useState<{ text: string, sources: { uri: string, title: string }[] } | null>(null);

  // Variance State
  const [selectedVarianceProject, setSelectedVarianceProject] = useState<string>('All');
  
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

  // SharePoint File Import State
  const [showSpImport, setShowSpImport] = useState(false);
  const [spSites, setSpSites] = useState<SPSite[]>([]);
  const [spFiles, setSpFiles] = useState<SPDriveItem[]>([]);
  const [selectedSpSite, setSelectedSpSite] = useState<SPSite | null>(null);
  const [isLoadingSp, setIsLoadingSp] = useState(false);
  // Stored preferences for auto-sync
  const [savedSpConfig, setSavedSpConfig] = useState<{driveId: string, itemId: string, fileName: string} | null>(() => {
      const saved = localStorage.getItem('carsan_price_file_config');
      return saved ? JSON.parse(saved) : null;
  });

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

  // --- VARIANCE CALCULATIONS ---
  const varianceData = useMemo(() => {
    if (!projects) return { projectSummaries: [], itemVariances: [] };

    const summaries = projects.map(proj => {
      // 1. Calculate Estimated Material Cost
      const estMatCost = proj.items.reduce((sum, item) => sum + (item.quantity * item.unitMaterialCost), 0);

      // 2. Calculate Actual Purchase Cost for this project
      const projectPurchases = purchases.filter(p => 
        p.projectName.toLowerCase().trim() === proj.name.toLowerCase().trim() ||
        p.projectName === proj.id
      );
      const actMatCost = projectPurchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
      
      const variance = actMatCost - estMatCost;
      const variancePercent = estMatCost > 0 ? (variance / estMatCost) * 100 : 0;

      return {
        id: proj.id,
        name: proj.name,
        estimated: estMatCost,
        actual: actMatCost,
        variance,
        variancePercent,
        status: variance > (estMatCost * 0.05) ? 'Over Budget' : 'On Track'
      };
    }).filter(s => s.estimated > 0 || s.actual > 0);

    let itemBreakdown: any[] = [];
    const targetProject = projects.find(p => p.id === selectedVarianceProject);
    
    if (targetProject) {
      const projectPurchases = purchases.filter(p => 
        p.projectName.toLowerCase().trim() === targetProject.name.toLowerCase().trim() ||
        p.projectName === targetProject.id
      );

      targetProject.items.forEach(estItem => {
        const matchedPurchases = projectPurchases.filter(p => 
          p.itemDescription.toLowerCase().includes(estItem.description.toLowerCase()) ||
          estItem.description.toLowerCase().includes(p.itemDescription.toLowerCase())
        );

        const purchasedQty = matchedPurchases.reduce((sum, p) => sum + p.quantity, 0);
        const purchasedTotal = matchedPurchases.reduce((sum, p) => sum + p.totalCost, 0);
        const avgPurchasedUnit = purchasedQty > 0 ? purchasedTotal / purchasedQty : 0;

        itemBreakdown.push({
          description: estItem.description,
          estQty: estItem.quantity,
          estUnit: estItem.unitMaterialCost,
          estTotal: estItem.quantity * estItem.unitMaterialCost,
          actQty: purchasedQty,
          actUnit: avgPurchasedUnit,
          actTotal: purchasedTotal,
          variance: purchasedTotal - (estItem.quantity * estItem.unitMaterialCost),
          type: 'Match'
        });
      });

      projectPurchases.forEach(p => {
        const isMatched = targetProject.items.some(est => 
            p.itemDescription.toLowerCase().includes(est.description.toLowerCase()) ||
            est.description.toLowerCase().includes(p.itemDescription.toLowerCase())
        );
        if (!isMatched) {
            itemBreakdown.push({
                description: p.itemDescription,
                estQty: 0,
                estUnit: 0,
                estTotal: 0,
                actQty: p.quantity,
                actUnit: p.unitCost,
                actTotal: p.totalCost,
                variance: p.totalCost,
                type: 'Unplanned'
            });
        }
      });
    }

    return { projectSummaries: summaries, itemVariances: itemBreakdown };
  }, [projects, purchases, selectedVarianceProject]);

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
      const totalPOs = new Set(data.map(p => p.poNumber)).size; 
      const avgOrderValue = totalPOs > 0 ? totalSpend / totalPOs : 0;

      const supplierSpendMap: Record<string, number> = {};
      data.forEach(p => {
          const s = normalizeSupplier(p.supplier);
          supplierSpendMap[s] = (supplierSpendMap[s] || 0) + p.totalCost;
      });
      const topSuppliers = Object.entries(supplierSpendMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a,b) => b.value - a.value)
          .slice(0, 10);

      const monthlySpendMap: Record<string, number> = {};
      data.forEach(p => {
          const date = robustParseDate(p.date);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; 
          monthlySpendMap[key] = (monthlySpendMap[key] || 0) + p.totalCost;
      });
      const monthlyTrend = Object.entries(monthlySpendMap)
          .map(([date, value]) => ({ date, value }))
          .sort((a,b) => a.date.localeCompare(b.date));

      return { totalSpend, uniqueSuppliers, totalPOs, avgOrderValue, topSuppliers, monthlyTrend };
  }, [filteredData]);

  // --- MARKET TRENDS LOGIC ---
  const processedItemsList = useMemo(() => {
      const itemMap = new Map<string, { total: number, count: number, latestPrice: number, latestDate: string }>();
      
      // Sort purchases by date to find the latest price accurately
      const sortedPurchases = [...filteredData.purchases].sort((a, b) => 
          robustParseDate(b.date).getTime() - robustParseDate(a.date).getTime()
      );

      sortedPurchases.forEach(p => {
          const name = p.itemDescription || 'Unknown';
          if (!itemMap.has(name)) {
              itemMap.set(name, { total: 0, count: 0, latestPrice: p.unitCost, latestDate: p.date });
          }
          const curr = itemMap.get(name)!;
          curr.total += p.totalCost || 0;
          curr.count += 1;
      });

      let items = Array.from(itemMap.entries()).map(([name, data]) => {
          // Find matching item in Price Database for estimate comparison
          const dbMatch = materials?.find(m => 
              m.name.toLowerCase() === name.toLowerCase() || 
              name.toLowerCase().includes(m.name.toLowerCase())
          );
          
          const estPrice = dbMatch?.materialCost || 0;
          const diff = data.latestPrice - estPrice;
          const percentChange = estPrice > 0 ? (diff / estPrice) * 100 : 0;

          return {
              name,
              total: data.total,
              count: data.count,
              latestPrice: data.latestPrice,
              estPrice: estPrice,
              percentChange,
              hasDbMatch: !!dbMatch
          };
      });

      if (searchTerm) {
          items = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      if (sortByValue) {
          items.sort((a, b) => b.total - a.total);
      } else {
          items.sort((a, b) => a.name.localeCompare(b.name));
      }

      return items;
  }, [filteredData.purchases, searchTerm, sortByValue, materials]);

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

  // --- LIVE PRICE SEARCH HANDLER ---
  const handleLivePriceSearch = async () => {
    if (!selectedItem) return;
    setIsSearchingLive(true);
    setLivePriceResult(null);
    try {
        const result = await fetchLiveWebPrices(selectedItem);
        setLivePriceResult(result);
        showNotification('success', 'Found live market pricing.');
    } catch (e: any) {
        showNotification('error', e.message);
    } finally {
        setIsSearchingLive(false);
    }
  };

  // --- SHAREPOINT FILE HANDLERS ---
  const handleSearchSpSites = async () => {
      setIsLoadingSp(true);
      try {
          // Default search for Carsan sites to help user
          const results = await searchSharePointSites("Carsan");
          setSpSites(results);
          if(results.length === 0) {
              // Fallback to all accessible sites
              const allSites = await searchSharePointSites("");
              setSpSites(allSites);
          }
      } catch (e: any) {
          showNotification('error', "Could not search sites. Ensure you are signed in.");
      } finally {
          setIsLoadingSp(false);
      }
  };

  const handleSelectSpSite = async (site: SPSite) => {
      setSelectedSpSite(site);
      setIsLoadingSp(true);
      try {
          const driveId = await getSiteDrive(site.id);
          // Look for excel files
          const files = await searchExcelFiles(driveId, ""); // Empty query lists relevant files or searches for xlsx
          setSpFiles(files.map(f => ({...f, parentDriveId: driveId} as any)));
      } catch (e) {
          showNotification('error', "Could not access files in this site.");
      } finally {
          setIsLoadingSp(false);
      }
  };

  const processExcelBuffer = (buffer: ArrayBuffer) => {
      try {
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          const cleanData = jsonData.map((row: any) => {
              const newRow: any = {};
              Object.keys(row).forEach(key => {
                  const cleanKey = key.trim().replace(/^[\uFEFF\uFFFE]/, '');
                  newRow[cleanKey] = row[key];
              });
              return newRow;
          });

          const newRecords = cleanData.map((row: any, idx) => ({
              id: `sp-${Date.now()}-${idx}`,
              date: robustParseDate(row['Date'] || row['Fecha']).toISOString(),
              poNumber: String(row['Purchase Order #'] || row['PO'] || ''),
              brand: String(row['Brand'] || 'N/A'),
              itemDescription: String(row['Item'] || row['Description'] || ''),
              quantity: parseNumber(row['Quantity'] || row['Qty'] || 0),
              unitCost: parseCurrency(row['Unit Cost'] || row['Price'] || 0),
              totalCost: parseCurrency(row['Total'] || 0),
              supplier: normalizeSupplier(String(row['Supplier'] || row['Vendor'] || '')),
              projectName: String(row['Project'] || 'Inventory'),
              type: 'Material'
          })).filter(r => r.itemDescription && r.totalCost > 0);

          if (setPurchases) {
              setPurchases(prev => {
                  return [...prev, ...newRecords];
              });
              showNotification('success', `Successfully imported ${newRecords.length} items from SharePoint.`);
          }
      } catch (e) {
          showNotification('error', "Failed to parse Excel file.");
      }
  };

  const handleSelectSpFile = async (file: SPDriveItem & { parentDriveId: string }) => {
      setIsLoadingSp(true);
      try {
          const buffer = await downloadFileContent(file.parentDriveId, file.id);
          processExcelBuffer(buffer);
          
          // Save config for future one-click sync
          const config = { driveId: file.parentDriveId, itemId: file.id, fileName: file.name };
          setSavedSpConfig(config);
          localStorage.setItem('carsan_price_file_config', JSON.stringify(config));
          
          setShowSpImport(false);
      } catch (e) {
          showNotification('error', "Failed to download file content.");
      } finally {
          setIsLoadingSp(false);
      }
  };

  const handleQuickSync = async () => {
      if (!savedSpConfig) return;
      setIsSyncingQb(true); // Reuse loading spinner
      try {
          const buffer = await downloadFileContent(savedSpConfig.driveId, savedSpConfig.itemId);
          processExcelBuffer(buffer);
      } catch (e) {
          showNotification('error', "Quick sync failed. File might have moved. Please re-select.");
          setSavedSpConfig(null);
          localStorage.removeItem('carsan_price_file_config');
      } finally {
          setIsSyncingQb(false);
      }
  };

  // --- SMART PROCUREMENT LOGIC ---
  const optimizedProcurement = useMemo(() => {
      const plan: Record<string, { items: ShoppingItem[], totalEst: number }> = {};
      const unknownItems: ShoppingItem[] = [];

      shoppingList.forEach(item => {
          const history = purchases.filter(p => p.itemDescription.toLowerCase().includes(item.name.toLowerCase()));
          
          if (history.length === 0) {
              unknownItems.push(item);
              return;
          }

          const validHistory = history.filter(p => {
              const supName = normalizeSupplier(p.supplier);
              const status = supplierStatuses.find(s => s.name === supName);
              return !status?.isBlocked;
          });

          if (validHistory.length === 0) {
              unknownItems.push(item);
              return;
          }

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
      e.target.value = ''; 
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 5000);
  };

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

      {/* SHAREPOINT MODAL */}
      {showSpImport && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Cloud className="w-5 h-5 text-blue-600" /> Import from SharePoint
                      </h3>
                      <button onClick={() => setShowSpImport(false)}><X className="w-5 h-5 text-slate-400" /></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4">
                      {!selectedSpSite ? (
                          <div className="space-y-4">
                              <p className="text-sm text-slate-600">Select the SharePoint site containing your price list:</p>
                              {spSites.length === 0 ? (
                                  <div className="text-center py-8">
                                      <button 
                                          onClick={handleSearchSpSites}
                                          disabled={isLoadingSp}
                                          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 mx-auto disabled:opacity-70"
                                      >
                                          {isLoadingSp ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
                                          Search "Carsan" Sites
                                      </button>
                                  </div>
                              ) : (
                                  <div className="space-y-2">
                                      {spSites.map(site => (
                                          <button 
                                              key={site.id}
                                              onClick={() => handleSelectSpSite(site)}
                                              className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-blue-50 transition-colors flex justify-between items-center group"
                                          >
                                              <span className="font-bold text-slate-700 text-sm">{site.displayName}</span>
                                              <ArrowRightLeft className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="space-y-4">
                              <button onClick={() => { setSelectedSpSite(null); setSpFiles([]); }} className="text-xs text-blue-600 hover:underline mb-2">Back to Sites</button>
                              <h4 className="font-bold text-slate-800 text-sm">Files in "{selectedSpSite.displayName}"</h4>
                              {isLoadingSp ? (
                                  <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
                              ) : (
                                  <div className="space-y-2">
                                      {spFiles.length === 0 ? (
                                          <p className="text-center text-slate-400 text-sm py-4">No Excel files found in default drive.</p>
                                      ) : (
                                          spFiles.map(file => (
                                              <button 
                                                  key={file.id}
                                                  onClick={() => handleSelectSpFile(file as any)}
                                                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-emerald-50 transition-colors flex items-center gap-3"
                                              >
                                                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                                                  <div className="flex-1 overflow-hidden">
                                                      <p className="font-bold text-slate-700 text-sm truncate">{file.name}</p>
                                                      <p className="text-[10px] text-slate-400">Last mod: {new Date(file.lastModifiedDateTime).toLocaleDateString()}</p>
                                                  </div>
                                              </button>
                                          ))
                                      )}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

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
            <button onClick={() => setActiveTab('variance')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'variance' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><ArrowRightLeft className="w-4 h-4" /> Budget Variance</button>
            <button onClick={() => setActiveTab('procurement')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'procurement' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><ShoppingCart className="w-4 h-4" /> Smart Buy</button>
            <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'entry' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}><Database className="w-4 h-4" /> Data Entry</button>
        </div>
      </div>

      {activeTab !== 'variance' && (
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
      )}

      {activeTab === 'dashboard' && (
          <div className="space-y-6">
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

      {activeTab === 'variance' && (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Project Budgets</h3>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Est vs Act</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {varianceData.projectSummaries.map(s => (
                            <div 
                                key={s.id}
                                onClick={() => setSelectedVarianceProject(s.id)}
                                className={`p-4 border-b border-slate-50 cursor-pointer transition-colors hover:bg-blue-50 ${selectedVarianceProject === s.id ? 'bg-blue-50 border-blue-200' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <p className="font-bold text-sm text-slate-900 truncate flex-1 pr-2">{s.name}</p>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.variance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {s.variance > 0 ? '+' : ''}{s.variancePercent.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>Est: ${s.estimated.toLocaleString()}</span>
                                    <span className="font-medium text-slate-700">Act: ${s.actual.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${s.variance > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                        style={{ width: `${Math.min(100, (s.actual / s.estimated) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-3 flex flex-col gap-6">
                    {selectedVarianceProject !== 'All' && projects?.find(p => p.id === selectedVarianceProject) ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                        <FileText className="w-3 h-3"/> Original Estimate (Mat)
                                    </p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                        ${varianceData.projectSummaries.find(s => s.id === selectedVarianceProject)?.estimated.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                        <ShoppingCart className="w-3 h-3"/> Total Actual Purchases
                                    </p>
                                    <p className="text-xl font-bold text-slate-900 mt-1">
                                        ${varianceData.projectSummaries.find(s => s.id === selectedVarianceProject)?.actual.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                        <Percent className="w-3 h-3"/> Net Material Variance
                                    </p>
                                    <p className={`text-xl font-bold mt-1 ${varianceData.projectSummaries.find(s => s.id === selectedVarianceProject)!.variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        ${Math.abs(varianceData.projectSummaries.find(s => s.id === selectedVarianceProject)!.variance).toLocaleString()}
                                        <span className="text-xs ml-1 font-medium">({varianceData.projectSummaries.find(s => s.id === selectedVarianceProject)!.variance > 0 ? 'OVER' : 'UNDER'})</span>
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800">Itemized Material Variance</h3>
                                    <div className="flex gap-2">
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-200"></div> ESTIMATED</span>
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><div className="w-2 h-2 rounded-full bg-emerald-100 border border-emerald-200"></div> ACTUAL</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[450px] custom-scrollbar">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-3">Description</th>
                                                <th className="px-4 py-3 text-center">Qty (Est/Act)</th>
                                                <th className="px-4 py-3 text-right">Unit Price (Est/Act)</th>
                                                <th className="px-6 py-3 text-right">Cost Variance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {varianceData.itemVariances.map((item, i) => (
                                                <tr key={i} className="hover:bg-slate-50 group">
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-900 text-xs">{item.description}</div>
                                                        {item.type === 'Unplanned' && (
                                                            <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase mt-1 inline-block">Unplanned Purchase</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-blue-600 font-medium">{item.estQty}</span>
                                                            <ArrowRightLeft className="w-3 h-3 text-slate-300" />
                                                            <span className="text-emerald-600 font-medium">{item.actQty}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="text-[10px] text-blue-500 font-medium">${item.estUnit.toFixed(2)}</div>
                                                        <div className="text-xs text-emerald-600 font-bold mt-0.5">${item.actUnit.toFixed(2)}</div>
                                                    </td>
                                                    <td className={`px-6 py-4 text-right font-bold tabular-nums ${item.variance > 0 ? 'text-red-600' : item.variance < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                        {item.variance === 0 ? '-' : `$${item.variance.toLocaleString()}`}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex-1 flex flex-col items-center justify-center p-12 text-center">
                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                <ArrowRightLeft className="w-12 h-12 text-blue-300" />
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg">Analyze Budget Variance</h3>
                            <p className="text-slate-500 max-w-md mt-2">
                                Select a project from the left to compare the material items used in the estimate against actual invoices processed.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {activeTab === 'analysis' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                      <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                              placeholder="Search item trends..." 
                              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                      <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <span>Material Item</span>
                          <span>Est vs Act (% Var)</span>
                      </div>
                      {processedItemsList.map(item => (
                          <div 
                              key={item.name} 
                              onClick={() => { setSelectedItem(item.name); setLivePriceResult(null); }}
                              className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-blue-50 transition flex justify-between items-center ${selectedItem === item.name ? 'bg-blue-50 border-blue-200' : ''}`}
                          >
                              <div className="truncate pr-4 flex-1">
                                  <p className="font-bold text-sm text-slate-800 truncate">{item.name}</p>
                                  <p className="text-xs text-slate-400">{item.count} purchases</p>
                              </div>
                              <div className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                      <p className="font-bold text-xs text-slate-900">${item.latestPrice.toFixed(2)}</p>
                                      {item.hasDbMatch && (
                                          <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${item.percentChange > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                              {item.percentChange > 0 ? <ArrowUpRight className="w-2.5 h-2.5"/> : <ArrowDownRight className="w-2.5 h-2.5"/>}
                                              {Math.abs(item.percentChange).toFixed(1)}%
                                          </div>
                                      )}
                                  </div>
                                  {item.hasDbMatch && <p className="text-[10px] text-slate-400">Est: ${item.estPrice.toFixed(2)}</p>}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                  {selectedItem ? (
                      <div className="space-y-6">
                          <div className="flex justify-between items-start">
                              <div>
                                  <h3 className="font-bold text-xl text-slate-900">{selectedItem}</h3>
                                  <p className="text-sm text-slate-500">Price Trend (Unit Cost)</p>
                              </div>
                              <div className="flex gap-2">
                                  <button 
                                      onClick={handleLivePriceSearch}
                                      disabled={isSearchingLive}
                                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md disabled:opacity-50"
                                  >
                                      {isSearchingLive ? <Loader2 className="w-4 h-4 animate-spin"/> : <Globe className="w-4 h-4" />}
                                      Live Market Lookup
                                  </button>
                                  {processedItemsList.find(i => i.name === selectedItem)?.hasDbMatch && (
                                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-right">
                                          <p className="text-[10px] font-bold text-blue-500 uppercase">Database Price</p>
                                          <p className="text-lg font-bold text-blue-700">${processedItemsList.find(i => i.name === selectedItem)?.estPrice.toFixed(2)}</p>
                                      </div>
                                  )}
                              </div>
                          </div>

                          {livePriceResult && (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                  <h4 className="font-bold text-emerald-900 flex items-center gap-2 mb-3">
                                      <Sparkles className="w-5 h-5 text-emerald-600" />
                                      Live Web Pricing Analysis
                                  </h4>
                                  <p className="text-sm text-emerald-800 leading-relaxed whitespace-pre-wrap mb-4">
                                      {livePriceResult.text}
                                  </p>
                                  {livePriceResult.sources.length > 0 && (
                                      <div className="border-t border-emerald-200 pt-3">
                                          <p className="text-[10px] font-bold text-emerald-600 uppercase mb-2">Sources Found:</p>
                                          <div className="flex flex-wrap gap-2">
                                              {livePriceResult.sources.map((src, idx) => (
                                                  <a 
                                                      key={idx}
                                                      href={src.uri}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="flex items-center gap-1.5 bg-white border border-emerald-200 px-2 py-1 rounded text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                                                  >
                                                      <ExternalLink className="w-3 h-3" />
                                                      {src.title}
                                                  </a>
                                              ))}
                                          </div>
                                      </div>
                                  )}
                              </div>
                          )}
                          
                          <div className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={simpleTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                      <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} />
                                      <YAxis domain={['auto', 'auto']} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `$${v}`} />
                                      <Tooltip 
                                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                          formatter={(val: number) => [`$${val.toFixed(2)}`, 'Unit Cost']}
                                      />
                                      {processedItemsList.find(i => i.name === selectedItem)?.hasDbMatch && (
                                          <Legend verticalAlign="top" height={36}/>
                                      )}
                                      <Line type="monotone" dataKey="price" name="Actual Purchase" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                  </LineChart>
                              </ResponsiveContainer>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                              <h4 className="font-bold text-sm text-slate-800 mb-2">Purchase History</h4>
                              <div className="flex flex-wrap gap-2">
                                  {simpleTrendData.slice(-5).reverse().map((pt, i) => (
                                      <div key={i} className="bg-white px-3 py-1.5 rounded border border-slate-200 text-xs">
                                          <span className="text-slate-500">{pt.date}:</span> <span className="font-bold text-slate-800">${pt.price.toFixed(2)}</span> <span className="text-slate-400">({pt.supplier})</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-20">
                          <TrendingUp className="w-16 h-16 mb-4 opacity-20" />
                          <p>Select an item to view price trends and search live market data.</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'entry' && (
          <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                      <div className="bg-white p-2 rounded-lg shadow-sm">
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
                  {/* SHAREPOINT IMPORT CARD */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Cloud className="w-5 h-5 text-blue-600"/> SharePoint Excel Sync
                      </h3>
                      {savedSpConfig ? (
                          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 mb-3">
                              <p className="text-xs font-bold text-blue-500 uppercase mb-1">Linked File</p>
                              <div className="flex items-center justify-between">
                                  <p className="font-bold text-slate-700 truncate mr-2" title={savedSpConfig.fileName}>{savedSpConfig.fileName}</p>
                                  <button onClick={() => { setSavedSpConfig(null); localStorage.removeItem('carsan_price_file_config'); }} className="text-xs text-red-500 hover:underline">Unlink</button>
                              </div>
                              <button 
                                  onClick={handleQuickSync}
                                  className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                              >
                                  {isSyncingQb ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                  Sync Now
                              </button>
                          </div>
                      ) : (
                          <button 
                              onClick={() => setShowSpImport(true)}
                              className="w-full border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 py-8 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors flex flex-col items-center justify-center gap-2"
                          >
                              <LinkIcon className="w-6 h-6" />
                              Connect Cloud File
                          </button>
                      )}
                      <p className="text-xs text-slate-400 mt-2 text-center">Syncs pricing from your centralized Excel sheet.</p>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-green-600"/> Local Bulk Import</h3>
                      <button onClick={() => bulkInputRef.current?.click()} className="w-full border border-slate-300 text-slate-700 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 mb-2">Select Excel File</button>
                      <input type="file" ref={bulkInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && setPurchases) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                  const data = event.target?.result;
                                  const workbook = XLSX.read(data, { type: 'array' });
                                  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                                  const jsonData = XLSX.utils.sheet_to_json(worksheet);
                                  
                                  // Sanitize keys (Remove BOM and trim)
                                  const cleanData = jsonData.map((row: any) => {
                                      const newRow: any = {};
                                      Object.keys(row).forEach(key => {
                                          const cleanKey = key.trim().replace(/^[\uFEFF\uFFFE]/, '');
                                          newRow[cleanKey] = row[key];
                                      });
                                      return newRow;
                                  });

                                  const newRecords = cleanData.map((row: any, idx) => ({
                                      id: `bulk-${Date.now()}-${idx}`,
                                      date: robustParseDate(row['Date']).toISOString(),
                                      poNumber: String(row['Purchase Order #'] || ''),
                                      brand: String(row['Brand'] || 'N/A'),
                                      itemDescription: String(row['Item'] || ''),
                                      quantity: parseNumber(row['Quantity'] || 0),
                                      unitCost: parseCurrency(row['Unit Cost'] || 0),
                                      totalCost: parseCurrency(row['Total'] || 0),
                                      supplier: normalizeSupplier(String(row['Supplier'] || '')),
                                      projectName: String(row['Project'] || 'Inventory'),
                                      type: 'Material'
                                  })).filter(r => r.totalCost > 0 || r.quantity > 0);
                                  
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
          </div>
      )}
      
      {activeTab !== 'entry' && activeTab !== 'analysis' && activeTab !== 'dashboard' && activeTab !== 'procurement' && activeTab !== 'variance' && <div>Tab Not Found</div>}
    </div>
  );
};
