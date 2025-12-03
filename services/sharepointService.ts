
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

const SCOPES = ["Sites.ReadWrite.All", "Sites.Manage.All"];

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

export const createSharePointList = async (siteId: string, listName: string, columns: any[], forceToken = false): Promise<SPList> => {
    const token = await getGraphToken(SCOPES, forceToken);
    
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

    if (!listRes.ok) {
        // Handle "Name Already Exists" (409 Conflict) gracefully
        if (listRes.status === 409) {
            console.log(`List ${listName} already exists. Skipping creation.`);
            // Fetch the existing list to return it
            const allLists = await getSharePointLists(siteId);
            const existing = allLists.find(l => l.displayName === listName);
            if (existing) return existing;
        }
        
        // Handle Permissions Error (403 Forbidden)
        if (listRes.status === 403) {
            throw new Error(`Access Denied (403). Missing 'Sites.ReadWrite.All' or user lacks Edit permissions on this specific site.`);
        }

        const errData = await listRes.json().catch(() => ({}));
        console.error("Create List Error", errData);
        throw new Error(`Failed to create list ${listName}: ${errData.error?.message || listRes.statusText}`);
    }
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
export const ensureCarsanLists = async (siteId: string, forceToken = false) => {
    // Note: We deliberately DO NOT check if the list exists first using 'find' because pagination might hide it.
    // Instead, we try to create it and handle the 409 (Conflict/Exists) error in createSharePointList.
    
    // 1. Project List - 'Title' is default, do not re-add it or it causes errors
    await createSharePointList(siteId, 'Carsan_Projects', [
        { name: 'Client', text: {} },
        { name: 'Status', text: {} },
        { name: 'Value', number: {} },
        { name: 'JSON_Data', text: {} } // Stores the full object as string
    ], forceToken);

    // 2. Materials List
    await createSharePointList(siteId, 'Carsan_Materials', [
        { name: 'Category', text: {} },
        { name: 'Cost', number: {} },
        { name: 'JSON_Data', text: {} }
    ], forceToken);
    
    return true;
};
