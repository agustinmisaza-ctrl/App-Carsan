
import React, { useState, useEffect } from 'react';
import { ViewState, MaterialItem, ProjectEstimate, User, ServiceTicket, PurchaseRecord, Lead, Opportunity } from './types';
import { Sidebar } from './components/Sidebar';
import { PriceDatabase } from './components/PriceDatabase';
import { Estimator } from './components/Estimator';
import { ProjectList } from './components/ProjectList';
import { AIAssistant } from './components/AIAssistant';
import { CRM } from './components/CRM';
import { ServiceModule } from './components/ServiceModule';
import { PriceAnalysis } from './components/PriceAnalysis';
import { SharePointConnect } from './components/SharePointConnect';
import { Login } from './components/Login';
import { Menu, TrendingUp, Clock, Briefcase, AlertTriangle, Users, DollarSign, ShoppingCart, Wrench } from 'lucide-react';
import { processPurchaseData, INITIAL_CSV_DATA } from './utils/purchaseData';

// Comprehensive Miami Electrical Price Database
const INITIAL_MATERIALS: MaterialItem[] = [
    // --- CONDUIT & RACEWAY ---
    { id: 'r1', name: '4" Sq Box Deep (2-1/8")', category: 'Rough-in', unit: 'EA', materialCost: 4.50, laborHours: 0.35 },
    { id: 'r2', name: '4" Sq Box Shallow (1-1/2")', category: 'Rough-in', unit: 'EA', materialCost: 3.80, laborHours: 0.30 },
    { id: 'r3', name: 'Handy Box 1-Gang', category: 'Rough-in', unit: 'EA', materialCost: 2.20, laborHours: 0.25 },
    { id: 'r4', name: '1/2" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 8.50, laborHours: 0.50 },
    { id: 'r5', name: '3/4" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 14.20, laborHours: 0.60 },
    { id: 'r5b', name: '1" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 24.50, laborHours: 0.80 },
    { id: 'r5c', name: '1-1/4" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 32.00, laborHours: 1.00 },
    { id: 'r5d', name: '2" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 48.00, laborHours: 1.50 },
    { id: 'r5e', name: '4" EMT Conduit (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 125.00, laborHours: 3.50 },
    { id: 'r6', name: '1/2" EMT Coupling', category: 'Rough-in', unit: 'EA', materialCost: 0.80, laborHours: 0.05 },
    { id: 'r7', name: '1/2" EMT Connector', category: 'Rough-in', unit: 'EA', materialCost: 0.75, laborHours: 0.05 },
    { id: 'r8', name: '12/2 MC Cable (per 100\')', category: 'Rough-in', unit: 'RL', materialCost: 75.00, laborHours: 4.00 },
    { id: 'r9', name: '12/2 Romex (per 250\' Coil)', category: 'Rough-in', unit: 'RL', materialCost: 145.00, laborHours: 6.00 },
    { id: 'r10', name: '3/4" PVC Sch40 (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 6.00, laborHours: 0.40 },
    { id: 'r10b', name: '1" PVC Sch40 (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 8.50, laborHours: 0.50 },
    { id: 'r10c', name: '2" PVC Sch40 (10\' Stick)', category: 'Rough-in', unit: 'EA', materialCost: 16.00, laborHours: 0.80 },
    { id: 'r11', name: 'Mud Ring 1-Gang', category: 'Rough-in', unit: 'EA', materialCost: 2.50, laborHours: 0.10 },
    { id: 'r12', name: 'Mud Ring 2-Gang', category: 'Rough-in', unit: 'EA', materialCost: 3.00, laborHours: 0.10 },
    { id: 'r13', name: 'Ceiling Fan Box (New Work)', category: 'Rough-in', unit: 'EA', materialCost: 12.00, laborHours: 0.45 },
    { id: 'r14', name: 'Outdoor WP Box 1-Gang', category: 'Rough-in', unit: 'EA', materialCost: 9.50, laborHours: 0.35 },
    { id: 'r15', name: '1/2" Flex/Greenfield (100\' Roll)', category: 'Rough-in', unit: 'RL', materialCost: 65.00, laborHours: 4.00 },
    { id: 'r16', name: '1/2" Liquidtight Flex (100\' Roll)', category: 'Rough-in', unit: 'RL', materialCost: 110.00, laborHours: 5.00 },
    { id: 'r17', name: '3/4" Liquidtight Connector (Str)', category: 'Rough-in', unit: 'EA', materialCost: 8.50, laborHours: 0.20 },
    { id: 'r18', name: '1-5/8" Strut Channel (10\')', category: 'Rough-in', unit: 'EA', materialCost: 28.00, laborHours: 0.50 },
    { id: 'r19', name: '3/8" Threaded Rod (10\')', category: 'Rough-in', unit: 'EA', materialCost: 12.00, laborHours: 0.25 },
    { id: 'r20', name: 'Spring Nut 3/8" w/ Spring', category: 'Rough-in', unit: 'EA', materialCost: 1.50, laborHours: 0.05 },
    { id: 'r21', name: 'Beam Clamp 3/8"', category: 'Rough-in', unit: 'EA', materialCost: 3.50, laborHours: 0.10 },

    // --- WIRE & FEEDERS ---
    { id: 'w1', name: '#12 THHN Solid Copper (500\')', category: 'Wire', unit: 'RL', materialCost: 140.00, laborHours: 3.00 },
    { id: 'w2', name: '#10 THHN Stranded Copper (500\')', category: 'Wire', unit: 'RL', materialCost: 210.00, laborHours: 4.00 },
    { id: 'w3', name: '#8 THHN Stranded Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 0.95, laborHours: 0.015 },
    { id: 'w4', name: '#6 THHN Stranded Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 1.45, laborHours: 0.02 },
    { id: 'w5', name: '#4 THHN Stranded Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 2.25, laborHours: 0.03 },
    { id: 'w6', name: '#1/0 THHN Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 5.50, laborHours: 0.06 },
    { id: 'w7', name: '#4/0 THHN Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 11.00, laborHours: 0.08 },
    { id: 'w8', name: '500 MCM Copper (per ft)', category: 'Wire', unit: 'FT', materialCost: 24.00, laborHours: 0.15 },
    { id: 'w9', name: '#6 Bare Copper Ground (Solid)', category: 'Wire', unit: 'FT', materialCost: 1.40, laborHours: 0.02 },

    // --- GROUNDING ---
    { id: 'g1', name: '5/8" x 8\' Copper Ground Rod', category: 'Grounding', unit: 'EA', materialCost: 18.00, laborHours: 0.75 },
    { id: 'g2', name: 'Acorn Clamp 5/8"', category: 'Grounding', unit: 'EA', materialCost: 3.50, laborHours: 0.10 },
    { id: 'g3', name: 'Intersystem Bonding Bridge', category: 'Grounding', unit: 'EA', materialCost: 25.00, laborHours: 0.50 },

    // --- TRIM / DEVICES ---
    { id: 't1', name: 'Duplex Receptacle 15A (Resi)', category: 'Trim', unit: 'EA', materialCost: 3.50, laborHours: 0.25 },
    { id: 't2', name: 'Duplex Receptacle 20A (Comm)', category: 'Trim', unit: 'EA', materialCost: 5.50, laborHours: 0.30 },
    { id: 't3', name: 'GFI Receptacle 15A', category: 'Trim', unit: 'EA', materialCost: 18.20, laborHours: 0.35 },
    { id: 't4', name: 'GFI Receptacle 20A WR (Outdoor)', category: 'Trim', unit: 'EA', materialCost: 24.00, laborHours: 0.40 },
    { id: 't5', name: 'USB Receptacle Duplex', category: 'Trim', unit: 'EA', materialCost: 25.00, laborHours: 0.35 },
    { id: 't6', name: '1-Pole Switch 20A', category: 'Trim', unit: 'EA', materialCost: 3.80, laborHours: 0.25 },
    { id: 't7', name: '3-Way Switch 20A', category: 'Trim', unit: 'EA', materialCost: 5.50, laborHours: 0.35 },
    { id: 't8', name: '4-Way Switch 20A', category: 'Trim', unit: 'EA', materialCost: 12.00, laborHours: 0.40 },
    { id: 't9', name: 'LED Dimmer Switch', category: 'Trim', unit: 'EA', materialCost: 28.00, laborHours: 0.40 },
    { id: 't10', name: 'Occupancy Sensor (Wall)', category: 'Trim', unit: 'EA', materialCost: 45.00, laborHours: 0.50 },
    { id: 't11', name: 'Floor Box Assembly', category: 'Trim', unit: 'EA', materialCost: 250.00, laborHours: 1.50 },
    { id: 't12', name: 'Dryer Receptacle 30A', category: 'Trim', unit: 'EA', materialCost: 15.00, laborHours: 0.50 },
    { id: 't13', name: 'Range Receptacle 50A', category: 'Trim', unit: 'EA', materialCost: 18.00, laborHours: 0.50 },
    { id: 't14', name: 'Weatherproof Cover (In-Use)', category: 'Trim', unit: 'EA', materialCost: 12.00, laborHours: 0.10 },

    // --- LIGHTING ---
    { id: 'l1', name: '4" Recessed Can LED (Wafer)', category: 'Lighting', unit: 'EA', materialCost: 22.00, laborHours: 0.50 },
    { id: 'l2', name: '6" Recessed Can LED (Wafer)', category: 'Lighting', unit: 'EA', materialCost: 28.00, laborHours: 0.55 },
    { id: 'l3', name: '2x4 LED Flat Panel', category: 'Lighting', unit: 'EA', materialCost: 85.00, laborHours: 0.75 },
    { id: 'l4', name: '2x2 LED Flat Panel', category: 'Lighting', unit: 'EA', materialCost: 65.00, laborHours: 0.60 },
    { id: 'l5', name: '4\' LED Strip Light (Utility)', category: 'Lighting', unit: 'EA', materialCost: 45.00, laborHours: 0.65 },
    { id: 'l6', name: 'Exit Sign LED (Universal)', category: 'Lighting', unit: 'EA', materialCost: 35.00, laborHours: 0.75 },
    { id: 'l7', name: 'Emergency Light (Bug Eye)', category: 'Lighting', unit: 'EA', materialCost: 45.00, laborHours: 0.75 },
    { id: 'l8', name: 'Exterior Wall Pack LED', category: 'Lighting', unit: 'EA', materialCost: 120.00, laborHours: 1.00 },
    { id: 'l9', name: 'LED High Bay Fixture', category: 'Lighting', unit: 'EA', materialCost: 180.00, laborHours: 1.50 },
    { id: 'l10', name: 'Landscape Spot Light', category: 'Lighting', unit: 'EA', materialCost: 55.00, laborHours: 0.75 },

    // --- DISTRIBUTION & GEAR ---
    { id: 'd1', name: '200A Main Breaker Panel (42c)', category: 'Distribution', unit: 'EA', materialCost: 350.00, laborHours: 4.50 },
    { id: 'd2', name: '100A Main Breaker Panel (24c)', category: 'Distribution', unit: 'EA', materialCost: 220.00, laborHours: 3.50 },
    { id: 'd3', name: '100A Sub Panel MLO', category: 'Distribution', unit: 'EA', materialCost: 150.00, laborHours: 3.00 },
    { id: 'd3b', name: '225A 3-Phase Panelboard 42c', category: 'Distribution', unit: 'EA', materialCost: 1200.00, laborHours: 8.00 },
    { id: 'd4', name: '20A 1-Pole Breaker', category: 'Distribution', unit: 'EA', materialCost: 8.50, laborHours: 0.15 },
    { id: 'd5', name: '20A 1-Pole AFCI/GFCI Breaker', category: 'Distribution', unit: 'EA', materialCost: 55.00, laborHours: 0.20 },
    { id: 'd6', name: '30A 2-Pole Breaker', category: 'Distribution', unit: 'EA', materialCost: 18.00, laborHours: 0.25 },
    { id: 'd7', name: '50A 2-Pole Breaker', category: 'Distribution', unit: 'EA', materialCost: 22.00, laborHours: 0.25 },
    { id: 'd7b', name: '100A 2-Pole Breaker', category: 'Distribution', unit: 'EA', materialCost: 85.00, laborHours: 0.30 },
    { id: 'd8', name: '200A Meter Can (Miami/FPL)', category: 'Distribution', unit: 'EA', materialCost: 180.00, laborHours: 2.50 },
    { id: 'd9', name: '#3/0 Copper THHN (Service) per ft', category: 'Distribution', unit: 'FT', materialCost: 6.50, laborHours: 0.10 },
    { id: 'd10', name: '30A Safety Switch (Disconnect) NF', category: 'Distribution', unit: 'EA', materialCost: 65.00, laborHours: 1.50 },
    { id: 'd11', name: '60A Safety Switch (Disconnect) NF', category: 'Distribution', unit: 'EA', materialCost: 110.00, laborHours: 2.00 },
    { id: 'd12', name: '45kVA Transformer 480-208/120V', category: 'Distribution', unit: 'EA', materialCost: 2800.00, laborHours: 12.00 },
    { id: 'd13', name: '75kVA Transformer 480-208/120V', category: 'Distribution', unit: 'EA', materialCost: 4200.00, laborHours: 16.00 },

    // --- ENCLOSURES ---
    { id: 'e1', name: '6x6x4 NEMA 1 Junction Box', category: 'Enclosures', unit: 'EA', materialCost: 18.00, laborHours: 0.50 },
    { id: 'e2', name: '8x8x4 NEMA 1 Junction Box', category: 'Enclosures', unit: 'EA', materialCost: 28.00, laborHours: 0.60 },
    { id: 'e3', name: '12x12x6 NEMA 1 Junction Box', category: 'Enclosures', unit: 'EA', materialCost: 55.00, laborHours: 1.00 },
    { id: 'e4', name: '12x12x6 NEMA 3R Junction Box', category: 'Enclosures', unit: 'EA', materialCost: 85.00, laborHours: 1.25 },

    // --- LOW VOLTAGE & FIRE ---
    { id: 'lv1', name: 'Cat6 Data Drop (Jack+Plate)', category: 'Low Voltage', unit: 'EA', materialCost: 15.00, laborHours: 0.50 },
    { id: 'lv2', name: 'Coax TV Drop', category: 'Low Voltage', unit: 'EA', materialCost: 8.00, laborHours: 0.50 },
    { id: 'lv3', name: 'Smoke Detector 120V', category: 'Low Voltage', unit: 'EA', materialCost: 35.00, laborHours: 0.45 },
    { id: 'lv4', name: 'Carbon Monoxide Det 120V', category: 'Low Voltage', unit: 'EA', materialCost: 45.00, laborHours: 0.45 },
    { id: 'lv5', name: 'Doorbell Kit (Chime+Button)', category: 'Low Voltage', unit: 'EA', materialCost: 45.00, laborHours: 1.50 },
    { id: 'fa1', name: 'Fire Alarm Horn/Strobe', category: 'Low Voltage', unit: 'EA', materialCost: 85.00, laborHours: 1.00 },
    { id: 'fa2', name: 'Fire Alarm Pull Station', category: 'Low Voltage', unit: 'EA', materialCost: 65.00, laborHours: 0.75 },
    { id: 'fa3', name: 'FPLP Fire Wire 14/2 (1000\')', category: 'Low Voltage', unit: 'BOX', materialCost: 350.00, laborHours: 8.00 },
    
    // --- FASTENERS & SMALL PARTS ---
    { id: 'f1', name: 'Wire Nuts Red (Bag of 500)', category: 'Fasteners', unit: 'BOX', materialCost: 45.00, laborHours: 0.00 },
    { id: 'f2', name: 'Wire Nuts Yellow (Bag of 500)', category: 'Fasteners', unit: 'BOX', materialCost: 35.00, laborHours: 0.00 },
    { id: 'f3', name: 'Drywall Screws #6 1-1/4" (Box 8000)', category: 'Fasteners', unit: 'BOX', materialCost: 65.00, laborHours: 0.00 },
    { id: 'f4', name: 'Tapcons 1/4 x 1-1/4" (Box 100)', category: 'Fasteners', unit: 'BOX', materialCost: 25.00, laborHours: 0.00 },
    { id: 'f5', name: 'Plastic Anchors w/ Screws (Box 100)', category: 'Fasteners', unit: 'BOX', materialCost: 12.00, laborHours: 0.00 },
    { id: 'f6', name: 'Electrical Tape (Black)', category: 'Fasteners', unit: 'EA', materialCost: 2.50, laborHours: 0.00 },
    { id: 'f7', name: 'Cable Ties 8" (Bag of 100)', category: 'Fasteners', unit: 'C', materialCost: 8.00, laborHours: 0.00 },
    { id: 'f8', name: 'Strut Washers Square (Box 100)', category: 'Fasteners', unit: 'C', materialCost: 45.00, laborHours: 0.00 },
];

const getProjectValue = (p: ProjectEstimate) => {
    if (p.contractValue) return p.contractValue;
    const mat = p.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
    const lab = p.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * i.laborRate), 0);
    const sub = mat + lab;
    return sub + (sub * 0.25); 
};

// HARD RESET FLAG - SET TO TRUE ONCE TO CLEAR DATA, THEN FALSE
const RESET_APP = false;

// Generic Helper to load from LocalStorage
const loadState = <T,>(key: string, fallback: T): T => {
    if (RESET_APP) return fallback;
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error(`Failed to parse ${key} from storage`, e);
            return fallback;
        }
    }
    return fallback;
};

export const App: React.FC = () => {
    // Log Version for debugging
    useEffect(() => {
        console.log("Carsan Estimator v1.3 Loaded - Production Build");
    }, []);

    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    // --- STATE WITH PERSISTENCE ---
    const [materials, setMaterials] = useState<MaterialItem[]>(() => loadState('carsan_materials', INITIAL_MATERIALS));
    const [projects, setProjects] = useState<ProjectEstimate[]>(() => loadState('carsan_projects', []));
    const [tickets, setTickets] = useState<ServiceTicket[]>(() => loadState('carsan_tickets', []));
    const [leads, setLeads] = useState<Lead[]>(() => loadState('carsan_leads', []));
    const [opportunities, setOpportunities] = useState<Opportunity[]>(() => loadState('carsan_opportunities', []));
    
    // Purchase Data is special - check local storage, if empty, load utils
    const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
        if (RESET_APP) return processPurchaseData(INITIAL_CSV_DATA);
        const saved = localStorage.getItem('carsan_purchases');
        if (saved) {
            try { return JSON.parse(saved); } catch(e) {}
        }
        return processPurchaseData(INITIAL_CSV_DATA);
    });
  
    // --- EFFECTS TO SAVE STATE ---
    // Clear storage ONCE if reset is true
    useEffect(() => {
        if (RESET_APP) {
            console.log("HARD RESET: Clearing LocalStorage");
            localStorage.clear();
        }
    }, []);

    useEffect(() => { localStorage.setItem('carsan_materials', JSON.stringify(materials)); }, [materials]);
    useEffect(() => { localStorage.setItem('carsan_projects', JSON.stringify(projects)); }, [projects]);
    useEffect(() => { localStorage.setItem('carsan_tickets', JSON.stringify(tickets)); }, [tickets]);
    useEffect(() => { localStorage.setItem('carsan_leads', JSON.stringify(leads)); }, [leads]);
    useEffect(() => { localStorage.setItem('carsan_opportunities', JSON.stringify(opportunities)); }, [opportunities]);
    useEffect(() => { localStorage.setItem('carsan_purchases', JSON.stringify(purchases)); }, [purchases]);

    if (!user) {
      return <Login onLogin={setUser} />;
    }
  
    const handleLogout = () => {
      setUser(null);
      setCurrentView(ViewState.DASHBOARD);
    };

    // --- DASHBOARD METRICS ---
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const wonProjects = projects.filter(p => p.status === 'Won');
    const revenueYTD = wonProjects
        .filter(p => new Date(p.dateCreated).getFullYear() === currentYear)
        .reduce((acc, p) => acc + getProjectValue(p), 0);
    
    const sentThisMonth = projects.filter(p => p.status === 'Sent' && new Date(p.dateCreated).getMonth() === currentMonth && new Date(p.dateCreated).getFullYear() === currentYear).length;
    const sentThisYear = projects.filter(p => p.status === 'Sent' && new Date(p.dateCreated).getFullYear() === currentYear).length;
    const pipelineValue = projects.filter(p => p.status === 'Sent').reduce((acc, p) => acc + getProjectValue(p), 0);

    const totalPurchasesYTD = purchases
        .filter(p => new Date(p.date).getFullYear() === currentYear)
        .reduce((acc, p) => acc + p.totalCost, 0);

    const ongoingProjects = projects.filter(p => p.status === 'Ongoing');
    const pendingCOs = tickets.filter(t => t.status === 'Sent' || t.status === 'Scheduled');
    
    // 7-Day Follow Up Rule
    const urgentFollowUps = projects.filter(p => {
        if (p.status === 'Won' || p.status === 'Lost' || p.status === 'Ongoing') return false;
        // Logic: If follow up date is passed OR (no follow up date AND delivery date was > 7 days ago)
        if (p.followUpDate) {
            return new Date(p.followUpDate) <= today;
        }
        if (p.deliveryDate) {
            const delivery = new Date(p.deliveryDate);
            const diffTime = Math.abs(today.getTime() - delivery.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays > 7;
        }
        return false;
    });
  
    const renderContent = () => {
      switch (currentView) {
          case ViewState.DASHBOARD:
              return (
                  <div className="p-4 md:p-8 max-w-7xl mx-auto">
                      <div className="flex justify-between items-center mb-8">
                          <h1 className="text-3xl font-bold text-slate-900">Command Center</h1>
                          <div className="text-right">
                              <p className="text-sm font-medium text-slate-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                              <p className="text-xs text-slate-400">Welcome, {user.name}</p>
                          </div>
                      </div>

                      {/* TOP ROW: FINANCIAL HEALTH */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Revenue Won (YTD)</p>
                                      <p className="text-2xl font-bold text-slate-900 mt-1">${revenueYTD.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                                  </div>
                                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp className="w-6 h-6"/></div>
                              </div>
                              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">
                                  {wonProjects.length} Projects Won
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Pipeline</p>
                                      <p className="text-2xl font-bold text-slate-900 mt-1">${pipelineValue.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                                  </div>
                                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Briefcase className="w-6 h-6"/></div>
                              </div>
                              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                  {projects.filter(p => p.status === 'Sent').length} Proposals Sent
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Procurement Spend</p>
                                      <p className="text-2xl font-bold text-slate-900 mt-1">${totalPurchasesYTD.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                                  </div>
                                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><ShoppingCart className="w-6 h-6"/></div>
                              </div>
                              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded w-fit">
                                  {purchases.filter(p => new Date(p.date).getFullYear() === currentYear).length} Transactions
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Open Leads</p>
                                      <p className="text-2xl font-bold text-slate-900 mt-1">{leads.filter(l => l.status === 'New' || l.status === 'Contacted').length}</p>
                                  </div>
                                  <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Users className="w-6 h-6"/></div>
                              </div>
                              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded w-fit">
                                  Requires Outreach
                              </div>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          
                          {/* LEFT COLUMN: OPERATIONS & ESTIMATING */}
                          <div className="lg:col-span-2 space-y-6">
                              
                              {/* Estimating Stats */}
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                  <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                      <Clock className="w-5 h-5 text-blue-500"/> Estimating Output
                                  </h3>
                                  <div className="grid grid-cols-3 gap-4 text-center">
                                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                          <p className="text-xs text-slate-500 font-bold uppercase">Sent This Month</p>
                                          <p className="text-2xl font-bold text-slate-900 mt-1">{sentThisMonth}</p>
                                      </div>
                                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                          <p className="text-xs text-slate-500 font-bold uppercase">Sent This Year</p>
                                          <p className="text-2xl font-bold text-slate-900 mt-1">{sentThisYear}</p>
                                      </div>
                                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                          <p className="text-xs text-slate-500 font-bold uppercase">Drafts in Progress</p>
                                          <p className="text-2xl font-bold text-slate-900 mt-1">{projects.filter(p => p.status === 'Draft').length}</p>
                                      </div>
                                  </div>
                              </div>

                              {/* Operations: Ongoing Projects */}
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                      <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                          <Wrench className="w-5 h-5 text-amber-500"/> Operations Monitor
                                      </h3>
                                      <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{ongoingProjects.length} Active</span>
                                  </div>
                                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-3">
                                          <h4 className="text-xs font-bold text-slate-400 uppercase">Active Projects</h4>
                                          {ongoingProjects.slice(0, 3).map(p => (
                                              <div key={p.id} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 transition">
                                                  <span className="font-medium text-slate-800 truncate">{p.name}</span>
                                                  <span className="text-xs text-slate-500">{new Date(p.startDate || '').toLocaleDateString()}</span>
                                              </div>
                                          ))}
                                          {ongoingProjects.length === 0 && <p className="text-sm text-slate-400 italic">No active projects.</p>}
                                      </div>
                                      <div className="space-y-3 border-l border-slate-100 pl-4">
                                          <h4 className="text-xs font-bold text-slate-400 uppercase">Pending Change Orders</h4>
                                          {pendingCOs.slice(0, 3).map(co => (
                                              <div key={co.id} className="flex justify-between items-center text-sm p-2 bg-blue-50/50 rounded border border-blue-100">
                                                  <span className="font-medium text-slate-800 truncate">{co.clientName}</span>
                                                  <span className="text-xs font-bold text-blue-600">{co.status}</span>
                                              </div>
                                          ))}
                                          {pendingCOs.length === 0 && <p className="text-sm text-slate-400 italic">No pending COs.</p>}
                                      </div>
                                  </div>
                              </div>

                          </div>

                          {/* RIGHT COLUMN: ACTION ITEMS & PROCUREMENT */}
                          <div className="space-y-6">
                              
                              {/* Urgent Follow Ups */}
                              <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
                                  <div className="p-4 bg-red-50 border-b border-red-100">
                                      <h3 className="font-bold text-red-800 flex items-center gap-2">
                                          <AlertTriangle className="w-5 h-5"/> Urgent Follow-Ups
                                      </h3>
                                  </div>
                                  <div className="max-h-64 overflow-y-auto">
                                      {urgentFollowUps.length > 0 ? urgentFollowUps.map(p => (
                                          <div key={p.id} className="p-3 border-b border-slate-50 hover:bg-slate-50 transition">
                                              <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                                              <div className="flex justify-between items-center mt-1">
                                                  <span className="text-xs text-slate-500">{p.client}</span>
                                                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">Due Now</span>
                                              </div>
                                          </div>
                                      )) : (
                                          <div className="p-6 text-center text-slate-400 text-sm">No urgent follow-ups.</div>
                                      )}
                                  </div>
                              </div>

                              {/* Recent Purchases */}
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                  <h3 className="font-bold text-slate-900 mb-4 text-sm uppercase">Recent Procurement</h3>
                                  <div className="space-y-3">
                                      {purchases.slice(0, 4).map(po => (
                                          <div key={po.id} className="flex justify-between items-center text-sm">
                                              <div className="truncate max-w-[150px]">
                                                  <div className="font-medium text-slate-800 truncate">{po.itemDescription}</div>
                                                  <div className="text-[10px] text-slate-400">{po.supplier}</div>
                                              </div>
                                              <div className="font-bold text-slate-700 text-xs">${po.totalCost.toFixed(2)}</div>
                                          </div>
                                      ))}
                                  </div>
                                  <button onClick={() => setCurrentView(ViewState.PRICE_ANALYSIS)} className="w-full mt-4 text-xs font-bold text-blue-600 hover:underline text-center block">View Analysis</button>
                              </div>

                          </div>
                      </div>
                  </div>
              );
          case ViewState.ESTIMATE_NEW:
              return <Estimator materials={materials} projects={projects} />;
          case ViewState.DATABASE:
              return <PriceDatabase materials={materials} setMaterials={setMaterials} />;
          case ViewState.PROJECTS:
              return <ProjectList projects={projects} setProjects={setProjects} onOpenProject={(p) => { 
                  console.log("Opening project", p); 
                  setCurrentView(ViewState.ESTIMATE_NEW);
              }} tickets={tickets} />;
          case ViewState.CRM:
              return <CRM user={user} projects={projects} leads={leads} setLeads={setLeads} opportunities={opportunities} setOpportunities={setOpportunities} />;
          case ViewState.SERVICE:
              return <ServiceModule user={user} materials={materials} projects={projects} tickets={tickets} setTickets={setTickets} />;
          case ViewState.PRICE_ANALYSIS:
              return <PriceAnalysis purchases={purchases} setPurchases={setPurchases} materials={materials} setMaterials={setMaterials} />;
          case ViewState.CLOUD_DB:
              return <SharePointConnect projects={projects} materials={materials} setProjects={setProjects} setMaterials={setMaterials} />;
          default:
              return <div>View not found</div>;
      }
    };
  
    return (
      <div className="flex h-screen bg-slate-50">
          <Sidebar 
              currentView={currentView} 
              onChangeView={setCurrentView} 
              isOpen={isSidebarOpen} 
              onClose={() => setIsSidebarOpen(false)} 
              user={user}
              onLogout={handleLogout}
          />
          
          <div className="flex-1 flex flex-col h-full overflow-hidden md:pl-64 transition-all duration-300">
              <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20">
                   <div className="font-bold">CARSAN Estimator</div>
                   <button onClick={() => setIsSidebarOpen(true)}>
                       <Menu className="w-6 h-6" />
                   </button>
              </div>
              
              <main className="flex-1 overflow-y-auto">
                  {renderContent()}
              </main>
          </div>
  
          <AIAssistant projects={projects} materials={materials} tickets={tickets} />
      </div>
    );
};
