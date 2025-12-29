

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  PROJECTS = 'PROJECTS',
  ESTIMATE_NEW = 'ESTIMATE_NEW',
  DATABASE = 'DATABASE',
  CRM = 'CRM',
  SERVICE = 'SERVICE',
  PRICE_ANALYSIS = 'PRICE_ANALYSIS',
  CLOUD_DB = 'CLOUD_DB'
}

export type UserRole = 'admin' | 'estimator' | 'technician';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  avatarInitials: string;
  mustChangePassword?: boolean;
  password?: string;
}

export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  materialCost: number;
  laborHours: number;
  source: 'AI' | 'Real';
}

export interface EstimateLineItem {
  id: string;
  description: string;
  quantity: number;
  materialId?: string;
  unitMaterialCost: number;
  unitLaborHours: number;
  laborRate: number;
  attachments?: { name: string; data: string; type: string }[];
}

export interface ProjectFile {
    id: string;
    name: string;
    category: 'Plan' | 'Permit' | 'Inspection' | 'As-Built' | 'Other';
    uploadDate: string;
    fileData?: string;
    fileType?: string;
}

export interface ProjectEstimate {
  id: string;
  name: string;
  client: string;
  contactInfo?: string;
  address: string;
  city?: string;
  estimator?: string;
  dateCreated: string;
  deliveryDate?: string;
  expirationDate?: string;
  awardedDate?: string;
  startDate?: string;
  completionDate?: string;
  status: 'Draft' | 'Sent' | 'Won' | 'Lost' | 'Ongoing' | 'Completed' | 'Finalized';
  contractValue?: number;
  laborRate: number;
  items: EstimateLineItem[];
  blueprintImage?: string;
  projectImage?: string;
  quantityTableFile?: string;
  projectFiles?: ProjectFile[];
  scheduleFile?: string;
  scheduleMilestones?: string;
  followUpDate?: string;
}

export interface ProjectMapping {
  name: string;
  client: string;
  status: string;
  contractValue: string;
  address: string;
  estimator: string;
  dateCreated: string;
  awardedDate: string;
  area: string; // Nueva columna para filtrado
}

export interface TicketMapping {
  title: string;       // Maps to note/description
  client: string;
  status: string;
  amount: string;      // Total value
  dateCreated: string;
  projectName: string; // To link with existing project
}

export interface ServiceTicket {
  id: string;
  type: string;
  projectId?: string;
  clientName: string;
  address: string;
  status: 'Scheduled' | 'Sent' | 'Authorized' | 'Denied' | 'Completed';
  technician: string;
  dateCreated: string;
  items: EstimateLineItem[];
  photos: string[];
  notes: string;
  laborRate: number;
}

export interface Lead {
  id: string;
  name: string;
  company?: string;
  email: string;
  phone?: string;
  source: string;
  status: string;
  notes?: string;
  dateAdded: string;
}

export interface AnalysisResult {
  items: {
    description: string;
    count: number;
    reasoning: string;
  }[];
}

export interface PurchaseRecord {
  id: string;
  date: string;
  poNumber: string;
  brand: string;
  itemDescription: string;
  quantity: number;
  unitCost: number;
  tax?: number;
  totalCost: number;
  supplier: string;
  projectName: string;
  type: string;
  source?: string;
}

export interface VarianceItem {
  id: string;
  projectName: string;
  itemName: string;
  estimatedQty: number;
  estimatedUnitCost: number;
  purchasedQty: number;
  avgPurchasedCost: number;
  totalEstimated: number;
  totalPurchased: number;
  costVariance: number; 
  qtyVariance: number; 
  status: 'OK' | 'Over Budget' | 'Over Quantity' | 'Critical' | 'Unplanned';
}

export interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    details: string;
    timestamp: string;
}

export interface SupplierStatus {
    name: string;
    isBlocked: boolean; // True if > 60 days past due
    daysPastDue?: number;
}

export interface ShoppingItem {
    id: string;
    name: string;
    quantity: number;
}
