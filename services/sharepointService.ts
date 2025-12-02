

import { getGraphToken } from "./emailIntegration";

// Types for Internal SharePoint Data
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
    name: string; // The internal technical name
    displayName: string; // The user friendly name
}

export interface SPItem {
    id: string;
    fields: any;
}

const SCOPES = ["Sites.ReadWrite.All"];

// --- READ OPERATIONS ---

export const searchSharePointSites = async (query: string): Promise<SPSite[]> => {
    const token = await getGraphToken(SCOPES);
    
    // If query is empty, fetch root site or frequent sites
    const endpoint = query 
        ? `https://graph.microsoft.com/v1.0/sites?search=${query}`
        : `https://graph.microsoft.com/v1.0/sites?search=*`;

    const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
        const err = await res.json();
        // Detect single tenant error
        if (err.error?.code === "InvalidAuthenticationToken" || res.status === 401) {
             throw new Error("AADSTS50194: Authentication failed. Check Tenant ID.");
        }
        throw new Error("Failed to fetch sites");
    }
    const data = await res.json();
    return data.value;
};

export const getSharePointLists = async (siteId: string): Promise<SPList[]> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch lists");
    const data = await res.json();
    // Filter out system lists usually
    return data.value.filter((l: any) => !l.system);
};

export const getListColumns = async (siteId: string, listId: string): Promise<SPColumn[]> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/columns`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch columns");
    const data = await res.json();
    return data.value.map((c: any) => ({ name: c.name, displayName: c.displayName }));
};

export const getListItems = async (siteId: string, listId: string): Promise<SPItem[]> => {
    const token = await getGraphToken(SCOPES);
    // Expand fields to get the actual column data
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch items");
    const data = await res.json();
    return data.value;
};

// Helper to download an image from a private SharePoint URL and convert to Base64 for display
export const downloadSharePointImage = async (url: string): Promise<string | undefined> => {
    try {
        const token = await getGraphToken(SCOPES);
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) return undefined;
        
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to download image", e);
        return undefined;
    }
};

// --- WRITE OPERATIONS (DATABASE MODE) ---

export const createSharePointList = async (siteId: string, listName: string, columns: any[]): Promise<SPList> => {
    const token = await getGraphToken(SCOPES);
    
    // 1. Create List
    const listRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
        method: 'POST',
        headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            displayName: listName,
            columns: columns,
            list: {
                template: "genericList"
            }
        })
    });

    if (!listRes.ok) throw new Error(`Failed to create list: ${listName}`);
    return await listRes.json();
};

export const addListItem = async (siteId: string, listId: string, fields: any): Promise<void> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
        method: 'POST',
        headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const err = await res.json();
        console.error("Add Item Error", err);
        throw new Error("Failed to add item");
    }
};

export const updateListItem = async (siteId: string, listId: string, itemId: string, fields: any): Promise<void> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
        method: 'PATCH',
        headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(fields)
    });
    if (!res.ok) throw new Error("Failed to update item");
};

// Auto-Provisioning helper
export const ensureCarsanLists = async (siteId: string) => {
    const lists = await getSharePointLists(siteId);
    
    // 1. Project List
    if (!lists.find(l => l.displayName === 'Carsan_Projects')) {
        await createSharePointList(siteId, 'Carsan_Projects', [
            { name: 'Title', text: {} },
            { name: 'Client', text: {} },
            { name: 'Status', text: {} },
            { name: 'Value', number: {} },
            { name: 'JSON_Data', text: {} } // Stores the full object as string
        ]);
    }

    // 2. Materials List
    if (!lists.find(l => l.displayName === 'Carsan_Materials')) {
        await createSharePointList(siteId, 'Carsan_Materials', [
            { name: 'Title', text: {} }, // Item Name
            { name: 'Category', text: {} },
            { name: 'Cost', number: {} },
            { name: 'JSON_Data', text: {} }
        ]);
    }
    
    return true;
};
