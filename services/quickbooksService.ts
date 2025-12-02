
import { PurchaseRecord } from "../types";

// CONFIGURATION
// Set this to true to use the simulation (for demo)
// Set this to false to use your real backend server (http://localhost:8000)
const USE_SIMULATION = true; 

const BACKEND_URL = 'http://localhost:8000';

export const connectToQuickBooks = async (): Promise<string> => {
    if (USE_SIMULATION) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simulate a successful redirect URL back to our app
                resolve(`${window.location.origin}?status=success`); 
            }, 1500);
        });
    } else {
        // REAL MODE: Get the Auth URL from your Node.js backend
        try {
            const response = await fetch(`${BACKEND_URL}/authUri`);
            const data = await response.json();
            // In a real scenario, you would window.location.href = data.url here
            // But for this function, we just return the URL to be handled by the component
            return data.url;
        } catch (error) {
            console.error("Backend not found. Is node server.js running?", error);
            throw new Error("Could not connect to Backend Server.");
        }
    }
};

export const fetchQuickBooksBills = async (): Promise<PurchaseRecord[]> => {
    if (USE_SIMULATION) {
        // ... Existing Simulation Logic ...
        console.log("Fetching from QuickBooks (Simulated)...");
        return new Promise((resolve) => {
            setTimeout(() => {
                const simulatedData: PurchaseRecord[] = [
                    {
                        id: 'qb-1001',
                        date: '2024-03-10T00:00:00.000Z',
                        poNumber: '1001',
                        brand: 'Square D',
                        itemDescription: '200A Panel Board NEMA 1',
                        quantity: 1,
                        unitCost: 350.00,
                        totalCost: 350.00,
                        supplier: 'World Electric (QB)',
                        projectName: 'Brickell City Centre',
                        type: 'Distribution',
                        source: 'QuickBooks'
                    },
                    {
                        id: 'qb-1002',
                        date: '2024-03-12T00:00:00.000Z',
                        poNumber: '1002',
                        brand: 'Southwire',
                        itemDescription: '12/2 Romex Wire (1000ft)',
                        quantity: 2,
                        unitCost: 280.00,
                        totalCost: 560.00,
                        supplier: 'CES (QB)',
                        projectName: 'Coral Gables Villa',
                        type: 'Wire',
                        source: 'QuickBooks'
                    }
                ];
                resolve(simulatedData);
            }, 2000);
        });
    } else {
        // REAL MODE: Fetch from your Node.js backend
        try {
            const response = await fetch(`${BACKEND_URL}/get-bills`);
            const qbData = await response.json();
            
            // Map QB Data to your App format
            // Note: You will need to adjust this mapping based on exactly what QB returns
            return qbData.QueryResponse.Bill.map((bill: any) => ({
                id: `qb-${bill.Id}`,
                date: bill.TxnDate,
                poNumber: bill.DocNumber || 'N/A',
                brand: 'N/A',
                itemDescription: bill.Line[0]?.Description || 'Unspecified Material', // Simplification: taking first line
                quantity: 1, 
                unitCost: bill.TotalAmt,
                totalCost: bill.TotalAmt,
                supplier: bill.VendorRef?.name || 'QuickBooks Vendor',
                projectName: 'QB Import',
                type: 'Material',
                source: 'QuickBooks'
            }));
        } catch (error) {
            console.error("Error fetching QB bills", error);
            throw new Error("Failed to fetch data from QuickBooks.");
        }
    }
};
