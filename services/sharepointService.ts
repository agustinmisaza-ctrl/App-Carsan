import { getGraphToken } from "./emailIntegration";
import { PurchaseRecord, ProjectEstimate } from "../types";

export interface SPSite { id: string; displayName: string; webUrl: string; }
export interface SPList { id: string; displayName: string; }
export interface SPColumn { name: string; displayName: string; }
export interface SPItem { id: string; fields: any; }

const SCOPES = ["Sites.ReadWrite.All", "Sites.Manage.All"];

// --- READ OPERATIONS ---
export const searchSharePointSites = async (query: string): Promise<SPSite[]> => {
    const token = await getGraphToken(SCOPES);
    const endpoint = query ? `https://graph.microsoft.com/v1.0/sites?search=${query}` : `https://graph.microsoft.com/v1.0/sites?search=*`;
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const err = await res.json();
        if (err.error?.code === "InvalidAuthenticationToken" || res.status === 401) throw new Error("AADSTS50194: Authentication failed. Check Tenant ID.");
        throw new Error("Failed to fetch sites");
    }
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
    return data.value.map((c: any) => ({ name: c.name, displayName: c.displayName }));
};

// FIX: Pagination logic to get ALL items > 200
export const getListItems = async (siteId: string, listId: string): Promise<SPItem[]> => {
    const token = await getGraphToken(SCOPES);
    let items: SPItem[] = [];
    // Start with top 499 (safe limit)
    let nextLink = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?expand=fields&$top=499`;

    console.log("Starting full list download...");

    while (nextLink) {
        const res = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to fetch items page");
        
        const data = await res.json();
        if (data.value) items = items.concat(data.value);
        
        // Loop until nextLink is null
        nextLink = data['@odata.nextLink'] || null;
    }
    console.log(`Downloaded ${items.length} total items.`);
    return items;
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
                tax: f.Tax || 0,
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
                ...base,
                id: `sp-${item.id}`,
                name: f.Title,
                client: f.Client,
                status: f.Status,
                contractValue: f.Value,
                address: f.ADDRESS, 
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

export const downloadSharePointImage = async (url: string): Promise<string | undefined> => {
    try {
        const token = await getGraphToken(SCOPES);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) { return undefined; }
};

// --- WRITE OPERATIONS ---
export const createSharePointList = async (siteId: string, listName: string, columns: any[], forceToken = false): Promise<SPList> => {
    const token = await getGraphToken(SCOPES, forceToken);
    const listRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: listName, columns: columns, list: { template: "genericList" } })
    });

    if (!listRes.ok) {
        if (listRes.status === 409) {
            const allLists = await getSharePointLists(siteId);
            const existing = allLists.find(l => l.displayName === listName);
            if (existing) return existing;
        }
        if (listRes.status === 403) throw new Error(`Access Denied (403). Missing 'Sites.ReadWrite.All'.`);
        const errData = await listRes.json().catch(() => ({}));
        throw new Error(`Failed to create list ${listName}: ${errData.error?.message || listRes.statusText}`);
    }
    return await listRes.json();
};

export const addListItem = async (siteId: string, listId: string, fields: any, forceToken = false): Promise<void> => {
    const token = await getGraphToken(SCOPES, forceToken);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to add item");
    }
};

export const updateListItem = async (siteId: string, listId: string, itemId: string, fields: any): Promise<void> => {
    const token = await getGraphToken(SCOPES);
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
    });
    if (!res.ok) throw new Error("Failed to update item");
};

export const ensureCarsanLists = async (siteId: string, forceToken = false) => {
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

    await createSharePointList(siteId, 'Carsan_Materials', [
        { name: 'Category', text: {} }, { name: 'Cost', number: {} }, { name: 'JSON_Data', text: {} }
    ], forceToken);

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