
import React, { useState, useEffect } from 'react';
import { Search, Database, Loader2, Link as LinkIcon, CheckCircle, RefreshCw, ChevronRight, LayoutList, Settings2, Save, Filter, Settings, LogIn } from 'lucide-react';
import { searchSharePointSites, getSharePointLists, getListColumns, fetchMappedListItems, SPSite, SPList, SPColumn } from '../services/sharepointService';
import { ProjectMapping, ProjectEstimate, MaterialItem, ServiceTicket, PurchaseRecord } from '../types';
import { getStoredTenantId, setStoredTenantId, getStoredClientId, setStoredClientId } from '../services/emailIntegration';

interface SharePointConnectProps {
    projects: ProjectEstimate[];
    setProjects: (projects: ProjectEstimate[]) => void;
    materials?: MaterialItem[];
    tickets?: ServiceTicket[];
    purchases?: PurchaseRecord[];
    setPurchases?: (purchases: PurchaseRecord[]) => void;
}

export const SharePointConnect: React.FC<SharePointConnectProps> = ({ projects, setProjects, materials, tickets, purchases, setPurchases }) => {
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

    const [mapping, setMapping] = useState<ProjectMapping>(() => {
        const saved = localStorage.getItem('carsan_sp_mapping');
        return saved ? JSON.parse(saved) : {
            name: 'Title',
            client: '',
            status: '',
            contractValue: '',
            address: '',
            estimator: '',
            dateCreated: '',
            awardedDate: '',
            area: ''
        };
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Only attempt auto-connect if we have configuration
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
            // If auto-connect fails (likely popup blocked), we show a specific message
            // or just the standard error, but the user can now click 'Retry' to fix it.
            let msg = e.message || "Error al buscar sitios.";
            if (isAuto && (msg.includes("interaction") || msg.includes("popup") || msg.toLowerCase().includes("failed to fetch"))) {
                 msg = "Se requiere iniciar sesión. Por favor haz clic en 'Conectar' para autorizar.";
            }
            setError(msg);
            
            // If error implies missing config, open settings automatically
            if (e.message?.includes('Client ID')) {
                setShowSettings(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSettings = () => {
        setStoredTenantId(tenantId.trim());
        setStoredClientId(clientId.trim());
        setShowSettings(false);
        setError(null);
        handleSearchSites(false); // Manual trigger
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
            
            const autoMap = { ...mapping };
            cols.forEach(c => {
                const name = c.displayName.toLowerCase();
                if (name.includes('cliente') || name.includes('customer') || name.includes('client')) autoMap.client = c.name;
                if (name.includes('estado') || name.includes('status')) autoMap.status = c.name;
                if (name.includes('valor') || name.includes('value') || name.includes('monto') || name.includes('contract')) autoMap.contractValue = c.name;
                if (name.includes('direccion') || name.includes('address') || name.includes('ubicacion')) autoMap.address = c.name;
                if (name.includes('estimador') || name.includes('owner') || name.includes('estimator')) autoMap.estimator = c.name;
                if (name.includes('creacion') || name.includes('created') || name.includes('fecha')) autoMap.dateCreated = c.name;
                if (name.includes('area') || name.includes('ubicacion') || name.includes('zona')) autoMap.area = c.name;
            });
            setMapping(autoMap);
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
            localStorage.setItem('carsan_sp_mapping', JSON.stringify(mapping));
            const cloudProjects = await fetchMappedListItems(selectedSite.id, selectedList.id, mapping);
            setProjects(cloudProjects);
            alert(`Sincronización exitosa. Se cargaron ${cloudProjects.length} proyectos (Filtrados por AREA=USA).`);
        } catch (e: any) {
            setError("Error durante la sincronización: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const MappingRow = ({ label, field, isFilter = false }: { label: string, field: keyof ProjectMapping, isFilter?: boolean }) => (
        <div className={`flex flex-col md:flex-row md:items-center justify-between p-4 ${isFilter ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'} border rounded-xl gap-4`}>
            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                {isFilter ? <Filter className="w-4 h-4 text-orange-500" /> : <Settings2 className="w-4 h-4 text-blue-500" />} {label}
            </span>
            <div className="flex items-center gap-2">
                <select 
                    value={mapping[field]} 
                    onChange={(e) => setMapping({...mapping, [field]: e.target.value})}
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
                            <h1 className="text-2xl font-bold text-slate-900">SharePoint Schema Mapper</h1>
                            <p className="text-sm text-slate-500">Filtrado inteligente: AREA = USA</p>
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

                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-8 overflow-x-auto pb-2">
                    <span className={step === 0 ? 'text-blue-600' : ''}>1. Sitio</span>
                    <ChevronRight className="w-4 h-4" />
                    <span className={step === 1 ? 'text-blue-600' : ''}>2. Lista</span>
                    <ChevronRight className="w-4 h-4" />
                    <span className={step === 2 ? 'text-blue-600' : ''}>3. Mapeo y Filtros</span>
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
                                        className="text-left p-4 border border-slate-200 rounded-xl hover:bg-blue-50 transition-all group flex justify-between items-center"
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
                                        <button onClick={() => handleSearchSites(false)} className="text-blue-600 font-bold text-sm hover:underline">Actualizar Sitios</button>
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
                                            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Configura el filtro de Área abajo</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setStep(1)} className="text-xs font-bold text-emerald-700 underline">Cambiar Lista</button>
                                </div>

                                <div className="space-y-3">
                                    <MappingRow label="Columna de AREA (Filtro)" field="area" isFilter={true} />
                                    <div className="h-px bg-slate-100 my-4"></div>
                                    <MappingRow label="Nombre del Proyecto" field="name" />
                                    <MappingRow label="Nombre del Cliente" field="client" />
                                    <MappingRow label="Estado Actual" field="status" />
                                    <MappingRow label="Monto / Valor" field="contractValue" />
                                    <MappingRow label="Dirección / Ubicación" field="address" />
                                    <MappingRow label="Fecha de Creación" field="dateCreated" />
                                </div>

                                <div className="pt-8 flex justify-end">
                                    <button 
                                        onClick={handleSaveMappingAndSync}
                                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 flex items-center gap-3 shadow-lg"
                                    >
                                        <Save className="w-5 h-5" /> Guardar y Filtrar Importación
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
