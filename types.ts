

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  ESTIMATE_NEW = 'ESTIMATE_NEW',
  DATABASE = 'DATABASE',
  PROJECTS = 'PROJECTS',
  CRM = 'CRM',
  SERVICE = 'SERVICE',
  PRICE_ANALYSIS = 'PRICE_ANALYSIS',
  CLOUD_DB = 'CLOUD_DB',
}

export type UserRole = 'admin' | 'estimator';

export interface User {
  id: string;
  username: string;
  name: string; // Used to match with project 'estimator' field
  role: UserRole;
  avatarInitials: string;
  mustChangePassword?: boolean; // Flag for first-time login
}

export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  materialCost: number;
  laborHours: number;
}

export interface EstimateLineItem {
  id: string;
  materialId?: string; // Link to database item if matched
  description: string;
  quantity: number;
  unitMaterialCost: number;
  unitLaborHours: number;
  laborRate: number; // Hourly rate for this specific line (defaults to project rate)
  attachments?: { name: string; data: string; type: string }[]; // For PDF/Word attachments
}

export interface ProjectFile {
  id: string;
  name: string;
  category: 'Permit' | 'As-Built' | 'Plan' | 'Inspection' | 'Other';
  uploadDate: string;
  fileData: string; // Base64
  fileType: string;
}

export interface ProjectEstimate {
  id: string;
  name: string;
  client: string;
  contactInfo?: string; // Phone or Email
  address: string; // Miami specific context
  city?: string;
  estimator?: string; // Who did it
  dateCreated: string;
  deliveryDate?: string;
  expirationDate?: string;
  followUpDate?: string; // Date to follow up (defaults to delivery + 7 days)
  awardedDate?: string; // Date the project was won
  
  // Project Management Fields
  startDate?: string;
  completionDate?: string;
  status: 'Draft' | 'Finalized' | 'Sent' | 'Won' | 'Lost' | 'Ongoing' | 'Completed';
  
  projectFiles?: ProjectFile[]; // Permits, As-builts, etc.
  scheduleFile?: string; // Base64 for the project schedule
  scheduleMilestones?: string; // AI extracted summary of the schedule

  laborRate: number; // Global labor rate for the project
  items: EstimateLineItem[];
  blueprintImage?: string; // Base64 for the technical plan
  quantityTableFile?: string; // Base64 for the quantity table
  projectImage?: string; // Base64 for the project thumbnail/site photo
  contractValue?: number; // Manual override for historical projects
}

export interface AnalysisResult {
  items: {
    description: string;
    count: number;
    reasoning: string;
  }[];
}

// --- PURCHASE HISTORY TYPES ---

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

// --- CRM TYPES ---

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: 'Outlook' | 'Manual' | 'Referral' | 'Web';
  status: 'New' | 'Contacted' | 'Qualified' | 'Converted';
  notes: string;
  dateAdded: string;
}

export type OpportunityStage = 'Prospecting' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost';

export interface Opportunity {
  id: string;
  title: string;
  clientName: string;
  value: number;
  stage: OpportunityStage;
  closeDate: string;
  probability: number; // 0-100%
  owner: string; // Estimator Name
}

// --- SERVICE & CHANGE ORDER TYPES ---

export interface GeoLocation {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface ServiceTicket {
  id: string;
  type: 'Service Call' | 'Change Order';
  projectId?: string; // Linked project if Change Order
  clientName: string;
  address: string;
  status: 'Scheduled' | 'In Progress' | 'Sent' | 'Authorized' | 'Denied' | 'Completed' | 'Invoiced';
  technician: string;
  dateCreated: string;
  checkInLocation?: GeoLocation;
  checkOutLocation?: GeoLocation;
  photos: string[]; // Base64 images
  items: EstimateLineItem[];
  notes: string;
  laborRate: number; // Service rate is usually higher
}