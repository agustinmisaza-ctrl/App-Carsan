
import { PurchaseRecord } from "../types";
import { robustParseDate, normalizeSupplier, parseCurrency } from "../utils/purchaseData";

const STORAGE_KEY_QB_WEBHOOK = 'carsan_qb_webhook_url';

export const getZapierWebhookUrl = (): string => {
    return localStorage.getItem(STORAGE_KEY_QB_WEBHOOK) || '';
};

export const setZapierWebhookUrl = (url: string) => {
    localStorage.setItem(STORAGE_KEY_QB_WEBHOOK, url.trim());
};

export const connectToQuickBooks = async (): Promise<boolean> => {
    const url = getZapierWebhookUrl();
    if (!url) {
        throw new Error("Zapier Webhook URL not configured. Please open settings.");
    }
    return true;
};

export const fetchQuickBooksBills = async (): Promise<PurchaseRecord[]> => {
    const url = getZapierWebhookUrl();
    
    if (!url) {
        throw new Error("Webhook URL missing");
    }

    try {
        console.log("Fetching from Zapier Webhook:", url);
        
        // We use POST to trigger the webhook. 
        // Ensure your Zapier 'Catch Hook' is set up to return data (requires Code Step or specific configuration)
        // or assumes the Zap populates a secondary source this fetches from.
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'fetch_bills', timestamp: new Date().toISOString() })
        });

        if (!response.ok) {
            throw new Error(`Zapier connection failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Handle case where Zapier returns { "bills": [...] } or just [...]
        const rawBills = Array.isArray(data) ? data : (data.bills || data.data || []);

        if (!Array.isArray(rawBills)) {
            console.warn("Unexpected Zapier response format", data);
            return [];
        }

        // Map generic JSON to PurchaseRecord
        return rawBills.map((bill: any, index: number) => ({
            id: `qb-${bill.Id || bill.id || index}`,
            date: robustParseDate(bill.TxnDate || bill.date || new Date()).toISOString(),
            poNumber: bill.DocNumber || bill.doc_number || 'N/A',
            brand: 'N/A',
            itemDescription: bill.Description || (bill.Line && bill.Line[0]?.Description) || 'QuickBooks Import',
            quantity: 1, 
            unitCost: parseCurrency(String(bill.TotalAmt || bill.amount || 0)),
            totalCost: parseCurrency(String(bill.TotalAmt || bill.amount || 0)),
            supplier: normalizeSupplier(bill.VendorRef?.name || bill.vendor || 'QuickBooks Vendor'),
            projectName: 'QB Import',
            type: 'Material',
            source: 'QuickBooks'
        }));

    } catch (error: any) {
        console.error("Error fetching QB bills via Zapier", error);
        throw new Error(error.message || "Failed to sync with Zapier.");
    }
};
