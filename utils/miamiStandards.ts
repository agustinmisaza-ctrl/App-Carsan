import { MaterialItem } from '../types';

export const MIAMI_STANDARD_PRICES: MaterialItem[] = [
  // CONDUIT
  { id: 'miami-emt-12', name: '1/2" EMT Conduit (10ft)', category: 'Rough-in', unit: 'EA', materialCost: 7.45, laborHours: 0.12, source: 'AI' },
  { id: 'miami-emt-34', name: '3/4" EMT Conduit (10ft)', category: 'Rough-in', unit: 'EA', materialCost: 11.20, laborHours: 0.15, source: 'AI' },
  { id: 'miami-emt-1', name: '1" EMT Conduit (10ft)', category: 'Rough-in', unit: 'EA', materialCost: 18.50, laborHours: 0.18, source: 'AI' },
  { id: 'miami-pvc-12', name: '1/2" PVC Sch 40 (10ft)', category: 'Rough-in', unit: 'EA', materialCost: 5.95, laborHours: 0.10, source: 'AI' },
  
  // WIRE
  { id: 'miami-wire-12-2-romex', name: '12/2 NM-B Romex (250ft RL)', category: 'Wire', unit: 'RL', materialCost: 125.00, laborHours: 1.50, source: 'AI' },
  { id: 'miami-wire-14-2-romex', name: '14/2 NM-B Romex (250ft RL)', category: 'Wire', unit: 'RL', materialCost: 98.00, laborHours: 1.40, source: 'AI' },
  { id: 'miami-wire-12-thhn-blk', name: '#12 THHN Stranded Black (500ft)', category: 'Wire', unit: 'RL', materialCost: 78.50, laborHours: 0.80, source: 'AI' },
  { id: 'miami-wire-10-thhn-blk', name: '#10 THHN Stranded Black (500ft)', category: 'Wire', unit: 'RL', materialCost: 115.00, laborHours: 0.90, source: 'AI' },

  // DEVICES
  { id: 'miami-dev-dup-15', name: '15A Duplex Receptacle White', category: 'Trim', unit: 'EA', materialCost: 1.15, laborHours: 0.25, source: 'AI' },
  { id: 'miami-dev-dup-20', name: '20A Duplex Receptacle White', category: 'Trim', unit: 'EA', materialCost: 2.45, laborHours: 0.25, source: 'AI' },
  { id: 'miami-dev-gfci-15', name: '15A GFCI Receptacle White', category: 'Trim', unit: 'EA', materialCost: 16.50, laborHours: 0.35, source: 'AI' },
  { id: 'miami-dev-sw-1p', name: '1-Pole Toggle Switch White', category: 'Trim', unit: 'EA', materialCost: 0.85, laborHours: 0.25, source: 'AI' },
  { id: 'miami-dev-sw-3w', name: '3-Way Toggle Switch White', category: 'Trim', unit: 'EA', materialCost: 2.10, laborHours: 0.35, source: 'AI' },

  // BOXES
  { id: 'miami-box-1g-plast', name: '1-Gang Plastic Nail-on Box', category: 'Rough-in', unit: 'EA', materialCost: 0.75, laborHours: 0.15, source: 'AI' },
  { id: 'miami-box-4-sq-metal', name: '4" Square Metal Box (Deep)', category: 'Rough-in', unit: 'EA', materialCost: 3.45, laborHours: 0.20, source: 'AI' },
  { id: 'miami-box-4-oct-metal', name: '4" Octagon Metal Box', category: 'Rough-in', unit: 'EA', materialCost: 2.95, laborHours: 0.20, source: 'AI' },

  // PANELS & BREAKERS
  { id: 'miami-brk-sqd-20-1', name: 'Square D Homeline 20A 1-Pole', category: 'Distribution', unit: 'EA', materialCost: 8.95, laborHours: 0.25, source: 'AI' },
  { id: 'miami-brk-sqd-30-2', name: 'Square D Homeline 30A 2-Pole', category: 'Distribution', unit: 'EA', materialCost: 24.50, laborHours: 0.40, source: 'AI' },
  { id: 'miami-pan-200-main', name: '200A Main Breaker Panel (40 Spc)', category: 'Distribution', unit: 'EA', materialCost: 385.00, laborHours: 6.00, source: 'AI' },
  
  // LIGHTING (Standard Miami)
  { id: 'miami-light-6-recessed', name: '6" LED Recessed Downlight (CCT)', category: 'Lighting', unit: 'EA', materialCost: 14.50, laborHours: 0.45, source: 'AI' },
  { id: 'miami-light-flat-panel', name: '2x4 LED Flat Panel (Center Basket)', category: 'Lighting', unit: 'EA', materialCost: 65.00, laborHours: 1.00, source: 'AI' }
];