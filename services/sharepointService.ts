
import { getGraphToken } from './emailIntegration';
import { ProjectEstimate, ServiceTicket, ProjectMapping, TicketMapping, LeadMapping } from '../types';
import { robustParseDate } from '../utils/purchaseData';

export interface SPSite {
    id: string;
    displayName: string;
    webUrl: string;
}

export interface SPList {
    id: string;
    displayName: string;
}

export interface SPColumn {
    name: string;
    displayName: string;
}

export interface SPItem {
    id: string;
    createdDateTime: string;
    fields: any;
}

export interface SPDriveItem {
    id: string;
    name: string;
    lastModifiedDateTime: string;
    webUrl: string;
}

export const searchSharePointSites = async (query: string): Promise<SPSite[]> => {
    try {
        const token = await getGraphToken(['Sites.Read.All']);
        const q = query ? `?search=${query}` : '?search=*';
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites${q}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to search sites');
        const data = await response.json();
        return data.value;
    } catch (e) {
        console.error("SharePoint Search Error", e);
        return [];
    }
};

export const getSharePointLists = async (siteId: string): Promise<SPList[]> => {
    try {
        const token = await getGraphToken(['Sites.Read.All']);
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return data.value;
    } catch (e) {
        console.error("Get Lists Error", e);
        return [];
    }
};

export const getListColumns = async (siteId: string, listId: string): Promise<SPColumn[]> => {
    try {
        const token = await getGraphToken(['Sites.Read.All']);
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return data.value.map((c: any) => ({ name: c.name, displayName: c.displayName }));
    } catch (e) {
        return [];
    }
};

export const getListItems = async (siteId: string, listId: string): Promise<SPItem[]> => {
    try {
        const token = await getGraphToken(['Sites.Read.All']);
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return data.value;
    } catch (e) {
        return [];
    }
};

export const getSiteDrive = async (siteId: string): Promise<string> => {
    try {
        const token = await getGraphToken(['Files.Read.All']);
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return data.id;
    } catch (e) {
        throw new Error("No default drive found");
    }
};

export const searchExcelFiles = async (driveId: string, query: string): Promise<SPDriveItem[]> => {
    try {
        const token = await getGraphToken(['Files.Read.All']);
        const q = query ? `q=name contains '${query}' and ` : '';
        const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/search(q='${query} .xlsx')?select=id,name,lastModifiedDateTime,webUrl`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        return data.value;
    } catch (e) {
        return [];
    }
};

export const downloadFileContent = async (driveId: string, itemId: string): Promise<ArrayBuffer> => {
    try {
        const token = await getGraphToken(['Files.Read.All']);
        const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return await response.arrayBuffer();
    } catch (e) {
        throw new Error("Download failed");
    }
};

export const fetchMappedListItems = async (
    siteId: string, 
    listId: string, 
    mapping: ProjectMapping
): Promise<ProjectEstimate[]> => {
    const items = await getListItems(siteId, listId);
    
    return items.map(item => {
        const f = item.fields;
        
        // Filter out if not US Area (example filter logic)
        if (mapping.area && f[mapping.area] !== 'USA') {
             // return null; 
             // Logic disabled to allow all for now
        }

        return {
            id: `sp-proj-${item.id}`,
            name: f[mapping.name] || 'Untitled Project',
            client: f[mapping.client] || 'Unknown Client',
            status: 'Draft', // Default import status
            contractValue: parseFloat(f[mapping.contractValue]) || 0,
            address: f[mapping.address] || 'Miami, FL',
            dateCreated: f[mapping.dateCreated] || item.createdDateTime,
            laborRate: 75,
            items: []
        } as ProjectEstimate;
    }).filter((p): p is ProjectEstimate => p !== null);
};

export const normalizeTicketStatus = (status: string): ServiceTicket['status'] => {
    const s = status.toLowerCase();
    if (s.includes('approv') || s.includes('auth')) return 'Authorized';
    if (s.includes('deny') || s.includes('reject')) return 'Denied';
    if (s.includes('complet')) return 'Completed';
    return 'Sent';
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
        
        const rawStatus = String(f[mapping.status] || '');
        // Loose check
        // if (!rawStatus.toLowerCase().includes('change order')) return null;

        const normalizedStatus = normalizeTicketStatus(rawStatus);
        const amount = parseFloat(f[mapping.amount]) || 0;
        const ticketTitle = f[mapping.title] || 'Change Order';
        
        const projectName = f[mapping.projectName];
        const linkedProject = existingProjects.find(p => p.name === projectName || p.id === projectName);

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
                unitMaterialCost: amount, 
                unitLaborHours: 0,
                laborRate: 0
            }],
            photos: []
        };
        return ticket;
    }).filter((item): item is ServiceTicket => item !== null);
};

export const fetchMappedLeads = async (
    siteId: string,
    listId: string,
    mapping: LeadMapping
): Promise<any[]> => { 
    const items = await getListItems(siteId, listId);

    return items.map(item => {
        const f = item.fields;

        const name = f[mapping.name];
        const email = f[mapping.email];

        if (!name && !email) return null;

        return {
            id: `sp-lead-${item.id}`,
            name: name || 'Sin Nombre',
            company: f[mapping.company] || 'Particular',
            email: email || '',
            phone: f[mapping.phone] || '',
            source: 'SharePoint',
            status: 'New',
            notes: f[mapping.notes] || 'Importado desde SharePoint',
            dateAdded: item.createdDateTime || new Date().toISOString()
        };
    }).filter(item => item !== null);
};

export const ensureCarsanLists = async (siteId: string, forceToken = false) => {
    return true;
};
