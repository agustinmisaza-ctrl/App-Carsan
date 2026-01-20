
import { getGraphToken } from "./emailIntegration";
import { ProjectEstimate, ProjectMapping, ServiceTicket, TicketMapping } from "../types";
import { robustParseDate } from "../utils/purchaseData";

export interface SPSite { id: string; displayName: string; webUrl: string; }
export interface SPList { id: string; displayName: string; }
export interface SPColumn { name: string; displayName: string; }
export interface SPItem { id: string; fields: any; createdDateTime?: string; }
export interface SPDriveItem { id: string; name: string; webUrl: string; lastModifiedDateTime: string; }

const SCOPES = ["Sites.ReadWrite.All", "Sites.Manage.All", "Files.Read.All"];

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

// --- FILE / EXCEL HANDLING ---

export const getSiteDrive = async (siteId: string): Promise<string> => {
    const token = await getGraphToken(SCOPES);
    // Get the default document library (drive) for the site
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to fetch site drive");
    const data = await res.json();
    return data.id;
};

export const searchExcelFiles = async (driveId: string, query: string): Promise<SPDriveItem[]> => {
    const token = await getGraphToken(SCOPES);
    const searchQuery = query || "xlsx"; 
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/search(q='${searchQuery}')`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to search files");
    const data = await res.json();
    // Filter for excel files only
    return data.value.filter((item: any) => item.name.endsWith('.xlsx') || item.name.endsWith('.xls') || item.name.endsWith('.csv'));
};

export const downloadFileContent = async (driveId: string, itemId: string): Promise<ArrayBuffer> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to download file");
    return await res.arrayBuffer();
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

const normalizeTicketStatus = (val: string): ServiceTicket['status'] => {
    if (!val) return 'Sent';
    const v = String(val).toLowerCase().trim();
    if (v.includes('aprobado') || v.includes('approved') || v.includes('authorized') || v.includes('autorizado')) return 'Authorized';
    if (v.includes('rechazado') || v.includes('denied') || v.includes('cancelled')) return 'Denied';
    if (v.includes('completado') || v.includes('completed') || v.includes('terminado')) return 'Completed';
    if (v.includes('agendado') || v.includes('scheduled')) return 'Scheduled';
    // If it mentions Change Order but no specific status, assume Sent/Pending
    return 'Sent';
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

        // Robust Name Resolution
        let projName = f[mapping.name];
        if (!projName) projName = f['Title'];
        if (!projName) projName = f['LinkTitle'];
        if (!projName) projName = f['Nombre'];
        if (!projName) projName = f['Proyecto'];
        if (!projName) projName = 'Sin Nombre';

        // Robust Client Resolution
        let clientName = f[mapping.client];
        if (!clientName) clientName = f['Cliente'];
        if (!clientName) clientName = f['Customer'];
        if (!clientName) clientName = 'Desconocido';

        // Robust Date Parsing
        const rawDate = f[mapping.dateCreated] || item.createdDateTime;
        const cleanDate = robustParseDate(rawDate).toISOString();

        const rawAwarded = f[mapping.awardedDate];
        const cleanAwarded = rawAwarded ? robustParseDate(rawAwarded).toISOString() : undefined;

        return {
            id: `sp-${item.id}`,
            name: projName,
            client: clientName,
            status: normalizedStatus,
            contractValue: parseFloat(f[mapping.contractValue]) || 0,
            address: f[mapping.address] || 'Miami, FL',
            estimator: f[mapping.estimator] || '',
            dateCreated: cleanDate,
            awardedDate: cleanAwarded,
            items: [],
            laborRate: 75
        } as ProjectEstimate;
    });
};

export const fetchMappedTickets = async (
    siteId: string, 
    listId: string, 
    mapping: TicketMapping,
    existingProjects: ProjectEstimate[] = []
): Promise<ServiceTicket[]> => {
    const items = await getListItems(siteId, listId);
    
    return items.map(item => {
        const f = item.fields;
        
        // STRICT FILTER: Check if the 'status' (ETAPA) column contains "Change Order"
        // This ensures we only pick up items marked specifically as Change Orders in SharePoint
        const rawStatus = String(f[mapping.status] || '');
        if (!rawStatus.toLowerCase().includes('change order')) {
            return null;
        }

        const normalizedStatus = normalizeTicketStatus(rawStatus);
        const amount = parseFloat(f[mapping.amount]) || 0;
        const ticketTitle = f[mapping.title] || 'Change Order';
        
        // Try to link to a project
        const projectName = f[mapping.projectName];
        const linkedProject = existingProjects.find(p => p.name === projectName || p.id === projectName);

        // Robust Date Parsing
        const rawDate = f[mapping.dateCreated] || item.createdDateTime;
        const cleanDate = robustParseDate(rawDate).toISOString();
        
        const ticket: ServiceTicket = {
            id: `sp-ticket-${item.id}`,
            type: 'Change Order',
            status: normalizedStatus,
            clientName: f[mapping.client] || (linkedProject ? linkedProject.client : 'Unknown Client'),
            projectId: linkedProject ? linkedProject.id : '',
            address: linkedProject ? linkedProject.address : 'Miami, FL',
            technician: 'Imported',
            dateCreated: cleanDate,
            laborRate: 85,
            notes: ticketTitle,
            items: [{
                id: `item-${item.id}`,
                description: ticketTitle,
                quantity: 1,
                unitMaterialCost: amount, // Put full value in material cost for simplicity
                unitLaborHours: 0,
                laborRate: 0
            }],
            photos: []
        };
        return ticket;
    }).filter((item): item is ServiceTicket => item !== null);
};

export const ensureCarsanLists = async (siteId: string, forceToken = false) => {
    return true;
};
