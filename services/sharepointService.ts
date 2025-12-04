
// v5.2 Update - Added getAllPurchaseRecords and new Columns
import { getGraphToken } from "./emailIntegration";
import { PurchaseRecord, ProjectEstimate } from "../types";

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

// --- DATA FETCHING HELPERS ---

export const getAllPurchaseRecords = async (siteId: string): Promise<PurchaseRecord[]> => {
    try {
        const lists = await getSharePointLists(siteId);
        const purchaseList = lists.find(l => l.displayName === 'Carsan_Purchases');
        if(!purchaseList) return [];

        const items = await getListItems(siteId, purchaseList.id);
        
        return items.map(item => {
            const f = item.fields;
            // Prefer SharePoint columns, fall back to JSON blob
            let base = {};
            try { base = JSON.parse(f.JSON_Data || '{}'); } catch(e) {}

            return {
                ...base,
                id: item.id,
                date: f.PurchaseDate || f.Created,
                poNumber: f.PO_Number,
                brand: f.Brand,
                itemDescription: f.Item_Description,
                quantity: f.Quantity,
                unitCost: f.Unit_Cost,
                totalCost: f.Total_Cost,
                supplier: f.Supplier,
                projectName: f.Project_Name,
                type: f.Item_Type,
                tax: f.Tax,
                source: 'SharePoint'
            } as PurchaseRecord;
        });
    } catch(e) {
        console.error("Error fetching purchases", e);
        return [];
    }
};

export const getAllProjects = async (siteId: string): Promise<ProjectEstimate[]> => {
    try {
        const lists = await getSharePointLists(siteId);
        const projectList = lists.find(l => l.displayName === 'Carsan_Projects');
        if(!projectList) return [];

        const items = await getListItems(siteId, projectList.id);
        
        return items.map(item => {
            const f = item.fields;
            let base = {};
            try { base = JSON.parse(f.JSON_Data || '{}'); } catch(e) {}

            return {
                ...base, // Spread JSON first
                id: `sp-${item.id}`,
                name: f.Title,
                client: f.Client,
                status: f.Status,
                contractValue: f.Value,
                address: f.ADDRESS, // Ensure case matches list definition
                estimator: f.Estimator,
                deliveryDate: f['Delivery Date'],
                expirationDate: f['Expiration Date'],
                awardedDate: f['Awarded Date'],
            } as ProjectEstimate;
        });
    } catch(e) {
        console.error("Error fetching projects", e);
        return [];
    }
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

export const addListItem = async (siteId: string, listId: string, fields: any, forceToken = false): Promise<void> => {
    const token = await getGraphToken(SCOPES, forceToken);
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
        // Throw specific error message for debugging
        throw new Error(err.error?.message || "Failed to add item");
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
    
    // 1. Project List - Added ADDRESS, Estimator, Dates
    await createSharePointList(siteId, 'Carsan_Projects', [
        { name: 'Client', text: {} },
        { name: 'Status', text: {} },
        { name: 'Value', number: {} },
        { name: 'ADDRESS', text: {} },
        { name: 'Estimator', text: {} },
        { name: 'Delivery Date', dateTime: {} }, 
        { name: 'Expiration Date', dateTime: {} },
        { name: 'Awarded Date', dateTime: {} },
        { name: 'JSON_Data', text: {} }
    ], forceToken);

    // 2. Materials List
    await createSharePointList(siteId, 'Carsan_Materials', [
        { name: 'Category', text: {} },
        { name: 'Cost', number: {} },
        { name: 'JSON_Data', text: {} }
    ], forceToken);

    // 3. Purchase History List (For Price Analysis)
    await createSharePointList(siteId, 'Carsan_Purchases', [
        { name: 'PurchaseDate', dateTime: {} },
        { name: 'PO_Number', text: {} },
        { name: 'Brand', text: {} },
        { name: 'Item_Description', text: {} },
        { name: 'Quantity', number: {} },
        { name: 'Unit_Cost', number: {} },
        { name: 'Tax', number: {} }, 
        { name: 'Total_Cost', number: {} },
        { name: 'Supplier', text: {} },
        { name: 'Project_Name', text: {} },
        { name: 'Item_Type', text: {} },
        { name: 'JSON_Data', text: {} }
    ], forceToken);
    
    return true;
};