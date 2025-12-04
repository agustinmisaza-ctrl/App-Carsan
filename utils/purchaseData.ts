
import { PurchaseRecord } from "../types";

// Helper to parse currency strings like " $35,953.80 "
export const parseCurrency = (str: string): number => {
    if (!str) return 0;
    const clean = str.toString().replace(/[$, ]/g, '').trim();
    return parseFloat(clean) || 0;
};

// Helper to parse CSV line respecting quotes
export const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
};

// Helper to normalize supplier names (e.g., "REXEL" -> "Rexel")
export const normalizeSupplier = (name: string): string => {
    if (!name) return 'Unknown';
    const clean = name.trim();
    // Keep common acronyms uppercase
    if (['CES', 'CED', 'G&G', 'ABC'].includes(clean.toUpperCase())) return clean.toUpperCase();
    // Title Case for others
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

export const processPurchaseData = (csvContent: string): PurchaseRecord[] => {
    const lines = csvContent.split('\n');
    const records: PurchaseRecord[] = [];

    // Skip header row (index 0)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVLine(line);
        if (cols.length < 10) continue;

        try {
            // Fix date parsing
            let dateStr = cols[0].trim();
            // Try to parse standard date string
            let dateObj = new Date(dateStr);
            // If invalid, try manual MM/DD/YYYY parse if implied
            if (isNaN(dateObj.getTime()) && dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    // Assume MM/DD/YYYY
                    dateObj = new Date(`${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`);
                }
            }

            const quantityStr = cols[4].replace(/,/g, '').trim(); // Remove commas from qty like "3,000"
            
            // Standardize Supplier Names using helper
            let rawSupplier = cols[8].trim().replace(/^"|"$/g, '');
            let supplier = normalizeSupplier(rawSupplier);
            
            // Specific overrides based on your data
            if (rawSupplier.toLowerCase().includes('world')) supplier = 'World Electric';
            if (rawSupplier.toLowerCase().includes('manhattan')) supplier = 'Manhattan';

            const record: PurchaseRecord = {
                id: `po-${cols[1]}-${i}`,
                date: !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString(),
                poNumber: cols[1].trim(),
                brand: cols[2].trim(),
                itemDescription: cols[3].trim().replace(/^"|"$/g, ''), // Remove quotes
                quantity: parseFloat(quantityStr) || 0,
                unitCost: parseCurrency(cols[5]),
                totalCost: parseCurrency(cols[7]),
                supplier: supplier,
                projectName: cols[9].trim(),
                type: cols[10]?.trim() || 'Material'
            };
            records.push(record);
        } catch (e) {
            // console.warn(`Failed to parse line ${i}:`, line);
        }
    }
    
    return records;
};

// Empty Initial Data - Ready for user upload
export const INITIAL_CSV_DATA = `Date,Purchase Order #,Brand,Item,Quantity,Unit Cost,TAX,Total,Supplier,Project,TYPE`;
