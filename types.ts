
export type UserRole = 'admin' | 'estimator' | 'technician';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  avatarInitials: string;
  mustChangePassword?: boolean;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  CRM = 'CRM',
  PROJECTS = 'PROJECTS',
  ESTIMATE_NEW = 'ESTIMATE_NEW',
  SERVICE = 'SERVICE',
  PRICE_ANALYSIS = 'PRICE_ANALYSIS',
  DATABASE = 'DATABASE',
  CLOUD_DB = 'CLOUD_DB'
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
  category: 'Plan' | 'Other';
  uploadDate: string;
  fileData: string;
  fileType: string;
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
  awardedDate?: string;
  startDate?: string;
  completionDate?: string;
  status: 'Draft' | 'Sent' | 'Won' | 'Lost' | 'Ongoing' | 'Completed' | 'Finalized';
  laborRate: number;
  items: EstimateLineItem[];
  projectFiles?: ProjectFile[];
  contractValue?: number;
  lastContactDate?: string;
  blueprintImage?: string;
}

export interface ServiceTicket {
  id: string;
  type: 'Change Order' | 'Service Call';
  projectId?: string;
  clientName: string;
  address: string;
  status: 'Sent' | 'Authorized' | 'Denied' | 'Completed' | 'Scheduled' | 'Pending';
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
  company: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  notes?: string;
  dateAdded: string;
}

export interface PurchaseRecord {
  id: string;
  date: string;
  poNumber: string;
  brand: string;
  itemDescription: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string;
  projectName: string;
  type: string;
  source?: string;
}

export interface AnalysisResult {
  items: {
    description: string;
    count: number;
    reasoning: string;
  }[];
}

export interface SupplierStatus {
    name: string;
    isBlocked: boolean;
}

export interface ShoppingItem {
    id: string;
    name: string;
    quantity: number;
}

export interface VarianceItem {
    description: string;
    estQty: number;
    estUnit: number;
    estTotal: number;
    actQty: number;
    actUnit: number;
    actTotal: number;
    variance: number;
    type: 'Match' | 'Unplanned';
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
  area: string; 
}

export interface TicketMapping {
  title: string;       
  client: string;
  status: string;
  amount: string;      
  dateCreated: string;
  projectName: string; 
}

export interface LeadMapping {
  name: string;    
  email: string;   
  phone: string;   
  company: string; 
  notes: string;   
}
