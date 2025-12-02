
import React, { useState, useRef, useEffect } from 'react';
import { ProjectEstimate, EstimateLineItem, MaterialItem } from '../types';
import { analyzeBlueprint } from '../services/geminiService';
import { UploadCloud, Loader2, Plus, Trash2, FileText, Check, ChevronDown, ChevronUp, Calendar, MapPin, User, Phone, Briefcase } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface EstimatorProps {
  materials: MaterialItem[];
  projects: ProjectEstimate[]; // Added to access existing clients/estimators
}

export const Estimator: React.FC<EstimatorProps> = ({ materials, projects }) => {
  const [estimate, setEstimate] = useState<ProjectEstimate>({
    id: 'new',
    name: 'Untitled Project',
    client: '',
    contactInfo: '',
    address: 'Miami, FL',
    city: 'Miami',
    estimator: '',
    dateCreated: new Date().toISOString(),
    deliveryDate: '',
    expirationDate: '',
    status: 'Draft',
    laborRate: 75,
    items: [],
  });

  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'worksheet' | 'summary'>('upload');
  const [showDetails, setShowDetails] = useState(false); // Toggle for full form
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived Lists
  const uniqueClients = Array.from(new Set(projects.map(p => p.client).filter((c): c is string => !!c))) as string[];
  const uniqueEstimators = Array.from(new Set(projects.map(p => p.estimator).filter((e): e is string => !!e))) as string[];

  const filteredClients = uniqueClients.filter((c: string) => 
    c.toLowerCase().includes(estimate.client.toLowerCase()) && 
    c.toLowerCase() !== estimate.client.toLowerCase()
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value to allow re-selecting the same file if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setEstimate(prev => ({ ...prev, blueprintImage: base64 }));
      
      setAnalyzing(true);
      try {
        const result = await analyzeBlueprint(base64, materials);
        
        const newItems: EstimateLineItem[] = result.items.map(foundItem => {
            const match = materials.find(m => 
                foundItem.description.toLowerCase().includes(m.name.toLowerCase()) || 
                m.name.toLowerCase().includes(foundItem.description.toLowerCase())
            );

            return {
                id: Date.now() + Math.random().toString(),
                description: foundItem.description,
                quantity: foundItem.count,
                materialId: match?.id,
                unitMaterialCost: match?.materialCost || 0,
                unitLaborHours: match?.laborHours || 0.5,
                laborRate: estimate.laborRate
            };
        });

        setEstimate(prev => ({
            ...prev,
            items: [...prev.items, ...newItems]
        }));
        setActiveTab('worksheet');
      } catch (err) {
        console.error("Blueprint Analysis Failed:", err);
        alert("Failed to analyze blueprint. Please check the console for details or try again with a clearer image.");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateLineItem = (id: string, field: keyof EstimateLineItem, value: number | string) => {
    setEstimate(prev => ({
        ...prev,
        items: prev.items.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        })
    }));
  };

  const deleteLineItem = (id: string) => {
    setEstimate(prev => ({
        ...prev,
        items: prev.items.filter(i => i.id !== id)
    }));
  };

  const addManualItem = () => {
      const newItem: EstimateLineItem = {
          id: Date.now().toString(),
          description: "New Item",
          quantity: 1,
          unitMaterialCost: 0,
          unitLaborHours: 0,
          laborRate: estimate.laborRate
      };
      setEstimate(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  // Calculations
  const totalMaterial = estimate.items.reduce((sum, item) => sum + (item.quantity * item.unitMaterialCost), 0);
  const totalLaborHours = estimate.items.reduce((sum, item) => sum + (item.quantity * item.unitLaborHours), 0);
  const totalLaborCost = totalLaborHours * estimate.laborRate;
  const subTotal = totalMaterial + totalLaborCost;
  const overhead = subTotal * 0.10; // 10%
  const profit = subTotal * 0.15; // 15%
  const grandTotal = subTotal + overhead + profit;

  const chartData = [
    { name: 'Material', value: totalMaterial },
    { name: 'Labor', value: totalLaborCost },
    { name: 'Overhead', value: overhead },
    { name: 'Profit', value: profit },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Header for Estimator */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm transition-all">
        <div className="px-4 md:px-8 py-4">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div className="flex-1 max-w-2xl">
                        <input 
                            value={estimate.name}
                            onChange={(e) => setEstimate({...estimate, name: e.target.value})}
                            className="text-2xl font-bold text-slate-900 border-none focus:ring-0 p-0 placeholder-slate-300 w-full bg-transparent"
                            placeholder="Project Name"
                        />
                        <div className="flex items-center text-sm text-slate-500 mt-1 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => setShowDetails(!showDetails)}>
                            <span className="font-medium mr-2">{estimate.client || 'Select Client'}</span>
                            <span className="text-slate-300 mx-2">|</span>
                            <span>{estimate.city || 'Miami'}, FL</span>
                            {showDetails ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-3">
                         <div className="bg-slate-100 p-1 rounded-lg flex shrink-0">
                            {(['upload', 'worksheet', 'summary'] as const).map((tab) => (
                                <button 
                                    key={tab}
                                    onClick={() => setActiveTab(tab)} 
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                                        activeTab === tab 
                                        ? 'bg-white text-slate-900 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-700 hover:text-slate-700 hover:bg-slate-200/50'
                                    }`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total</p>
                            <p className="text-xl font-bold text-emerald-600 tabular-nums leading-none">
                                ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Collapsible Detailed Form */}
                {showDetails && (
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mt-2 grid grid-cols-1 md:grid-cols-3 gap-5 animate-in slide-in-from-top-2 duration-200">
                        {/* Column 1: Client & Contact */}
                        <div className="space-y-4">
                             <div className="relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <User className="w-3 h-3" /> Client Name
                                </label>
                                <input 
                                    value={estimate.client}
                                    onChange={(e) => {
                                        setEstimate({...estimate, client: e.target.value});
                                        setShowClientSuggestions(true);
                                    }}
                                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                                    onFocus={() => setShowClientSuggestions(true)}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Search or enter new client..."
                                />
                                {showClientSuggestions && filteredClients.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 z-50 max-h-40 overflow-y-auto">
                                        {filteredClients.map((client, idx) => (
                                            <div 
                                                key={idx}
                                                className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer text-slate-700"
                                                onMouseDown={() => setEstimate({...estimate, client})}
                                            >
                                                {client}
                                            </div>
                                        ))}
                                    </div>
                                )}
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> Contact Info
                                </label>
                                <input 
                                    value={estimate.contactInfo || ''}
                                    onChange={(e) => setEstimate({...estimate, contactInfo: e.target.value})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Email or Phone"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" /> Status
                                </label>
                                <select 
                                    value={estimate.status}
                                    onChange={(e) => setEstimate({...estimate, status: e.target.value as any})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                >
                                    <option value="Draft">Draft</option>
                                    <option value="Sent">Sent</option>
                                    <option value="Won">Won</option>
                                    <option value="Lost">Lost</option>
                                    <option value="Finalized">Finalized</option>
                                </select>
                             </div>
                        </div>

                        {/* Column 2: Location & Estimator */}
                        <div className="space-y-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> Address
                                </label>
                                <input 
                                    value={estimate.address}
                                    onChange={(e) => setEstimate({...estimate, address: e.target.value})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="Site Address"
                                />
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">City</label>
                                    <input 
                                        value={estimate.city || ''}
                                        onChange={(e) => setEstimate({...estimate, city: e.target.value})}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="City"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">State</label>
                                    <input 
                                        value="FL" disabled
                                        className="w-full text-sm border border-slate-200 bg-slate-100 rounded-lg px-3 py-2 text-slate-500"
                                    />
                                </div>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estimator</label>
                                <div className="relative">
                                    <select 
                                        value={estimate.estimator || ''}
                                        onChange={(e) => setEstimate({...estimate, estimator: e.target.value})}
                                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                                    >
                                        <option value="">Select Estimator</option>
                                        {uniqueEstimators.map(est => <option key={est} value={est}>{est}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                             </div>
                        </div>

                        {/* Column 3: Dates */}
                        <div className="space-y-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3" /> Delivery Date
                                </label>
                                <input 
                                    type="date"
                                    value={estimate.deliveryDate ? estimate.deliveryDate.split('T')[0] : ''}
                                    onChange={(e) => setEstimate({...estimate, deliveryDate: new Date(e.target.value).toISOString()})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-red-400" /> Expiration Date
                                </label>
                                <input 
                                    type="date"
                                    value={estimate.expirationDate ? estimate.expirationDate.split('T')[0] : ''}
                                    onChange={(e) => setEstimate({...estimate, expirationDate: new Date(e.target.value).toISOString()})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-emerald-500" /> Awarded Date
                                </label>
                                <input 
                                    type="date"
                                    value={estimate.awardedDate ? estimate.awardedDate.split('T')[0] : ''}
                                    onChange={(e) => setEstimate({...estimate, awardedDate: new Date(e.target.value).toISOString()})}
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                    disabled={estimate.status !== 'Won'}
                                />
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        
        {/* VIEW: UPLOAD */}
        {activeTab === 'upload' && (
            <div className="max-w-4xl mx-auto mt-8">
                <div 
                    className={`bg-white rounded-2xl border-2 border-dashed p-12 text-center transition-all cursor-pointer group relative overflow-hidden ${
                        analyzing ? 'border-blue-400 bg-blue-50/10' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
                    }`}
                    onClick={() => !analyzing && fileInputRef.current?.click()}
                >
                    <input 
                        ref={fileInputRef} 
                        type="file" 
                        accept="image/*,.pdf"
                        className="hidden" 
                        onChange={handleFileUpload}
                    />
                    
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>

                    {analyzing ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                                <Loader2 className="w-16 h-16 text-blue-600 animate-spin relative z-10" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mt-6">Analyzing Blueprint</h3>
                            <p className="text-slate-500 mt-2">Gemini is identifying electrical components...</p>
                        </div>
                    ) : estimate.blueprintImage ? (
                        <div className="flex flex-col items-center">
                            <img src={estimate.blueprintImage} alt="Blueprint" className="max-h-[500px] w-full object-contain shadow-2xl rounded-lg mb-6 border border-slate-200" />
                            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-4 py-2 rounded-full border border-blue-100 transition-colors">
                                Replace File
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-8">
                            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <UploadCloud className="w-10 h-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-3">Upload Electrical Plan</h3>
                            <p className="text-slate-500 mb-8 max-w-md leading-relaxed">
                                Upload a PDF or Image of the electrical blueprint. The AI will scan for symbols (outlets, switches, panels) to start your estimate.
                            </p>
                            <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20">
                                Select File
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* VIEW: WORKSHEET */}
        {activeTab === 'worksheet' && (
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-2">
                             <h2 className="font-bold text-slate-800">Line Items</h2>
                             <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium">{estimate.items.length}</span>
                        </div>
                        <button 
                            onClick={addManualItem} 
                            className="flex items-center space-x-1.5 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Item</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[700px]">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 text-left w-1/3 text-xs font-bold uppercase tracking-wider">Description</th>
                                    <th className="px-4 py-3 text-right w-24 text-xs font-bold uppercase tracking-wider">Qty</th>
                                    <th className="px-4 py-3 text-right w-32 text-xs font-bold uppercase tracking-wider">Mat. Cost ($)</th>
                                    <th className="px-4 py-3 text-right w-32 text-xs font-bold uppercase tracking-wider">Labor (Hrs)</th>
                                    <th className="px-6 py-3 text-right w-40 text-xs font-bold uppercase tracking-wider">Total ($)</th>
                                    <th className="px-4 py-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {estimate.items.map((item) => {
                                    const rowTotal = (item.quantity * item.unitMaterialCost) + (item.quantity * item.unitLaborHours * item.laborRate);
                                    return (
                                        <tr key={item.id} className="group hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-3">
                                                <input 
                                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:ring-0 p-1 font-medium text-slate-800 transition-colors"
                                                    value={item.description}
                                                    onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                                />
                                                {item.materialId && (
                                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-500 font-medium">
                                                        <Check className="w-3 h-3" />
                                                        Database Linked
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="number"
                                                    className="w-full text-right bg-slate-50 border border-slate-200 hover:border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1.5 transition-all tabular-nums font-medium"
                                                    value={item.quantity}
                                                    onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="number"
                                                    className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-500 focus:ring-0 p-1 text-slate-600 tabular-nums"
                                                    value={item.unitMaterialCost}
                                                    onChange={(e) => updateLineItem(item.id, 'unitMaterialCost', Number(e.target.value))}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="number"
                                                    className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-500 focus:ring-0 p-1 text-slate-600 tabular-nums"
                                                    value={item.unitLaborHours}
                                                    onChange={(e) => updateLineItem(item.id, 'unitLaborHours', Number(e.target.value))}
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-right font-bold text-slate-800 tabular-nums">
                                                ${rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button 
                                                    onClick={() => deleteLineItem(item.id)} 
                                                    className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                     {estimate.items.length === 0 && (
                        <div className="p-16 text-center">
                             <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-8 h-8" />
                            </div>
                            <h3 className="text-slate-900 font-semibold">No Items Yet</h3>
                            <p className="text-slate-500 text-sm mt-1 mb-4">Upload a blueprint to auto-detect items or add them manually.</p>
                            <button onClick={addManualItem} className="text-blue-600 font-medium text-sm hover:underline">Add First Item</button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* VIEW: SUMMARY */}
        {activeTab === 'summary' && (
            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                        {/* Paper texture effect */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                        
                        <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900">Estimate Summary</h3>
                                <p className="text-slate-500 text-sm mt-1">Project: {estimate.name}</p>
                                {estimate.client && <p className="text-slate-500 text-sm">Client: {estimate.client}</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Date</p>
                                <p className="font-medium text-slate-700">{new Date().toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center group">
                                <span className="text-slate-600 font-medium">Material Cost</span>
                                <div className="flex-1 mx-4 border-b border-dashed border-slate-200 relative top-1"></div>
                                <span className="font-semibold text-slate-900 tabular-nums">${totalMaterial.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            
                            <div className="flex justify-between items-center group">
                                <span className="text-slate-600 font-medium">Labor Hours</span>
                                <div className="flex-1 mx-4 border-b border-dashed border-slate-200 relative top-1"></div>
                                <span className="font-semibold text-slate-900 tabular-nums">{totalLaborHours.toFixed(2)} hrs</span>
                            </div>

                            <div className="flex justify-between items-center group">
                                <span className="text-slate-600 font-medium">Labor Cost <span className="text-xs text-slate-400 font-normal">(@ ${estimate.laborRate}/hr)</span></span>
                                <div className="flex-1 mx-4 border-b border-dashed border-slate-200 relative top-1"></div>
                                <span className="font-semibold text-slate-900 tabular-nums">${totalLaborCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            
                            <div className="flex justify-between items-center py-3 mt-2">
                                <span className="text-slate-800 font-bold">Subtotal (Prime Cost)</span>
                                <span className="font-bold text-slate-900 tabular-nums">${subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg space-y-3 border border-slate-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600 text-sm">Overhead (10%)</span>
                                    <span className="font-medium text-slate-800 tabular-nums">${overhead.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-600 text-sm">Profit (15%)</span>
                                    <span className="font-medium text-slate-800 tabular-nums">${profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center pt-6 mt-4 border-t-2 border-slate-100">
                                <span className="text-2xl font-bold text-slate-900 tracking-tight">Grand Total</span>
                                <span className="text-3xl font-bold text-emerald-600 tabular-nums">${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80 flex flex-col">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Cost Distribution</h3>
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={70} tick={{fontSize: 12, fill: '#64748b'}} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="font-bold text-lg">Finalize Proposal</h3>
                        </div>
                        <p className="text-blue-100 text-sm mb-6 leading-relaxed">
                            Generate a formal PDF proposal compliant with Miami construction standards. Includes your breakdown and terms.
                        </p>
                        <button className="w-full bg-white text-blue-600 font-bold py-3.5 rounded-lg hover:bg-blue-50 transition shadow-sm">
                            Download Proposal PDF
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
