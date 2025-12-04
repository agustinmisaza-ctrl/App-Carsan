import React, { useState, useRef, useEffect } from 'react';
import { ProjectEstimate, ServiceTicket, ProjectFile } from '../types';
import { Search, Upload, Filter, MapPin, ImageIcon, Phone, Download, FileText, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Pencil, X, Save, Calendar, DollarSign, User, ExternalLink, List, Map as MapIcon, Plus, Eye, FileSpreadsheet, BellRing, Clock, HardHat, CheckCircle, Briefcase, FolderOpen, FileIcon, Loader2, Sparkles, Wrench, Globe, RefreshCw, Link, Settings, AlertTriangle, Copy, Check, Trash2, FileDiff } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProjectMap, getPseudoCoordinates } from './ProjectMap';
import { analyzeSchedule } from '../services/geminiService';
import { searchSharePointSites, getSharePointLists, getListColumns, getListItems, SPSite, SPList, SPColumn, SPItem, downloadSharePointImage } from '../services/sharepointService';
import { getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';

interface ProjectListProps {
  projects: ProjectEstimate[];
  setProjects: (projects: ProjectEstimate[]) => void;
  onOpenProject: (project: ProjectEstimate) => void;
  tickets?: ServiceTicket[];
}

type TabView = 'estimates' | 'ongoing' | 'completed' | 'all';

export const ProjectList: React.FC<ProjectListProps> = ({ projects, setProjects, onOpenProject, tickets = [] }) => {
  const [activeTab, setActiveTab] = useState<TabView>('estimates');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [clientFilter, setClientFilter] = useState<string>('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // Modal States
  const [editingProject, setEditingProject] = useState<ProjectEstimate | null>(null);
  const [previewProject, setPreviewProject] = useState<ProjectEstimate | null>(null);
  
  // SharePoint Sync States
  const [showSharePointModal, setShowSharePointModal] = useState(false);
  const [spStep, setSpStep] = useState<0 | 1 | 2 | 3>(1); 
  const [spSites, setSpSites] = useState<SPSite[]>([]);
  const [spLists, setSpLists] = useState<SPList[]>([]);
  const [spColumns, setSpColumns] = useState<SPColumn[]>([]);
  const [selectedSite, setSelectedSite] = useState<SPSite | null>(null);
  const [selectedList, setSelectedList] = useState<SPList | null>(null);
  const [isLoadingSP, setIsLoadingSP] = useState(false);
  
  // SP Config Inputs
  const [spTenantId, setSpTenantId] = useState('');
  const [spClientId, setSpClientId] = useState('');
  const [spError, setSpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Mapping Config
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({
      name: '',
      client: '',
      status: '',
      value: '',
      image: '',
      address: ''
  });
  
  // Schedule Analysis State
  const [isAnalyzingSchedule, setIsAnalyzingSchedule] = useState(false);

  // File Upload Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const [docCategory, setDocCategory] = useState<ProjectFile['category']>('Other');

  const uniqueEstimators = Array.from(new Set(projects.map(p => p.estimator).filter(Boolean) as string[])).sort();
  const uniqueClients = Array.from(new Set(projects.map(p => p.client).filter(Boolean) as string[])).sort();

  const findValue = (row: any, keys: string[]): any => {
      const rowKeys = Object.keys(row);
      for (const key of keys) {
          if (row[key] !== undefined) return row[key];
          const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
          if (foundKey && row[foundKey] !== undefined) return row[foundKey];
      }
      return undefined;
  };

  const parseDate = (val: any) => {
      if (!val) return undefined;
      if (typeof val === 'number') {
          return new Date(Math.round((val - 25569)*86400*1000)).toISOString();
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
          return d.toISOString();
      }
      return undefined;
  };

  const handleCopyUrl = () => {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  // --- SHAREPOINT LOGIC ---

  const handleInitSharePoint = async () => {
      setShowSharePointModal(true);
      setSpError(null);
      
      const existingTenant = getStoredTenantId();
      const existingClient = getStoredClientId();
      
      if (!existingTenant) {
          setSpTenantId('');
          setSpClientId(existingClient || '');
          setSpStep(0); 
          return;
      }

      setSpStep(1);
      fetchSPSites();
  };

  const handleSaveSPConfig = () => {
      const trimmedTenant = spTenantId.trim();
      if (!trimmedTenant) {
          alert("Tenant ID is required.");
          return;
      }
      setStoredTenantId(trimmedTenant);
      if (spClientId) setStoredClientId(spClientId.trim());
      setSpError(null);
      setSpStep(1);
      fetchSPSites();
  };

  const fetchSPSites = async () => {
      setIsLoadingSP(true);
      try {
          const sites = await searchSharePointSites("");
          setSpSites(sites);
      } catch (e: any) {
          console.error(e);
          const errStr = String(e).toLowerCase();
          
          if (errStr.includes("user_cancelled") || errStr.includes("interaction_in_progress")) {
              console.log("Connection cancelled by user.");
              return;
          }

          if (errStr.includes("aadsts50011")) {
              setSpError(`Redirect URI Mismatch.`);
              setSpStep(0);
              return;
          }
          if (errStr.includes("aadsts50194") || errStr.includes("interaction_required")) {
             setSpError("Authentication failed. Check Tenant ID.");
             setSpStep(0);
          } else {
             alert("Could not connect to SharePoint. Ensure you have granted permissions.");
          }
      } finally {
          setIsLoadingSP(false);
      }
  };

  const handleSiteSelect = async (site: SPSite) => {
      setSelectedSite(site);
      setIsLoadingSP(true);
      try {
          const lists = await getSharePointLists(site.id);
          setSpLists(lists);
          setSpStep(2);
      } catch (e) {
          alert("Failed to load lists.");
      } finally {
          setIsLoadingSP(false);
      }
  };

  const handleListSelect = async (list: SPList) => {
      setSelectedList(list);
      setIsLoadingSP(true);
      try {
          const cols = await getListColumns(selectedSite!.id, list.id);
          setSpColumns(cols);
          
          const guess = { ...fieldMapping };
          cols.forEach((c: SPColumn) => {
              const lower = c.displayName.toLowerCase();
              if (lower.includes('title') || lower.includes('project')) guess.name = c.name;
              if (lower.includes('client') || lower.includes('customer')) guess.client = c.name;
              if (lower.includes('status')) guess.status = c.name;
              if (lower.includes('value') || lower.includes('amount') || lower.includes('price')) guess.value = c.name;
              if (lower.includes('image') || lower.includes('photo') || lower.includes('pic')) guess.image = c.name;
              if (lower.includes('address') || lower.includes('location')) guess.address = c.name;
          });
          setFieldMapping(guess);
          setSpStep(3);
      } catch (e) {
          alert("Failed to load columns.");
      } finally {
          setIsLoadingSP(false);
      }
  };

  const handleSharePointSync = async () => {
      if (!selectedSite || !selectedList) return;
      setIsLoadingSP(true);
      try {
          const items = await getListItems(selectedSite.id, selectedList.id);
          const newProjects: ProjectEstimate[] = [];

          for (const item of items) {
              const fields = item.fields;
              let imageUrl = undefined;
              if (fieldMapping.image && fields[fieldMapping.image]) {
                  const rawImg = fields[fieldMapping.image];
                  if (typeof rawImg === 'string' && rawImg.startsWith('http')) {
                      imageUrl = await downloadSharePointImage(rawImg);
                  } else if (typeof rawImg === 'object' && rawImg.serverRelativeUrl) {
                      const fullUrl = `https://${selectedSite.webUrl.split('/')[2]}${rawImg.serverRelativeUrl}`;
                      imageUrl = await downloadSharePointImage(fullUrl);
                  }
              }

              newProjects.push({
                  id: `sp-${item.id}`,
                  name: fields[fieldMapping.name] || 'Untitled',
                  client: fields[fieldMapping.client] || 'Unknown',
                  status: fields[fieldMapping.status] || 'Draft',
                  contractValue: Number(fields[fieldMapping.value]) || 0,
                  address: fields[fieldMapping.address] || 'Miami, FL',
                  projectImage: imageUrl,
                  dateCreated: new Date().toISOString(),
                  laborRate: 75,
                  items: []
              } as ProjectEstimate);
          }

          setProjects([...projects, ...newProjects]);
          alert(`Synced ${newProjects.length} projects from SharePoint!`);
          setShowSharePointModal(false);
      } catch (e) {
          console.error(e);
          alert("Sync failed.");
      } finally {
          setIsLoadingSP(false);
      }
  };

  const handleUpdateProject = (updatedProject: ProjectEstimate) => {
    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
    if (editingProject && editingProject.id === updatedProject.id) {
        setEditingProject(null);
    }
  };

  const handleInlineUpdate = (id: string, field: keyof ProjectEstimate, value: any) => {
      const updatedProjects = projects.map(p => {
          if (p.id === id) {
              const updated = { ...p, [field]: value };
              if (field === 'status' && value === 'Ongoing' && !p.startDate) {
                  updated.startDate = new Date().toISOString().split('T')[0];
              }
              if (field === 'status' && value === 'Completed' && !p.completionDate) {
                  updated.completionDate = new Date().toISOString().split('T')[0];
              }
              return updated;
          }
          return p;
      });
      setProjects(updatedProjects);
  };

  const handleStartProject = (project: ProjectEstimate) => {
      if (confirm(`Are you sure you want to start "${project.name}"? This will move it to Ongoing Projects.`)) {
          const updated = { 
              ...project, 
              status: 'Ongoing' as const,
              startDate: new Date().toISOString().split('T')[0] 
          };
          setProjects(projects.map(p => p.id === project.id ? updated : p));
          setActiveTab('ongoing');
          setEditingProject(updated); 
      }
  };

  const handleCompleteProject = (project: ProjectEstimate) => {
      if (confirm(`Mark "${project.name}" as completed?`)) {
          const updated = { 
              ...project, 
              status: 'Completed' as const,
              completionDate: new Date().toISOString().split('T')[0] 
          };
          setProjects(projects.map(p => p.id === project.id ? updated : p));
          setActiveTab('completed');
          setEditingProject(null);
      }
  };

  const handleCreateManualProject = () => {
      const newProject: ProjectEstimate = {
          id: Date.now().toString(),
          name: 'New Project',
          client: 'New Client',
          address: 'Miami, FL',
          dateCreated: new Date().toISOString(),
          status: 'Draft',
          laborRate: 75,
          items: []
      };
      setProjects([newProject, ...projects]);
      setEditingProject(newProject);
  };

  const handleDbUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        if (Array.isArray(jsonData) && jsonData.length > 0) {
            const newProjects: ProjectEstimate[] = jsonData.map((row: any, index: number) => {
                const projectImage = findValue(row, ['Image', 'Photo', 'Image URL', 'Project Image']);
                const phone = findValue(row, ['Phone', 'Client Phone', 'Mobile']);
                const email = findValue(row, ['Email', 'Client Email']);
                const contact = [email, phone].filter(Boolean).join(' | ');
                const deliveryDate = parseDate(findValue(row, ['Delivery Date', 'Due Date']));
                const expirationDate = parseDate(findValue(row, ['Expiration Date', 'Valid Until']));
                const awardedDate = parseDate(findValue(row, ['Awarded Date', 'Start Date']));
                let validImage = undefined;
                if (projectImage && (projectImage.startsWith('http') || projectImage.startsWith('data:'))) {
                    validImage = projectImage;
                }
                return {
                    id: Date.now().toString() + index,
                    name: findValue(row, ['Project Name', 'Project', 'Name', 'Title']) || 'Untitled Project',
                    client: findValue(row, ['Client', 'Customer', 'Client Name']) || 'Unknown Client',
                    address: findValue(row, ['Address', 'Location', 'Site']) || 'Miami, FL',
                    city: findValue(row, ['City', 'Town']) || 'Miami',
                    estimator: findValue(row, ['Estimator', 'Owner', 'Salesperson']) || 'Unassigned',
                    contactInfo: contact || findValue(row, ['Contact', 'Contact Info']),
                    dateCreated: new Date().toISOString(),
                    deliveryDate: deliveryDate,
                    expirationDate: expirationDate,
                    awardedDate: awardedDate,
                    status: findValue(row, ['Status', 'Stage']) || 'Draft',
                    contractValue: Number(findValue(row, ['Value', 'Amount', 'Price', 'Total', 'Contract Value']) || 0),
                    projectImage: validImage,
                    laborRate: 75,
                    items: []
                };
            });
            setProjects([...projects, ...newProjects]);
            alert(`Imported ${newProjects.length} projects successfully.`);
        } else {
            alert("File processed but no project data found. Please check column headers against the template.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse Excel file. It might be corrupt or encrypted.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
      const template = [{
              "Project Name": "Example Condo Reno",
              "Client": "John Doe Properties",
              "Client Phone": "305-555-0123",
              "Client Email": "john@example.com",
              "Address": "123 Ocean Dr, Miami FL",
              "City": "Miami",
              "Status": "Draft",
              "Value": 15000,
              "Estimator": "Carlos S.",
              "Delivery Date": "01/25/2024",
              "Expiration Date": "02/25/2024",
              "Awarded Date": "",
              "Image URL": "https://example.com/photo.jpg"
      }];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Projects Template");
      XLSX.writeFile(workbook, "Carsan_Projects_Import_Template.xlsx");
  };

  const handleUploadDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editingProject) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const base64 = evt.target?.result as string;
          if (docCategory === 'Plan') {
              const updated = { ...editingProject, blueprintImage: base64 };
              handleUpdateProject(updated);
          } else {
              const newDoc: ProjectFile = {
                  id: Date.now().toString(),
                  name: file.name,
                  category: docCategory,
                  uploadDate: new Date().toISOString(),
                  fileData: base64,
                  fileType: file.type
              };
              const updated = { 
                  ...editingProject, 
                  projectFiles: [...(editingProject.projectFiles || []), newDoc] 
              };
              handleUpdateProject(updated);
          }
      };
      reader.readAsDataURL(file);
  };

  const handleAnalyzeSchedule = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editingProject) return;
      setIsAnalyzingSchedule(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const base64 = evt.target?.result as string;
          try {
              const analysis = await analyzeSchedule(base64);
              const updated = { 
                  ...editingProject, 
                  scheduleFile: base64,
                  scheduleMilestones: analysis
              };
              handleUpdateProject(updated);
          } catch (err) {
              alert("Failed to analyze schedule.");
          } finally {
              setIsAnalyzingSchedule(false);
          }
      };
      reader.readAsDataURL(file);
  };

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const getProjectValue = (p: ProjectEstimate) => {
      if (p.contractValue) return p.contractValue;
      const mat = p.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
      const lab = p.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * i.laborRate), 0);
      const sub = mat + lab;
      return sub + (sub * 0.25); 
  };

  const getFollowUpDate = (p: ProjectEstimate) => {
      if (p.followUpDate) return new Date(p.followUpDate);
      if (p.deliveryDate) {
          const d = new Date(p.deliveryDate);
          d.setDate(d.getDate() + 7);
          return d;
      }
      return null;
  };

  const filteredProjects = projects
    .filter(p => {
        if (activeTab === 'ongoing') return p.status === 'Ongoing';
        if (activeTab === 'completed') return p.status === 'Completed';
        if (activeTab === 'estimates') return ['Draft', 'Sent', 'Won', 'Lost', 'Finalized'].includes(p.status);
        return true; 
    })
    .filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.address.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(p => statusFilter === 'All' || p.status === statusFilter)
    .filter(p => clientFilter === 'All' || p.client === clientFilter);

  if (sortConfig) {
      filteredProjects.sort((a, b) => {
          let valA: any = a[sortConfig.key as keyof ProjectEstimate];
          let valB: any = b[sortConfig.key as keyof ProjectEstimate];
          if (sortConfig.key === 'value') {
              valA = getProjectValue(a);
              valB = getProjectValue(b);
          } 
          else if (sortConfig.key === 'timeline') {
              valA = new Date(a.dateCreated).getTime();
              valB = new Date(b.dateCreated).getTime();
          }
          else if (sortConfig.key === 'followUp') {
              const da = getFollowUpDate(a);
              const db = getFollowUpDate(b);
              valA = da ? da.getTime() : 0;
              valB = db ? db.getTime() : 0;
          }
          else if (typeof valA === 'string') {
              valA = valA.toLowerCase();
              valB = valB.toLowerCase();
          }
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }

  const handleFilePreview = (project: ProjectEstimate) => {
      setPreviewProject(project);
  };

  const activeChangeOrders = (projectId: string) => tickets.filter(t => t.projectId === projectId);

  const handleClearProjects = () => {
      if (confirm("Are you sure you want to clear the entire Project Database? This cannot be undone.")) {
          setProjects([]);
          alert("Database cleared.");
      }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      {/* ... Header and Filters same as v7.3 ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              {activeTab === 'ongoing' ? 'Project Management' : activeTab === 'completed' ? 'Project Archives' : 'Estimates'}
          </h1>
          <p className="text-slate-500 mt-1">
              {activeTab === 'ongoing' ? 'Track progress, permits, and schedules.' : 'Manage your estimating pipeline.'}
          </p>
        </div>
        
        <div className="bg-slate-100 p-1 rounded-lg flex overflow-x-auto max-w-full">
            <button onClick={() => {setActiveTab('estimates'); setStatusFilter('All');}} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'estimates' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Estimates</button>
            <button onClick={() => {setActiveTab('ongoing'); setStatusFilter('All');}} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'ongoing' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Ongoing</button>
            <button onClick={() => {setActiveTab('completed'); setStatusFilter('All');}} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'completed' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Completed</button>
            <button onClick={() => {setActiveTab('all'); setStatusFilter('All');}} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'all' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search projects, clients, addresses..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto items-center">
            {activeTab !== 'ongoing' && activeTab !== 'completed' && (
                <select 
                    className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="All">All Statuses</option>
                    {activeTab === 'estimates' || activeTab === 'all' ? (
                        <>
                            <option value="Draft">Draft</option>
                            <option value="Sent">Sent</option>
                            <option value="Won">Won</option>
                            <option value="Lost">Lost</option>
                        </>
                    ) : null}
                    {activeTab === 'all' && (
                        <>
                            <option value="Ongoing">Ongoing</option>
                            <option value="Completed">Completed</option>
                        </>
                    )}
                </select>
            )}

            <select 
                className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700 outline-none focus:border-blue-500 cursor-pointer max-w-[150px]"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
            >
                <option value="All">All Clients</option>
                {uniqueClients.map(client => (
                    <option key={client} value={client}>{client}</option>
                ))}
            </select>

            <div className="h-10 w-px bg-slate-200 mx-1 hidden md:block"></div>

            <button 
                onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                className={`p-2.5 rounded-lg border transition-colors ${viewMode === 'map' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                title="Toggle Map View"
            >
                {viewMode === 'list' ? <MapIcon className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </button>
            
            <div className="flex items-center gap-1">
                <label className="flex items-center p-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors" title="Import Excel">
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                    <input type="file" accept=".xlsx, .xls" onChange={handleDbUpload} className="hidden" />
                </label>
                
                <button 
                    onClick={handleInitSharePoint}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
                    title="Sync SharePoint"
                >
                    <Globe className="w-5 h-5 text-indigo-600" />
                </button>

                <button 
                    onClick={handleDownloadTemplate}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
                    title="Download Template"
                >
                    <Download className="w-5 h-5 text-blue-600" />
                </button>

                <button 
                    onClick={handleClearProjects}
                    className="p-2.5 rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50 transition-colors"
                    title="Clear Database"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            <button 
                onClick={handleCreateManualProject}
                className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 flex items-center gap-2 shadow-sm whitespace-nowrap"
            >
                <Plus className="w-4 h-4" /> <span className="hidden md:inline">New Project</span>
            </button>
        </div>
      </div>

      {/* ... (Map and Table Render Logic - Same as previous v7.3 ProjectList) ... */}
      {viewMode === 'map' ? (
          <div className="flex-1 min-h-[500px] bg-white rounded-xl shadow-sm border border-slate-200 p-1">
              <ProjectMap projects={filteredProjects} />
          </div>
      ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1 custom-scrollbar">
                <table className="w-full text-left text-sm min-w-[1000px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4 w-16">Image</th>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('name')}><div className="flex items-center gap-1">Project <ArrowUpDown className="w-3 h-3"/></div></th>
                            <th className="px-6 py-4">Client</th>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('value')}><div className="flex items-center gap-1">Value <ArrowUpDown className="w-3 h-3"/></div></th>
                            <th className="px-6 py-4 text-center">Status</th>
                            <th className="px-6 py-4 w-32">Estimator</th>
                            <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('timeline')}><div className="flex items-center gap-1">Timeline <ArrowUpDown className="w-3 h-3"/></div></th>
                            {(activeTab === 'estimates' || activeTab === 'all') && (<th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition" onClick={() => handleSort('followUp')}><div className="flex items-center gap-1">Follow Up <ArrowUpDown className="w-3 h-3"/></div></th>)}
                            <th className="px-6 py-4 text-center sticky right-0 bg-slate-50">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredProjects.map((project) => {
                            const value = getProjectValue(project);
                            const followUp = getFollowUpDate(project);
                            const isUrgent = followUp && new Date() > followUp;
                            const isWonOrLost = project.status === 'Won' || project.status === 'Lost' || project.status === 'Completed';
                            return (
                                <tr key={project.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-3">
                                        <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer hover:ring-2 ring-blue-500 transition relative" onClick={() => setEditingProject(project)}>
                                            {project.projectImage ? <img src={project.projectImage} alt="Project" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSIvPjwvc3ZnPg=='; }} /> : <ImageIcon className="w-5 h-5 text-slate-400" />}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3"><div className="font-semibold text-slate-900">{project.name}</div><div className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{project.city || 'Miami'}</div></td>
                                    <td className="px-6 py-3"><div className="font-medium text-slate-700">{project.client}</div><div className="text-xs text-slate-400 truncate max-w-[150px]">{project.contactInfo}</div></td>
                                    <td className="px-6 py-3 font-bold text-slate-900 tabular-nums">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="px-6 py-3 text-center">
                                        <select value={project.status} onChange={(e) => handleInlineUpdate(project.id, 'status', e.target.value)} className={`text-xs font-bold px-2 py-1 rounded-full border-none outline-none cursor-pointer appearance-none text-center w-24 ${project.status === 'Won' ? 'bg-emerald-100 text-emerald-700' : project.status === 'Lost' ? 'bg-red-100 text-red-700' : project.status === 'Sent' ? 'bg-blue-100 text-blue-700' : project.status === 'Ongoing' ? 'bg-indigo-100 text-indigo-700' : project.status === 'Completed' ? 'bg-slate-200 text-slate-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                            <option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Won">Won</option><option value="Lost">Lost</option><option value="Ongoing">Ongoing</option><option value="Completed">Completed</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-3 w-32">
                                        <select value={project.estimator || ''} onChange={(e) => handleInlineUpdate(project.id, 'estimator', e.target.value)} className="text-xs text-slate-600 bg-transparent border-none outline-none cursor-pointer w-full truncate">
                                            <option value="">Unassigned</option>{uniqueEstimators.map(est => <option key={est} value={est}>{est}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex flex-col gap-1">
                                            {project.status === 'Won' && project.awardedDate ? <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">Won: {new Date(project.awardedDate).toLocaleDateString()}</span> : <><span className="text-xs text-slate-500">Due: {project.deliveryDate ? new Date(project.deliveryDate).toLocaleDateString() : '-'}</span><span className="text-xs text-slate-400">Exp: {project.expirationDate ? new Date(project.expirationDate).toLocaleDateString() : '-'}</span></>}
                                        </div>
                                    </td>
                                    {(activeTab === 'estimates' || activeTab === 'all') && (<td className="px-6 py-3">{!isWonOrLost && followUp ? <div className={`flex items-center gap-1.5 text-xs font-medium ${isUrgent ? 'text-orange-600' : 'text-slate-500'}`}><Clock className="w-3.5 h-3.5" />{followUp.toLocaleDateString()}</div> : <span className="text-xs text-slate-300">-</span>}</td>)}
                                    <td className="px-6 py-3 sticky right-0 bg-white">
                                        <div className="flex items-center justify-center gap-2">
                                            {(project.blueprintImage || project.quantityTableFile) && <button onClick={() => handleFilePreview(project)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition"><Eye className="w-4 h-4" /></button>}
                                            <button onClick={() => setEditingProject(project)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => onOpenProject(project)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded transition"><ChevronRight className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
          </div>
      )}

      {/* --- MODALS --- */}
      
      {/* Edit Project Modal */}
      {editingProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-20">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{editingProject.id.startsWith('sp-') ? 'View SharePoint Project' : 'Edit Project'}</h2>
                        <p className="text-xs text-slate-500">{editingProject.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                          <button onClick={() => handleStartProject(editingProject)} className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-bold hover:bg-emerald-200">Start Project</button>
                          <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                      </div>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Project Name</label>
                              <input 
                                  value={editingProject.name} 
                                  onChange={(e) => setEditingProject({...editingProject, name: e.target.value})}
                                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-medium"
                              />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Client</label>
                                <input value={editingProject.client} onChange={(e) => setEditingProject({...editingProject, client: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                                <select value={editingProject.status} onChange={(e) => setEditingProject({...editingProject, status: e.target.value as any})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm">
                                    <option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Won">Won</option><option value="Ongoing">Ongoing</option><option value="Completed">Completed</option>
                                </select>
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                              <input value={editingProject.address} onChange={(e) => setEditingProject({...editingProject, address: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" />
                          </div>
                          
                          <div className="border-t border-slate-100 pt-4 mt-4">
                              <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4"/> Project Documents</h3>
                              <div className="flex gap-2 mb-3">
                                  <select className="text-xs border rounded px-2 py-1" value={docCategory} onChange={(e) => setDocCategory(e.target.value as any)}>
                                      <option value="Plan">Plan/Blueprint</option><option value="Permit">Permit</option><option value="Inspection">Inspection</option><option value="Other">Other</option>
                                  </select>
                                  <button onClick={() => docInputRef.current?.click()} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100">+ Upload</button>
                                  <input type="file" ref={docInputRef} className="hidden" onChange={handleUploadDoc} />
                              </div>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                  {editingProject.projectFiles?.map((file) => (
                                      <div key={file.id} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded border border-slate-100">
                                          <div className="flex items-center gap-2">
                                              <FileIcon className="w-3 h-3 text-slate-400" />
                                              <span className="truncate max-w-[150px] font-medium">{file.name}</span>
                                              <span className="text-slate-400 text-[10px]">{file.category}</span>
                                          </div>
                                          <a href={file.fileData} download={file.name} className="text-blue-500 hover:underline">Download</a>
                                      </div>
                                  ))}
                                  {!editingProject.projectFiles?.length && <p className="text-xs text-slate-400 italic">No files attached.</p>}
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4">
                           <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                               {editingProject.projectImage || editingProject.blueprintImage ? (
                                   <img src={editingProject.projectImage || editingProject.blueprintImage} className="w-full h-40 object-cover rounded-lg mb-2" />
                               ) : (
                                   <div className="w-full h-40 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 mb-2"><ImageIcon className="w-8 h-8"/></div>
                               )}
                               <button className="text-xs text-blue-600 font-bold" onClick={() => fileInputRef.current?.click()}>Change Cover Image</button>
                               <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                                   const f = e.target.files?.[0];
                                   if (f) {
                                       const r = new FileReader();
                                       r.onload = (ev) => setEditingProject({...editingProject, projectImage: ev.target?.result as string});
                                       r.readAsDataURL(f);
                                   }
                               }} />
                           </div>

                           <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                               <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2"><Calendar className="w-4 h-4"/> Schedule & Milestones</h3>
                               {editingProject.scheduleMilestones ? (
                                   <div className="text-xs bg-slate-50 p-3 rounded border border-slate-100 whitespace-pre-wrap max-h-32 overflow-y-auto mb-2">
                                       {editingProject.scheduleMilestones}
                                   </div>
                               ) : (
                                   <div className="text-center py-4 bg-slate-50 rounded border border-dashed border-slate-200 mb-2">
                                       <p className="text-xs text-slate-400">No schedule analyzed yet.</p>
                                   </div>
                               )}
                               <div className="flex gap-2">
                                   <button 
                                      onClick={() => scheduleInputRef.current?.click()} 
                                      className="flex-1 bg-slate-800 text-white text-xs py-2 rounded font-bold hover:bg-slate-700 flex items-center justify-center gap-1"
                                      disabled={isAnalyzingSchedule}
                                    >
                                       {isAnalyzingSchedule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-400" />}
                                       Upload & Analyze Schedule
                                   </button>
                                   <input type="file" ref={scheduleInputRef} className="hidden" accept=".pdf,image/*" onChange={handleAnalyzeSchedule} />
                               </div>
                           </div>
                           
                           {/* Change Orders Mini View */}
                           <div>
                               <h3 className="font-bold text-slate-800 mb-2 text-sm">Change Orders</h3>
                               <div className="space-y-1">
                                   {activeChangeOrders(editingProject.id).map(t => (
                                       <div key={t.id} className="flex justify-between text-xs p-2 bg-slate-50 rounded border border-slate-100">
                                           <span>{t.id} - {t.status}</span>
                                           <span className="font-bold">${t.items.reduce((s,i) => s + (i.quantity * i.unitMaterialCost) + (i.quantity * i.unitLaborHours * t.laborRate), 0).toFixed(0)}</span>
                                       </div>
                                   ))}
                                   {activeChangeOrders(editingProject.id).length === 0 && <p className="text-xs text-slate-400 italic">No change orders.</p>}
                               </div>
                           </div>
                      </div>
                  </div>
                  
                  <div className="p-4 border-t border-slate-100 bg-slate-50 sticky bottom-0 flex justify-between items-center z-20">
                      <div className="text-xs text-slate-500">
                          Last Updated: {new Date().toLocaleDateString()}
                      </div>
                      <div className="flex gap-3">
                          <button onClick={() => setEditingProject(null)} className="px-4 py-2 text-slate-600 font-bold text-sm">Cancel</button>
                          <button onClick={() => handleUpdateProject(editingProject)} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 shadow-sm flex items-center gap-2">
                              <Save className="w-4 h-4" /> Save Changes
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* SharePoint Sync Modal */}
      {showSharePointModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="bg-slate-900 p-4 flex items-center justify-between">
                      <h3 className="font-bold text-white flex items-center gap-2"><Globe className="w-5 h-5" /> SharePoint Sync</h3>
                      <button onClick={() => setShowSharePointModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
                  </div>
                  
                  <div className="p-6">
                      {spStep === 0 && (
                          <div className="space-y-4">
                             <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 border border-blue-100">
                                 <p className="font-bold">Setup Required</p>
                                 <p>Please provide your Azure AD Tenant ID to connect.</p>
                                 <p className="mt-2 text-[10px]">Redirect URI: <code>{window.location.origin}</code></p>
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tenant ID</label>
                                 <input value={spTenantId} onChange={(e) => setSpTenantId(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="e.g. 555-..." />
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Client ID (Optional)</label>
                                 <input value={spClientId} onChange={(e) => setSpClientId(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="Leave blank for default" />
                             </div>
                             {spError && <p className="text-red-500 text-xs font-bold">{spError}</p>}
                             <button onClick={handleSaveSPConfig} className="w-full bg-blue-600 text-white py-2 rounded font-bold text-sm mt-2">Connect</button>
                          </div>
                      )}

                      {spStep === 1 && (
                          <div className="space-y-3">
                              <p className="text-sm font-bold text-slate-700">Select a Site</p>
                              {isLoadingSP ? <div className="py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500"/></div> : (
                                  <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2">
                                      {spSites.map(site => (
                                          <div key={site.id} onClick={() => handleSiteSelect(site)} className="p-2 hover:bg-blue-50 rounded cursor-pointer border-b last:border-0 border-slate-50">
                                              <p className="font-bold text-sm text-slate-800">{site.displayName}</p>
                                              <p className="text-xs text-slate-400 truncate">{site.webUrl}</p>
                                          </div>
                                      ))}
                                      {spSites.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No sites found. Check permissions.</p>}
                                  </div>
                              )}
                              <button onClick={() => setSpStep(0)} className="text-xs text-slate-400 hover:text-slate-600">Back to Config</button>
                          </div>
                      )}

                      {spStep === 2 && (
                          <div className="space-y-3">
                              <p className="text-sm font-bold text-slate-700">Select List from <strong>{selectedSite?.displayName}</strong></p>
                              {isLoadingSP ? <div className="py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500"/></div> : (
                                  <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2">
                                      {spLists.map(list => (
                                          <div key={list.id} onClick={() => handleListSelect(list)} className="p-2 hover:bg-blue-50 rounded cursor-pointer border-b last:border-0 border-slate-50 flex items-center gap-2">
                                              <List className="w-4 h-4 text-slate-400" />
                                              <span className="font-bold text-sm text-slate-800">{list.displayName}</span>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              <button onClick={() => setSpStep(1)} className="text-xs text-slate-400 hover:text-slate-600">Back to Sites</button>
                          </div>
                      )}

                      {spStep === 3 && (
                          <div className="space-y-4">
                              <p className="text-sm font-bold text-slate-700">Map Columns for <strong>{selectedList?.displayName}</strong></p>
                              {isLoadingSP ? <Loader2 className="animate-spin" /> : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                      {Object.keys(fieldMapping).map(field => (
                                          <div key={field} className="grid grid-cols-2 gap-2 items-center">
                                              <label className="text-xs font-bold text-slate-500 uppercase">{field}</label>
                                              <select 
                                                  className="text-xs border rounded p-1"
                                                  value={fieldMapping[field]}
                                                  onChange={(e) => setFieldMapping({...fieldMapping, [field]: e.target.value})}
                                              >
                                                  <option value="">(Skip)</option>
                                                  {spColumns.map(c => <option key={c.name} value={c.name}>{c.displayName}</option>)}
                                              </select>
                                          </div>
                                      ))}
                                  </div>
                              )}
                              <button onClick={handleSharePointSync} disabled={isLoadingSP} className="w-full bg-emerald-600 text-white py-2 rounded font-bold text-sm shadow-sm hover:bg-emerald-700 flex justify-center items-center gap-2">
                                  {isLoadingSP ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                  Start Sync
                              </button>
                              <button onClick={() => setSpStep(2)} className="text-xs text-slate-400 hover:text-slate-600 block mx-auto">Back to Lists</button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Preview Modal */}
      {previewProject && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewProject(null)}>
              <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center">
                 <button className="absolute -top-10 right-0 text-white hover:text-slate-300" onClick={() => setPreviewProject(null)}><X className="w-8 h-8" /></button>
                 <img src={previewProject.blueprintImage || previewProject.projectImage} className="max-w-full max-h-[85vh] rounded shadow-2xl object-contain bg-white" alt="Preview" />
                 <p className="text-white mt-4 font-bold text-lg">{previewProject.name}</p>
              </div>
          </div>
      )}

    </div>
  );
};