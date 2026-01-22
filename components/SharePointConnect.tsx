
import React, { useState, useEffect } from 'react';
import { Search, Database, Loader2, Link as LinkIcon, CheckCircle, RefreshCw, ChevronRight, LayoutList, Settings2, Save, Filter, Settings, LogIn, FileText, Briefcase, Users } from 'lucide-react';
import { searchSharePointSites, getSharePointLists, getListColumns, fetchMappedListItems, fetchMappedTickets, fetchMappedLeads, SPSite, SPList, SPColumn } from '../services/sharepointService';
import { ProjectMapping, TicketMapping, LeadMapping, ProjectEstimate, MaterialItem, ServiceTicket, PurchaseRecord, Lead } from '../types';
import { getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';

interface SharePointConnectProps {
    projects: ProjectEstimate[];
    setProjects: (projects: ProjectEstimate[]) => void;
    materials?: MaterialItem[];
    tickets?: ServiceTicket[];
    setTickets?: (tickets: ServiceTicket[]) => void;
    purchases?: PurchaseRecord[];
    setPurchases?: (purchases: PurchaseRecord[]) => void;
    leads?: Lead[];
    setLeads?: (leads: Lead[]) => void;
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, setProjects, materials, tickets, setTickets, purchases, setPurchases, leads, setLeads }) => {
    const [importMode, setImportMode] = useState<'projects' | 'tickets' | 'leads'>('projects');
    const [step, setStep] = useState<0 | 1 | 2>(0); 
    const [sites, setSites] = useState<SPSite[]>([]);
    const [lists, setLists] = useState<SPList[]>([]);
    const [columns, setColumns] = useState<SPColumn[]>([]);
    const [selectedSite, setSelectedSite] = useState<SPSite | null>(null);
    const [selectedList, setSelectedList] = useState<SPList | null>(null);
    
    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [tenantId, setTenantId] = useState(getStoredTenantId() || '');
    const [clientId, setClientId] = useState(getStoredClientId() || '');

    // Mappings
    const [projectMapping, setProjectMapping] = useState<ProjectMapping>(() => {
        const saved = localStorage.getItem('carsan_sp_mapping');
        return saved ? JSON.parse(saved) : {
            name: 'Title', client: '', status: '', contractValue: '', address: '', estimator: '', dateCreated: '', awardedDate: '', area: ''
        };
    });

    const [ticketMapping, setTicketMapping] = useState<TicketMapping>(() => {
        const saved = localStorage.getItem('carsan_sp_ticket_mapping');
        return saved ? JSON.parse(saved) : {
            title: 'Title', client: '', status: '', amount: '', dateCreated: '', projectName: ''
        };
    });

    const [leadMapping, setLeadMapping] = useState<LeadMapping>(() => {
        const saved = localStorage.getItem('carsan_sp_lead_mapping');
        return saved ? JSON.parse(saved) : {
            name: 'Title', email: '', phone: '', company: '', notes: ''
        };
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (getStoredClientId()) {
            handleSearchSites(true);
        } else {
            setShowSettings(true);
        }
    }, []);

    const handleSearchSites = async (isAuto = false) => {
        setIsLoading(true);
        setError(null);
        try {
            const results = await searchSharePointSites("");
            setSites(results);
        } catch (e: any) {
            console.error("SharePoint Search Error:", e);
            let msg = e.message || "Error al buscar sitios.";
            if (isAuto && (msg.includes("interaction") || msg.includes("popup") || msg.toLowerCase().includes("failed to fetch"))) {
                 msg = "Se requiere iniciar sesión. Por favor haz clic en 'Conectar' para autorizar.";
            }
            setError(msg);
            if (e.message?.includes('Client ID')) {
                setShowSettings(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleReconnect = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Force interactive login
            const results = await searchSharePointSites("", true);
            setSites(results);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSettings = () => {
        setStoredTenantId(tenantId.trim());
        setStoredClientId(clientId.trim());
        setShowSettings(false);
        setError(null);
        handleSearchSites(false); 
    };

    const handleSelectSite = async (site: SPSite) => {
        setSelectedSite(site);
        setIsLoading(true);
        try {
            const results = await getSharePointLists(site.id);
            setLists(results);
            setStep(1);
        } catch (e: any) {
            setError(e.message || "No se pudieron cargar las listas de este sitio.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectList = async (list: SPList) => {
        setSelectedList(list);
        setIsLoading(true);
        try {
            const cols = await getListColumns(selectedSite!.id, list.id);
            setColumns(cols);
            
            if (importMode === 'projects') {
                const autoMap = { ...projectMapping };
                cols.forEach(c => {
                    const name = c.displayName.toLowerCase();
                    if (name.includes('nombre') || name.includes('proyecto') || name.includes('project') || name.includes('titulo')) autoMap.name = c.name;
                    if (name.includes('cliente') || name.includes('customer')) autoMap.client = c.name;
                    if (name.includes('estado') || name.includes('status') || name.includes('etapa')) autoMap.status = c.name;
                    if (name.includes('valor') || name.includes('value') || name.includes('monto')) autoMap.contractValue = c.name;
                    if (name.includes('direccion') || name.includes('address')) autoMap.address = c.name;
                    if (name.includes('area')) autoMap.area = c.name;
                });
                setProjectMapping(autoMap);
            } else if (importMode === 'tickets') {
                 const autoMap = { ...ticketMapping };
                 cols.forEach(c => {
                    const name = c.displayName.toLowerCase();
                    if (name.includes('descripcion') || name.includes('description') || name.includes('titulo')) autoMap.title = c.name;
                    if (name.includes('cliente') || name.includes('customer')) autoMap.client = c.name;
                    if (name.includes('estado') || name.includes('status')) autoMap.status = c.name;
                    if (name.includes('monto') || name.includes('amount') || name.includes('total')) autoMap.amount = c.name;
                    if (name.includes('proyecto') || name.includes('project')) autoMap.projectName = c.name;
                 });
                 setTicketMapping(autoMap);
            } else if (importMode === 'leads') {
                const autoMap = { ...leadMapping };
                cols.forEach(c => {
                    const name = c.displayName.toLowerCase();
                    if (name.includes('nombre') || name.includes('name') || name.includes('contacto')) autoMap.name = c.name;
                    if (name.includes('email') || name.includes('correo')) autoMap.email = c.name;
                    if (name.includes('telefono') || name.includes('phone') || name.includes('movil')) autoMap.phone = c.name;
                    if (name.includes('empresa') || name.includes('company')) autoMap.company = c.name;
                    if (name.includes('nota') || name.includes('descrip')) autoMap.notes = c.name;
                });
                setLeadMapping(autoMap);
            }
            setStep(2);
        } catch (e: any) {
            setError(e.message || "No se pudieron obtener las columnas de la lista.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveMappingAndSync = async () => {
        if (!selectedSite || !selectedList) return;
        setIsLoading(true);
        try {
            if (importMode === 'projects') {
                localStorage.setItem('carsan_sp_mapping', JSON.stringify(projectMapping));
                const cloudProjects = await fetchMappedListItems(selectedSite.id, selectedList.id, projectMapping);
                setProjects(cloudProjects);
                alert(`Sincronización exitosa. Se cargaron ${cloudProjects.length} proyectos.`);
            } else if (importMode === 'tickets') {
                if (!setTickets) return;
                localStorage.setItem('carsan_sp_ticket_mapping', JSON.stringify(ticketMapping));
                const cloudTickets = await fetchMappedTickets(selectedSite.id, selectedList.id, ticketMapping, projects);
                setTickets(cloudTickets);
                alert(`Sincronización exitosa. Se cargaron ${cloudTickets.length} Change Orders.`);
            } else if (importMode === 'leads') {
                if (!setLeads) return;
                localStorage.setItem('carsan_sp_lead_mapping', JSON.stringify(leadMapping));
                const cloudLeads = await fetchMappedLeads(selectedSite.id, selectedList.id, leadMapping);
                
                // Merge logic to avoid duplicates based on Email
                if (leads) {
                    const existingEmails = new Set(leads.map(l => l.email.toLowerCase()));
                    const newLeads = cloudLeads.filter(l => !l.email || !existingEmails.has(l.email.toLowerCase()));
                    setLeads([...leads, ...newLeads]);
                    alert(`Sincronización exitosa. ${newLeads.length} nuevos contactos añadidos.`);
                } else {
                    setLeads(cloudLeads);
                    alert(`Sincronización exitosa. Se cargaron ${cloudLeads.length} contactos.`);
                }
            }
        } catch (e: any) {
            setError("Error durante la sincronización: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const MappingRow = ({ label, value, onChange, isFilter = false }: { label: string, value: string, onChange: (val: string) => void, isFilter?: boolean }) => (
        <div className={`flex flex-col md:flex-row md:items-center justify-between p-4 ${isFilter ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'} border rounded-xl gap-4`}>
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                {isFilter ? <Filter className="w-4 h-4 text-orange-500" /> : <Settings2 className="w-4 h-4 text-blue-500" />} {label}
            </span>
            <div className="flex items-center gap-2">
                <select 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none md:w-64"
                >
                    <option value="">-- Seleccionar Columna --</option>
                    {columns.map(c => <option key={c.name} value={c.name}>{c.displayName}</option>)}
                </select>
                {isFilter && <span className="text-[10px] font-bold text-orange-600 bg-white px-2 py-1 rounded border border-orange-200 uppercase">Filtro: USA</span>}
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-600 rounded-xl text-white">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">SharePoint Import</h1>
                            <p className="text-sm text-slate-500">Conecta tus listas de SharePoint Online</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg border transition-colors ${showSettings ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-500'}`}
                        title="Configuración de Conexión"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>

                {showSettings && (
                    <div className="bg-slate-50 border border-blue-100 p-6 rounded-xl mb-6 animate-in slide-in-from-top-2">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Configuración de Azure AD
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Azure Tenant ID</label>
                                <input 
                                    value={tenantId}
                                    onChange={(e) => setTenantId(e.target.value)}
                                    placeholder="common (o GUID del tenant)"
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Client ID (App ID)</label>
                                <input 
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="GUID de la Aplicación"
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-3">
                             <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-500 font-bold text-sm">Cancelar</button>
                             <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                                <Save className="w-4 h-4" /> Guardar y Reconectar
                             </button>
                        </div>
                    </div>
                )}

                {/* Import Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl mb-6 w-full md:w-fit overflow-x-auto">
                    <button 
                        onClick={() => { setImportMode('projects'); setStep(0); }}
                        className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 justify-center transition-all whitespace-nowrap ${importMode === 'projects' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Briefcase className="w-4 h-4" /> Import Projects
                    </button>
                    <button 
                        onClick={() => { setImportMode('tickets'); setStep(0); }}
                        className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 justify-center transition-all whitespace-nowrap ${importMode === 'tickets' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <FileText className="w-4 h-4" /> Import Change Orders
                    </button>
                    <button 
                        onClick={() => { setImportMode('leads'); setStep(0); }}
                        className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 justify-center transition-all whitespace-nowrap ${importMode === 'leads' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Users className="w-4 h-4" /> Import Clients/Leads
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-8 overflow-x-auto pb-2">
                    <span className={step === 0 ? 'text-blue-600' : ''}>1. Sitio</span>
                    <ChevronRight className="w-4 h-4" />
                    <span className={step === 1 ? 'text-blue-600' : ''}>2. Lista</span>
                    <ChevronRight className="w-4 h-4" />
                    <span className={step === 2 ? 'text-blue-600' : ''}>3. Mapeo</span>
                </div>

                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                        <p className="mt-4 text-slate-500 font-medium">Conectando con la nube...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex flex-col items-start gap-3 mb-6">
                        <div className="flex items-start gap-3 w-full">
                            <LinkIcon className="w-5 h-5 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <span className="font-bold block mb-1">Error de Conexión</span>
                                <span className="text-sm">{error}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 ml-8 mt-2">
                            <button onClick={() => handleSearchSites(false)} className="flex items-center gap-2 text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1.5 rounded font-bold transition-colors">
                                <RefreshCw className="w-3 h-3" /> Reintentar Conexión
                            </button>
                            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-xs bg-white border border-red-200 hover:bg-red-50 text-red-800 px-3 py-1.5 rounded font-bold transition-colors">
                                <Settings className="w-3 h-3" /> Configurar
                            </button>
                        </div>
                    </div>
                )}

                {!isLoading && !error && (
                    <>
                        {step === 0 && (
                            <div className="grid grid-cols-1 gap-3">
                                {sites.length > 0 ? sites.map(site => (
                                    <button 
                                        key={site.id} 
                                        onClick={() => handleSelectSite(site)}
                                        className="text-left p-4 border border-slate-200 rounded-xl hover:bg-blue-50 transition-all group flex items-center justify-between"
                                    >
                                        <div>
                                            <p className="font-bold text-slate-900 group-hover:text-blue-700">{site.displayName}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-xs">{site.webUrl}</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-slate-300" />
                                    </button>
                                )) : (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                        <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                            <Database className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <p className="text-slate-500 text-sm mb-4">No se encontraron sitios. Verifica tus permisos.</p>
                                        <div className="flex justify-center gap-4">
                                            <button onClick={() => handleSearchSites(false)} className="text-blue-600 font-bold text-sm hover:underline">Actualizar Sitios</button>
                                            <button onClick={handleReconnect} className="text-slate-600 font-bold text-sm hover:underline flex items-center gap-1"><LogIn className="w-4 h-4"/> Reconectar Cuenta</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 1 && (
                            <div className="grid grid-cols-1 gap-3">
                                <div className="p-3 bg-slate-900 text-white rounded-xl text-xs flex justify-between items-center mb-4">
                                    <span>Sitio: <strong>{selectedSite?.displayName}</strong></span>
                                    <button onClick={() => setStep(0)} className="underline">Cambiar</button>
                                </div>
                                {lists.map(list => (
                                    <button 
                                        key={list.id} 
                                        onClick={() => handleSelectList(list)}
                                        className="text-left p-4 border border-slate-200 rounded-xl hover:bg-blue-50 transition-all flex items-center gap-4 group"
                                    >
                                        <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100">
                                            <LayoutList className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
                                        </div>
                                        <span className="font-bold text-slate-900">{list.displayName}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                                        <div>
                                            <p className="text-sm font-bold text-emerald-800">Lista: {selectedList?.displayName}</p>
                                            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">
                                                {importMode === 'projects' ? 'Filtro AREA = USA activo' : 
                                                 importMode === 'tickets' ? 'Mapeo de Change Orders' : 
                                                 'Mapeo de Contactos/Leads'}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setStep(1)} className="text-xs font-bold text-emerald-700 underline">Cambiar Lista</button>
                                </div>

                                {importMode === 'projects' && (
                                    <div className="space-y-3">
                                        <MappingRow label="Columna de AREA (Filtro)" value={projectMapping.area} onChange={(v) => setProjectMapping({...projectMapping, area: v})} isFilter={true} />
                                        <div className="h-px bg-slate-100 my-4"></div>
                                        <MappingRow label="Nombre del Proyecto" value={projectMapping.name} onChange={(v) => setProjectMapping({...projectMapping, name: v})} />
                                        <MappingRow label="Nombre del Cliente" value={projectMapping.client} onChange={(v) => setProjectMapping({...projectMapping, client: v})} />
                                        <MappingRow label="Estado Actual" value={projectMapping.status} onChange={(v) => setProjectMapping({...projectMapping, status: v})} />
                                        <MappingRow label="Monto / Valor" value={projectMapping.contractValue} onChange={(v) => setProjectMapping({...projectMapping, contractValue: v})} />
                                        <MappingRow label="Dirección / Ubicación" value={projectMapping.address} onChange={(v) => setProjectMapping({...projectMapping, address: v})} />
                                        <MappingRow label="Fecha de Creación" value={projectMapping.dateCreated} onChange={(v) => setProjectMapping({...projectMapping, dateCreated: v})} />
                                    </div>
                                )}
                                
                                {importMode === 'tickets' && (
                                    <div className="space-y-3">
                                        <MappingRow label="Descripción / Título" value={ticketMapping.title} onChange={(v) => setTicketMapping({...ticketMapping, title: v})} />
                                        <MappingRow label="Cliente" value={ticketMapping.client} onChange={(v) => setTicketMapping({...ticketMapping, client: v})} />
                                        <MappingRow label="Estado (Aprobado/Rechazado)" value={ticketMapping.status} onChange={(v) => setTicketMapping({...ticketMapping, status: v})} />
                                        <MappingRow label="Monto Total ($)" value={ticketMapping.amount} onChange={(v) => setTicketMapping({...ticketMapping, amount: v})} />
                                        <MappingRow label="Fecha Creación" value={ticketMapping.dateCreated} onChange={(v) => setTicketMapping({...ticketMapping, dateCreated: v})} />
                                        <MappingRow label="Nombre Proyecto (Link)" value={ticketMapping.projectName} onChange={(v) => setTicketMapping({...ticketMapping, projectName: v})} />
                                    </div>
                                )}

                                {importMode === 'leads' && (
                                    <div className="space-y-3">
                                        <MappingRow label="Nombre Contacto" value={leadMapping.name} onChange={(v) => setLeadMapping({...leadMapping, name: v})} />
                                        <MappingRow label="Email" value={leadMapping.email} onChange={(v) => setLeadMapping({...leadMapping, email: v})} />
                                        <MappingRow label="Teléfono" value={leadMapping.phone} onChange={(v) => setLeadMapping({...leadMapping, phone: v})} />
                                        <MappingRow label="Empresa" value={leadMapping.company} onChange={(v) => setLeadMapping({...leadMapping, company: v})} />
                                        <MappingRow label="Notas / Detalles" value={leadMapping.notes} onChange={(v) => setLeadMapping({...leadMapping, notes: v})} />
                                    </div>
                                )}

                                <div className="pt-8 flex justify-end">
                                    <button 
                                        onClick={handleSaveMappingAndSync}
                                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center gap-3 shadow-lg"
                                    >
                                        <Save className="w-5 h-5" /> 
                                        {importMode === 'projects' ? 'Importar Proyectos' : 
                                         importMode === 'tickets' ? 'Importar Change Orders' : 
                                         'Importar Clientes/Leads'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
