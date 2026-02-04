
import { PurchaseRecord } from "../types";

// Helper to parse currency strings like " $35,953.80 " or "3,000"
export const parseCurrency = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val);
    // Remove $, commas, spaces, quotes, and non-breaking spaces
    const clean = str.replace(/[$,\s"']/g, '').trim();
    return parseFloat(clean) || 0;
};

// Helper to parse quantities that might have commas (e.g., "3,000")
export const parseNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val);
    // Remove commas, quotes, spaces
    const clean = str.replace(/[, "'\s]/g, '').trim();
    return parseFloat(clean) || 0;
};

// Robust date parser to handle ISO, Excel serials, and common slash formats
export const robustParseDate = (val: any): Date => {
    if (!val) return new Date();
    
    // Handle Date objects
    if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;

    // Handle Excel Serial Numbers
    if (typeof val === 'number') {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
    }

    if (typeof val === 'string') {
        const cleanVal = val.trim().replace(/['"]/g, ''); // Remove quotes
        
        // Try ISO format (fastest)
        const isoDate = new Date(cleanVal);
        if (!isNaN(isoDate.getTime())) return isoDate;

        // Try DD/MM/YYYY or MM/DD/YYYY manually if slash present
        const parts = cleanVal.split(/[\/\-\.]/);
        if (parts.length === 3) {
            const p0 = parseInt(parts[0]);
            const p1 = parseInt(parts[1]);
            const p2 = parseInt(parts[2]);

            // If p0 > 12, it must be DD/MM/YYYY (e.g. 21/01/2025)
            if (p0 > 12) return new Date(p2, p1 - 1, p0);
            // Default to MM/DD/YYYY for standard US compatibility
            return new Date(p2, p0 - 1, p1);
        }
    }

    return new Date();
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

// Helper to normalize supplier names
export const normalizeSupplier = (name: string): string => {
    if (!name) return 'Unknown';
    const clean = name.trim().replace(/^"|"$/g, '');
    if (['CES', 'CED', 'G&G', 'ABC'].includes(clean.toUpperCase())) return clean.toUpperCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

export const processPurchaseData = (csvContent: string): PurchaseRecord[] => {
    const lines = csvContent.split('\n');
    const records: PurchaseRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVLine(line);
        if (cols.length < 5) continue; // Basic validation

        try {
            const dateObj = robustParseDate(cols[0]);
            
            // Clean up quoted strings for other fields
            const cleanStr = (s: string) => s ? s.trim().replace(/^"|"$/g, '') : '';

            let rawSupplier = cleanStr(cols[8]);
            let supplier = normalizeSupplier(rawSupplier);
            
            if (rawSupplier.toLowerCase().includes('world')) supplier = 'World Electric';
            if (rawSupplier.toLowerCase().includes('manhattan')) supplier = 'Manhattan';

            const record: PurchaseRecord = {
                id: `po-${cleanStr(cols[1])}-${i}`,
                date: dateObj.toISOString(),
                poNumber: cleanStr(cols[1]),
                brand: cleanStr(cols[2]),
                itemDescription: cleanStr(cols[3]),
                quantity: parseNumber(cols[4]),
                unitCost: parseCurrency(cols[5]),
                totalCost: parseCurrency(cols[7]),
                supplier: supplier,
                projectName: cleanStr(cols[9]),
                type: cleanStr(cols[10]) || 'Material'
            };
            records.push(record);
        } catch (e) {}
    }
    
    return records;
};

export const INITIAL_CSV_DATA = `Date,Purchase Order #,Brand,Item,Quantity,Unit Cost,TAX,Total,Supplier,Project,TYPE`;
