import React, { useState } from 'react';
import { MaterialItem } from '../types';
import { Plus, Trash2, Upload, Search, Download, Sparkles, Filter, Database, CheckCircle, BrainCircuit } from 'lucide-react';
import * as XLSX from 'xlsx';
import { MIAMI_STANDARD_PRICES } from '../utils/miamiStandards';

interface PriceDatabaseProps {
  materials: MaterialItem[];
  setMaterials: (items: MaterialItem[]) => void;
}

export const PriceDatabase: React.FC<PriceDatabaseProps> = ({ materials, setMaterials }) => {
  const [newMaterial, setNewMaterial] = useState<Partial<MaterialItem>>({
    name: '',
    category: 'General',
    unit: 'EA',
    materialCost: 0,
    laborHours: 0,
    source: 'Real'
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'AI' | 'Real'>('All');

  const filteredMaterials = materials
    .filter(item => 
        (activeFilter === 'All' || item.source === activeFilter) &&
        (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         item.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const handleAdd = () => {
    if (!newMaterial.name) return;
    // Ensure source is explicitly typed to match the MaterialItem union type
    const item: MaterialItem = {
      id: Date.now().toString(),
      name: newMaterial.name,
      category: newMaterial.category || 'General',
      unit: newMaterial.unit || 'EA',
      materialCost: Number(newMaterial.materialCost) || 0,
      laborHours: Number(newMaterial.laborHours) || 0,
      source: 'Real' as const
    };
    setMaterials([...materials, item]);
    setNewMaterial({ name: '', category: 'General', unit: 'EA', materialCost: 0, laborHours: 0, source: 'Real' });
  };

  const handleImportAI = () => {
      const existingIds = new Set(materials.map(m => m.id));
      const toAdd = MIAMI_STANDARD_PRICES.filter(p => !existingIds.has(p.id));
      
      if (toAdd.length === 0) {
          alert("All AI Standard prices are already in your database.");
          return;
      }
      
      setMaterials([...materials, ...toAdd]);
      alert(`Imported ${toAdd.length} standard Miami industry items.`);
  };

  const handleDelete = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        if (Array.isArray(jsonData)) {
            // Fix: Cast 'source' to 'Real' as const to satisfy MaterialItem['source'] type constraint ('AI' | 'Real')
            const newItems: MaterialItem[] = jsonData.map((row: any, index: number) => ({
                id: Date.now().toString() + index,
                name: row['Item Name'] || row['Name'] || row['Description'] || 'Unknown Item',
                category: row['Category'] || row['Cat'] || 'General',
                unit: row['Unit'] || row['UOM'] || 'EA',
                materialCost: Number(row['Material Cost'] || row['Cost'] || row['Price'] || 0),
                laborHours: Number(row['Labor Hours'] || row['Labor'] || row['Hours'] || 0),
                source: 'Real' as const
            })).filter(item => item.name !== 'Unknown Item');

            setMaterials([...materials, ...newItems]);
            alert(`Imported ${newItems.length} items successfully as Real Prices.`);
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse Excel file. Ensure headers are: Category, Item Name, Unit, Material Cost, Labor Hours.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExport = (itemsToExport: MaterialItem[], filename: string) => {
    const data = itemsToExport.map(item => ({
        'ID': item.id,
        'Source': item.source,
        'Category': item.category,
        'Item Name': item.name,
        'Unit': item.unit,
        'Material Cost': item.materialCost,
        'Labor Hours': item.laborHours
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price Database");
    XLSX.writeFile(workbook, filename);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Price Database</h1>
          <p className="text-slate-500 mt-1">Manage material costs. AI standards are based on Miami supplier averages.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button 
                onClick={handleImportAI}
                className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700 shadow-md transition-all text-sm font-bold"
            >
                <Sparkles className="w-4 h-4" />
                <span>Load AI Standards (Miami)</span>
            </button>
            <button 
                onClick={() => handleExport(materials, 'carsan_price_database.xlsx')}
                className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-colors text-sm font-medium"
            >
                <Download className="w-4 h-4" />
                <span>Export All</span>
            </button>
            <div className="relative flex-1 md:flex-none">
                 <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <button className="flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-colors w-full text-sm font-medium">
                    <Upload className="w-4 h-4" />
                    <span>Import Real Prices</span>
                 </button>
            </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 w-fit">
          <button 
            onClick={() => setActiveFilter('All')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeFilter === 'All' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            All Items
          </button>
          <button 
            onClick={() => setActiveFilter('AI')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeFilter === 'AI' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <BrainCircuit className="w-4 h-4" /> AI Prices
          </button>
          <button 
            onClick={() => setActiveFilter('Real')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeFilter === 'Real' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Database className="w-4 h-4" /> Real Prices
          </button>
      </div>

      {/* Add New Item Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-500" />
            Add Custom Price (Real)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-2 md:col-span-4">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-0.5">Item Name</label>
            <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm transition-all"
                placeholder="e.g. Duplex Receptacle 15A"
                value={newMaterial.name}
                onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
            />
            </div>
            <div className="sm:col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-0.5">Category</label>
            <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm bg-white"
                value={newMaterial.category}
                onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value })}
            >
                <option value="General">General</option>
                <option value="Rough-in">Rough-in</option>
                <option value="Trim">Trim</option>
                <option value="Distribution">Distribution</option>
                <option value="Lighting">Lighting</option>
                <option value="Low Voltage">Low Voltage</option>
                <option value="Fasteners">Fasteners</option>
                <option value="Wire">Wire</option>
                <option value="Grounding">Grounding</option>
                <option value="Enclosures">Enclosures</option>
            </select>
            </div>
            <div className="sm:col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-0.5">Unit</label>
            <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm bg-white"
                value={newMaterial.unit}
                onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
            >
                <option value="EA">EA</option>
                <option value="FT">FT</option>
                <option value="RL">RL</option>
                <option value="BOX">BOX</option>
                <option value="C">C (100)</option>
                <option value="M">M (1000)</option>
                <option value="HR">HR</option>
            </select>
            </div>
            <div className="sm:col-span-1 md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-0.5">Cost ($)</label>
            <input
                type="number"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                value={newMaterial.materialCost}
                onChange={(e) => setNewMaterial({ ...newMaterial, materialCost: parseFloat(e.target.value) })}
            />
            </div>
            <div className="sm:col-span-1 md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-0.5">Labor (Hrs)</label>
            <input
                type="number"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                value={newMaterial.laborHours}
                onChange={(e) => setNewMaterial({ ...newMaterial, laborHours: parseFloat(e.target.value) })}
            />
            </div>
            <div className="sm:col-span-2 md:col-span-2">
            <button
                onClick={handleAdd}
                className="w-full flex items-center justify-center space-x-1 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow-sm font-bold text-sm"
            >
                <span>Add custom</span>
            </button>
            </div>
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input 
            type="text" 
            placeholder="Search database by item or category..." 
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[800px]">
                <thead className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-200 uppercase text-xs tracking-wider">
                    <tr>
                    <th className="px-6 py-4">Source</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Item Name</th>
                    <th className="px-6 py-4">Unit</th>
                    <th className="px-6 py-4 text-right">Material Cost</th>
                    <th className="px-6 py-4 text-right">Labor Hours</th>
                    <th className="px-6 py-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredMaterials.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-3.5">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border flex items-center w-fit gap-1 ${
                                item.source === 'AI' 
                                ? 'bg-blue-50 text-blue-700 border-blue-100' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            }`}>
                                {item.source === 'AI' ? <Sparkles className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                                {item.source} Price
                            </span>
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 font-medium">{item.category}</td>
                        <td className="px-6 py-3.5 font-semibold text-slate-900">{item.name}</td>
                        <td className="px-6 py-3.5 text-slate-500">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold border border-slate-200">
                                {item.unit}
                            </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-medium tabular-nums text-slate-900">${item.materialCost.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-right font-medium tabular-nums text-slate-600">{item.laborHours.toFixed(2)}</td>
                        <td className="px-6 py-3.5 text-center">
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-all">
                            <Trash2 className="w-4 h-4" />
                        </button>
                        </td>
                    </tr>
                    ))}
                    {filteredMaterials.length === 0 && (
                    <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 bg-slate-50/30">
                            {searchTerm ? "No matching items found." : "No items in database. Use 'Load AI Standards' to pre-populate industry prices."}
                        </td>
                    </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};