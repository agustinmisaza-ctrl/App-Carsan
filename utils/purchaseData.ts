
import { PurchaseRecord } from "../types";

// Helper to parse currency strings like " $35,953.80 "
export const parseCurrency = (str: string): number => {
    if (!str) return 0;
    const clean = str.replace(/[$, ]/g, '').trim();
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

export const processPurchaseData = (csvContent: string): PurchaseRecord[] => {
    const lines = csvContent.split('\n');
    const records: PurchaseRecord[] = [];

    // Skip header row (index 0)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVLine(line);
        if (cols.length < 10) continue;

        // Map columns based on CSV structure:
        // Date, PO#, Brand, Item, Quantity, Unit Cost, TAX, Total, Supplier, Project, TYPE
        
        try {
            const dateStr = cols[0].trim();
            const quantityStr = cols[4].replace(/,/g, '').trim(); // Remove commas from qty like "3,000"
            
            // Standardize Supplier Names
            let supplier = cols[8].trim().replace(/^"|"$/g, '');
            if (supplier.toLowerCase().includes('ces')) supplier = 'CES';
            if (supplier.toLowerCase().includes('world')) supplier = 'World Electric';
            if (supplier.toLowerCase().includes('rexel')) supplier = 'Rexel';
            if (supplier.toLowerCase().includes('manhattan')) supplier = 'Manhattan';

            const record: PurchaseRecord = {
                id: `po-${cols[1]}-${i}`,
                date: new Date(dateStr).toISOString(),
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
