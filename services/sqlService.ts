
import { ProjectEstimate, MaterialItem, ServiceTicket } from "../types";

const API_URL = 'http://localhost:3001/api';

// Helper to check if API is alive
export const checkConnection = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${API_URL}/health`, { method: 'HEAD' });
        return res.ok;
    } catch (e) {
        return false;
    }
};

// --- PROJECTS ---
export const fetchSqlProjects = async (): Promise<ProjectEstimate[]> => {
    try {
        const response = await fetch(`${API_URL}/projects`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        
        // Ensure date strings are valid ISO strings if SQL returns different formats
        return data.map((p: any) => ({
            ...p,
            items: typeof p.items === 'string' ? JSON.parse(p.items) : p.items || []
        }));
    } catch (error) {
        console.warn("SQL Service: Could not fetch projects (Backend likely offline). Using LocalStorage.");
        throw error;
    }
};

export const syncProjectToSql = async (project: ProjectEstimate): Promise<void> => {
    try {
        // We serialize complex objects like 'items' to string for SQL storage unless you have relational tables
        const payload = {
            ...project,
            items: JSON.stringify(project.items) 
        };

        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Failed to save project');
    } catch (error) {
        console.error("SQL Save Failed", error);
        throw error;
    }
};

// --- MATERIALS ---
export const fetchSqlMaterials = async (): Promise<MaterialItem[]> => {
    const response = await fetch(`${API_URL}/materials`);
    if (!response.ok) throw new Error('Failed to fetch materials');
    return await response.json();
};

// --- TICKETS ---
export const fetchSqlTickets = async (): Promise<ServiceTicket[]> => {
    const response = await fetch(`${API_URL}/tickets`);
    if (!response.ok) throw new Error('Failed to fetch tickets');
    return await response.json();
};
