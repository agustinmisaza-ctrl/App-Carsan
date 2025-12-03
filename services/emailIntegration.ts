import { Lead } from '../types';
import { PublicClientApplication } from '@azure/msal-browser';

// Storage keys
const STORAGE_KEY_CLIENT_ID = 'carsan_azure_client_id';
const STORAGE_KEY_TENANT_ID = 'carsan_azure_tenant_id';

// Hardcoded default provided by user
const DEFAULT_CLIENT_ID = 'f13f2359-eec6-4874-8013-05f69f5fb8ea';

let msalInstance: PublicClientApplication | null = null;

export const getStoredClientId = (): string | null => {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || DEFAULT_CLIENT_ID;
};

export const setStoredClientId = (id: string) => {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, id);
    // Reset instance to force re-initialization with new ID
    msalInstance = null;
};

export const getStoredTenantId = (): string | null => {
    return localStorage.getItem(STORAGE_KEY_TENANT_ID);
};

export const setStoredTenantId = (id: string) => {
    localStorage.setItem(STORAGE_KEY_TENANT_ID, id);
    msalInstance = null;
};

const initializeMsal = async () => {
    const clientId = getStoredClientId();
    const tenantId = getStoredTenantId() || 'common'; // Default to common if not provided (though single tenant needs ID)
    
    if (!clientId) {
        throw new Error("Missing Azure Client ID");
    }

    if (!msalInstance) {
        console.log("Initializing MSAL with Redirect URI:", window.location.origin);
        msalInstance = new PublicClientApplication({
            auth: {
                clientId: clientId,
                authority: `https://login.microsoftonline.com/${tenantId}`,
                redirectUri: window.location.origin, // Automatically detects your current URL
            },
            cache: {
                cacheLocation: "sessionStorage", 
                storeAuthStateInCookie: false,
            }
        });
        await msalInstance.initialize();
    }
    return msalInstance;
};

export const signOut = async () => {
    const msal = await initializeMsal();
    // Aggressive cleanup
    const accounts = msal.getAllAccounts();
    if (accounts.length > 0) {
        // Just clear cache, don't necessarily need full redirect logout if we clear storage
        // But logoutPopup is cleaner for MS session
        try {
            await msal.logoutPopup();
        } catch (e) {
            console.warn("Logout popup failed or cancelled", e);
        }
    }
    
    // Nuke all storage
    sessionStorage.clear();
    
    // Clear LocalStorage MSAL keys specifically
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('msal') || key.includes('authority'))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    msalInstance = null;
};

// EXPORTED GENERIC TOKEN FETCHER
export const getGraphToken = async (scopes: string[], forceInteractive: boolean = false): Promise<string> => {
    const clientId = getStoredClientId();
    if (!clientId) throw new Error("Client ID not configured");

    const msal = await initializeMsal();
    const accounts = msal.getAllAccounts();
    let account = accounts[0];

    if (account && !forceInteractive) {
        try {
            const response = await msal.acquireTokenSilent({
                scopes,
                account: account
            });
            return response.accessToken;
        } catch (e) {
            console.warn("Silent token acquisition failed, attempting interactive...", e);
            // Silent failed, try popup with forced prompt
            const response = await msal.acquireTokenPopup({ 
                scopes, 
                account,
                prompt: 'select_account' 
            });
            return response.accessToken;
        }
    } else {
        // Interactive required or forced
        console.log("Acquiring token interactively (forced or no account)...");
        // Use prompt: 'select_account' to force UI and refresh consent
        const response = await msal.acquireTokenPopup({ 
            scopes,
            prompt: 'select_account'
        });
        return response.accessToken;
    }
};

export const fetchOutlookEmails = async (): Promise<Lead[]> => {
    const clientId = getStoredClientId();

    // If user hasn't configured the ID yet, return simulation with a warning
    if (!clientId) {
        console.warn("Azure Client ID not set. Returning simulated data.");
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    { id: Date.now().toString(), name: 'Robert Davis', company: 'Davis Dev', email: 'rob@davisdev.com', phone: '305-555-0000', source: 'Outlook', status: 'New', notes: 'SIMULATION: Please enter your Client ID in the CRM settings to sync real emails.', dateAdded: new Date().toISOString() },
                ]);
            }, 1500);
        });
    }

    try {
        const accessToken = await getGraphToken(["User.Read", "Mail.Read"]);

        // 2. Call Microsoft Graph API with Date Filter
        // Calculate date 8 days ago
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        const filterDate = eightDaysAgo.toISOString();

        // Fetch messages where receivedDateTime is greater than or equal to 8 days ago
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${filterDate}&$top=50&$select=sender,subject,bodyPreview,receivedDateTime`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            // Check for AADSTS50011 specifically in error body if possible
            try {
                const errJson = await response.json();
                console.error("Graph API Error Body:", errJson);
            } catch (e) {}
            
            throw new Error(`Graph API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // 3. Transform Emails to Leads
        // We filter for emails that might be relevant (e.g., contain "Quote", "Estimate")
        const relevantEmails = data.value.filter((email: any) => {
            const subject = (email.subject || "").toLowerCase();
            const body = (email.bodyPreview || "").toLowerCase();
            return subject.includes("quote") || subject.includes("estimate") || subject.includes("inquiry") || subject.includes("project") || body.includes("lead");
        });

        const leads: Lead[] = relevantEmails.map((email: any) => ({
            id: email.id,
            name: email.sender.emailAddress.name || "Unknown Sender",
            company: "Unknown", 
            email: email.sender.emailAddress.address,
            phone: "", 
            source: 'Outlook',
            status: 'New',
            notes: `Subject: ${email.subject}\n\nPreview: ${email.bodyPreview}`,
            dateAdded: email.receivedDateTime
        }));

        return leads;

    } catch (error) {
        // Just rethrow, component will handle specific error messages
        throw error;
    }
};

export const fetchGmailEmails = async (): Promise<Lead[]> => {
    // Placeholder for Gmail Logic - Requires Google API Client Library
    console.log("Fetching Gmail (Simulated)...");
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([]);
        }, 1500);
    });
};