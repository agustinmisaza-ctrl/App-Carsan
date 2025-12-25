
import { getGraphToken } from "./emailIntegration";
import { ProjectEstimate, ProjectMapping } from "../types";

export interface SPSite { id: string; displayName: string; webUrl: string; }
export interface SPList { id: string; displayName: string; }
export interface SPColumn { name: string; displayName: string; }
export interface SPItem { id: string; fields: any; createdDateTime?: string; }

const SCOPES = ["Sites.ReadWrite.All", "Sites.Manage.All"];

export const searchSharePointSites = async (query: string): Promise<SPSite[]> => {
    const token = await getGraphToken(SCOPES);
    const endpoint = query ? `https://graph.microsoft.com/v1.0/sites?search=${query}` : `https://graph.microsoft.com/v1.0/sites?search=*`;
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to fetch sites");
    const data = await res.json();
    return data.value;
};

export const getSharePointLists = async (siteId: string): Promise<SPList[]> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to fetch lists");
    const data = await res.json();
    return data.value.filter((l: any) => !l.system);
};

export const getListColumns = async (siteId: string, listId: string): Promise<SPColumn[]> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to fetch columns");
    const data = await res.json();
    return data.value
        .filter((c: any) => !c.readOnly && !c.hidden)
        .map((c: any) => ({ name: c.name, displayName: c.displayName }));
};

export const getListItems = async (siteId: string, listId: string): Promise<SPItem[]> => {
    const token = await getGraphToken(SCOPES);
    let items: SPItem[] = [];
    let nextLink = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=499`;
    while (nextLink) {
        const res = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to fetch items page");
        const data = await res.json();
        if (data.value) items = items.concat(data.value);
        nextLink = data['@odata.nextLink'] || null;
    }
    return items;
};

// Smart Status Mapper (Etapa -> App Status)
const normalizeSharePointStatus = (val: string): ProjectEstimate['status'] => {
    if (!val) return 'Draft';
    const v = String(val).toLowerCase().trim();
    
    // Won / Ganado
    if (v.includes('ganado') || v.includes('won') || v.includes('adjudicado') || v.includes('cerrado') || v.includes('award') || v.includes('contratado')) return 'Won';
    
    // Lost / Perdido
    if (v.includes('perdido') || v.includes('lost') || v.includes('rechazado') || v.includes('cancel') || v.includes('discard')) return 'Lost';
    
    // Sent / Enviado / Entregado
    if (v.includes('enviado') || v.includes('sent') || v.includes('cotizado') || v.includes('presentada') || v.includes('submitted') || v.includes('waiting') || v.includes('entregado')) return 'Sent';
    
    // Ongoing / En Ejecución
    if (v.includes('ejecucion') || v.includes('ongoing') || v.includes('obra') || v.includes('construction') || v.includes('active') || v.includes('curso')) return 'Ongoing';
    
    // Completed / Terminado
    if (v.includes('completado') || v.includes('completed') || v.includes('terminado') || v.includes('final')) return 'Completed';
    
    // Default to Draft (This covers "En Proceso", "Borrador", "Draft")
    return 'Draft';
};

export const fetchMappedListItems = async (
    siteId: string, 
    listId: string, 
    mapping: ProjectMapping
): Promise<ProjectEstimate[]> => {
    const items = await getListItems(siteId, listId);
    
    // Filter items: Only those where the mapped 'area' column equals 'USA'
    const filteredItems = items.filter(item => {
        if (!mapping.area) return true; // If no area mapping, return all
        const areaValue = item.fields[mapping.area];
        return String(areaValue).trim().toUpperCase() === 'USA';
    });

    return filteredItems.map(item => {
        const f = item.fields;
        
        // Use the smart normalizer for status (Etapa)
        const rawStatus = f[mapping.status];
        const normalizedStatus = normalizeSharePointStatus(rawStatus);

        return {
            id: `sp-${item.id}`,
            name: f[mapping.name] || 'Sin Nombre',
            client: f[mapping.client] || 'Desconocido',
            status: normalizedStatus,
            contractValue: parseFloat(f[mapping.contractValue]) || 0,
            address: f[mapping.address] || 'Miami, FL',
            estimator: f[mapping.estimator] || '',
            dateCreated: f[mapping.dateCreated] || item.createdDateTime || new Date().toISOString(),
            awardedDate: f[mapping.awardedDate] || null,
            items: [],
            laborRate: 75
        } as ProjectEstimate;
    });
};

export const ensureCarsanLists = async (siteId: string, forceToken = false) => {
    return true;
};
