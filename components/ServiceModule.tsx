
import React, { useState, useEffect, useRef } from 'react';
import { ServiceTicket, ProjectEstimate, EstimateLineItem, User, MaterialItem } from '../types';
import { Plus, FileText, MapPin, Calendar, CheckCircle, Clock, DollarSign, AlertTriangle, User as UserIcon, Search, ArrowRight, Trash2, Paperclip, Mail, Download, Upload, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { generateInvoiceFromNotes } from '../services/geminiService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ServiceModuleProps {
    user: User;
    materials: MaterialItem[];
    projects: ProjectEstimate[];
    tickets: ServiceTicket[];
    setTickets: (tickets: ServiceTicket[]) => void;
}

export const ServiceModule: React.FC<ServiceModuleProps> = ({ user, materials, projects, tickets, setTickets }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets'>('dashboard');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingTicket, setEditingTicket] = useState<ServiceTicket | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Ticket Form State
    const [newTicket, setNewTicket] = useState<Partial<ServiceTicket>>({
        type: 'Change Order',
        status: 'Sent',
        items: [],
        laborRate: 85
    });
    const [notesInput, setNotesInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    
    const excelInputRef = useRef<HTMLInputElement>(null);

    // Derived Lists
    const ongoingProjects = projects.filter(p => p.status === 'Ongoing');
    const recentTickets = [...tickets].sort((a,b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
    
    const pendingAmount = tickets.filter(t => t.status === 'Sent').reduce((sum, t) => {
        const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
        const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
        return sum + mat + lab;
    }, 0);

    const approvedAmount = tickets.filter(t => t.status === 'Authorized').reduce((sum, t) => {
        const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
        const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
        return sum + mat + lab;
    }, 0);

    const staleTickets = tickets.filter(t => {
        const date = new Date(t.dateCreated);
        const diffTime = Math.abs(new Date().getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return t.status === 'Sent' && diffDays > 8;
    });

    // Handlers
    const handleCreateTicket = () => {
        const ticket: ServiceTicket = {
            id: `CO-${Date.now()}`,
            type: 'Change Order',
            projectId: newTicket.projectId || '',
            clientName: newTicket.clientName || 'Unknown',
            address: newTicket.address || '',
            status: 'Sent',
            technician: user.name,
            dateCreated: new Date().toISOString(),
            items: newTicket.items || [],
            photos: [],
            notes: newTicket.notes || '',
            laborRate: newTicket.laborRate || 85
        };
        setTickets([ticket, ...tickets]);
        setShowCreateModal(false);
        setNewTicket({ type: 'Change Order', status: 'Sent', items: [], laborRate: 85 });
        setNotesInput('');
    };

    const handleClearAllTickets = () => {
        if (confirm("Are you sure you want to delete ALL tickets? This action cannot be undone.")) {
            setTickets([]);
            alert("All tickets have been erased.");
        }
    };

    const handleGenerateInvoice = async () => {
        if (!notesInput) return;
        setIsGenerating(true);
        try {
            // In a real app, this calls Gemini with the materials DB
            // Simulating for now if not fully wired or using the imported service
            const items = await generateInvoiceFromNotes(notesInput, materials);
            
            const mappedItems: EstimateLineItem[] = items.map((item: any) => {
                const mat = materials.find(m => m.id === item.materialId);
                return {
                    id: Math.random().toString(),
                    description: item.description,
                    quantity: item.quantity,
                    unitMaterialCost: mat ? mat.materialCost : 0,
                    unitLaborHours: mat ? mat.laborHours : 0.5,
                    laborRate: newTicket.laborRate || 85
                };
            });

            setNewTicket(prev => ({ ...prev, items: [...(prev.items || []), ...mappedItems] }));
        } catch (error) {
            alert("Failed to generate items.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAttachFile = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            const attachment = { name: file.name, data: base64, type: file.type };
            
            if (editingTicket) {
                const updatedItems = editingTicket.items.map(i => {
                    if (i.id === itemId) {
                        return { ...i, attachments: [...(i.attachments || []), attachment] };
                    }
                    return i;
                });
                setEditingTicket({ ...editingTicket, items: updatedItems });
                setTickets(tickets.map(t => t.id === editingTicket.id ? { ...t, items: updatedItems } : t));
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSendForApproval = (ticket: ServiceTicket) => {
        // Generate PDF
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Change Order Request", 14, 20);
        doc.setFontSize(12);
        doc.text(`Client: ${ticket.clientName}`, 14, 30);
        doc.text(`Project: ${projects.find(p => p.id === ticket.projectId)?.name || 'N/A'}`, 14, 36);
        
        const tableData = ticket.items.map(item => [
            item.description,
            item.quantity,
            `$${item.unitMaterialCost}`,
            `$${(item.quantity * item.unitMaterialCost).toFixed(2)}`
        ]);

        autoTable(doc, {
            startY: 45,
            head: [['Item', 'Qty', 'Unit Cost', 'Total']],
            body: tableData,
        });

        doc.save(`ChangeOrder_${ticket.id}.pdf`);

        // Open Email
        const subject = `Approval Required: Change Order ${ticket.id}`;
        const body = `Please review the attached Change Order for ${ticket.clientName}.\n\nTotal: $${calculateTotal(ticket).toFixed(2)}\n\nPlease reply with 'Approved' to proceed.`;
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    };

    const updateStatus = (id: string, status: ServiceTicket['status']) => {
        setTickets(tickets.map(t => t.id === id ? { ...t, status } : t));
        if (editingTicket && editingTicket.id === id) {
            setEditingTicket({ ...editingTicket, status });
        }
    };

    const calculateTotal = (t: ServiceTicket) => {
        const mat = t.items.reduce((s, i) => s + (i.quantity * i.unitMaterialCost), 0);
        const lab = t.items.reduce((s, i) => s + (i.quantity * i.unitLaborHours * t.laborRate), 0);
        return mat + lab;
    };

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                let jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Pre-processing: Clean keys to remove BOM or whitespace
                jsonData = jsonData.map((row: any) => {
                    const newRow: any = {};
                    Object.keys(row).forEach(key => {
                        const cleanKey = key.trim().replace(/^[\uFEFF\uFFFE]/, '');
                        newRow[cleanKey] = row[key];
                    });
                    return newRow;
                });

                if (jsonData.length === 0) {
                    alert("Excel file appears to be empty.");
                    return;
                }
                
                // Helper to loosely matching keys
                const getValue = (row: any, keywords: string[]): any => {
                    const keys = Object.keys(row);
                    // 1. Exact match
                    for (const k of keywords) {
                        if (row[k] !== undefined) return row[k];
                    }
                    // 2. Case insensitive match
                    for (const k of keywords) {
                        const match = keys.find(key => key.toLowerCase() === k.toLowerCase());
                        if (match) return row[match];
                    }
                    // 3. Partial inclusion match
                    for (const k of keywords) {
                        const match = keys.find(key => key.toLowerCase().includes(k.toLowerCase()));
                        if (match) return row[match];
                    }
                    return undefined;
                };
                
                let updatedCount = 0;
                let addedCount = 0;
                const updatedTickets = [...tickets];

                jsonData.forEach((row: any) => {
                    // Smart Matching Logic
                    
                    // 1. Identify Project
                    const rawProject = getValue(row, ['Project', 'Job', 'Job Name', 'Project Name']);
                    const project = projects.find(p => 
                        (rawProject && p.name.toLowerCase().includes(String(rawProject).toLowerCase())) 
                    );

                    // 2. Identify Client
                    let clientName = project?.client;
                    if (!clientName) {
                        // Fallback to 'Requested By' or 'Approved By' if Client column missing
                        clientName = getValue(row, ['Client', 'Customer', 'Bill To', 'Customer Name', 'Client Name', 'Requested By', 'Approved By']);
                    }
                    if (!clientName) clientName = 'Unknown Client';

                    // 3. Status
                    const statusRaw = String(getValue(row, ['STATUS', 'Status', 'State', 'Stage']) || 'Pending');
                    let status: ServiceTicket['status'] = 'Sent';
                    const s = statusRaw.toLowerCase();
                    if (s.includes('approv') || s.includes('auth') || s.includes('won') || s.includes('accept')) status = 'Authorized';
                    else if (s.includes('reject') || s.includes('denied') || s.includes('lost')) status = 'Denied';
                    else if (s.includes('complete') || s.includes('done') || s.includes('paid')) status = 'Completed';
                    else if (s.includes('sched')) status = 'Scheduled';

                    // 4. Amount - Handle currency with quotes like "$33,825.00"
                    const amountRaw = getValue(row, ['Total', 'Amount', 'Cost', 'Price', 'Value', 'Est. Total', 'Total Amount']);
                    let amount = 0;
                    if (typeof amountRaw === 'number') amount = amountRaw;
                    else if (typeof amountRaw === 'string') {
                         // Remove $, commas, AND quotes which might persist from CSV parsing
                         amount = parseFloat(amountRaw.replace(/[$,"]/g, '')) || 0;
                    }

                    // 5. Title/Description
                    let title = getValue(row, ['Subject', 'Title', 'Description', 'Name', 'Change Order Name', 'CO Title']);
                    if (!title) title = getValue(row, ['Note', 'Notes', 'Remarks']);
                    if (!title) title = 'Imported Change Order';

                    // 6. Number/ID - Critical for updates
                    const coNumber = getValue(row, ['Change Order #', 'Change Order', 'Number', '#', 'CO#', 'ID', 'Reference', 'Ref']);

                    // 7. Date
                    const dateRaw = getValue(row, ['Date', 'Created', 'Issued', 'Date Created']);
                    let dateCreated = new Date().toISOString();
                    if (dateRaw) {
                        if (typeof dateRaw === 'number') {
                            dateCreated = new Date(Math.round((dateRaw - 25569) * 86400 * 1000)).toISOString();
                        } else {
                             const parsed = new Date(dateRaw);
                             if (!isNaN(parsed.getTime())) dateCreated = parsed.toISOString();
                        }
                    }

                    const ticketObj: ServiceTicket = {
                        id: coNumber ? `CO-EXCEL-${coNumber}` : `CO-IMP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                        type: 'Change Order',
                        projectId: project ? project.id : undefined,
                        clientName: String(clientName),
                        address: project ? project.address : (getValue(row, ['Address', 'Location', 'Site']) || 'Miami, FL'),
                        status: status,
                        technician: user.name || 'Imported',
                        dateCreated: dateCreated,
                        items: [{
                            id: `item-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                            description: String(title),
                            quantity: 1,
                            unitMaterialCost: amount, 
                            unitLaborHours: 0,
                            laborRate: 0
                        }],
                        photos: [],
                        notes: `Imported from Excel. Ref: ${coNumber || 'N/A'}`,
                        laborRate: 85
                    };

                    // UPSERT LOGIC
                    const existingIndex = updatedTickets.findIndex(t => 
                        (coNumber && t.id === `CO-EXCEL-${coNumber}`) || 
                        (coNumber && t.notes.includes(`Ref: ${coNumber}`))
                    );

                    if (existingIndex >= 0) {
                        // Update existing
                        updatedTickets[existingIndex] = { ...updatedTickets[existingIndex], ...ticketObj, id: updatedTickets[existingIndex].id }; // Keep original ID if found
                        updatedCount++;
                    } else {
                        // Add new
                        updatedTickets.push(ticketObj);
                        addedCount++;
                    }
                });

                setTickets(updatedTickets);
                alert(`Import Complete: ${addedCount} added, ${updatedCount} updated.`);
                if(excelInputRef.current) excelInputRef.current.value = '';
            } catch (error) {
                console.error(error);
                alert("Failed to parse Excel file. Check format.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Change Orders</h1>
                    <p className="text-slate-500 mt-1">Manage extra work, approvals, and service tickets.</p>
                </div>
                <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Dashboard</button>
                    <button onClick={() => setActiveTab('tickets')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'tickets' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>All Tickets</button>
                </div>
            </div>

            {/* DASHBOARD VIEW */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase">Pending Approval</p>
                            <p className="text-2xl font-bold text-blue-600 mt-1">${pendingAmount.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase">Authorized Revenue</p>
                            <p className="text-2xl font-bold text-emerald-600 mt-1">${approvedAmount.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase">Stale Tickets (More: 8 Days)</p>
                            <p className="text-2xl font-bold text-orange-600 mt-1">{staleTickets.length}</p>
                        </div>
                    </div>

                    {/* NEEDS ATTENTION */}
                    {staleTickets.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                            <h3 className="font-bold text-orange-800 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Needs Attention</h3>
                            <div className="space-y-3">
                                {staleTickets.map(t => (
                                    <div key={t.id} className="bg-white p-4 rounded-lg border border-orange-100 flex justify-between items-center shadow-sm">
                                        <div>
                                            <span className="font-bold text-slate-800">{t.clientName}</span>
                                            <span className="mx-2 text-slate-300">|</span>
                                            <span className="text-sm text-slate-500">Created: {new Date(t.dateCreated).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-slate-700">${calculateTotal(t).toLocaleString()}</span>
                                            <button 
                                                onClick={() => window.open(`mailto:?subject=Follow up: Change Order ${t.id}&body=Just checking in on this.`)}
                                                className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded font-bold hover:bg-orange-200"
                                            >
                                                Send Reminder
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RECENT ACTIVITY */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-800 mb-4">Recent Tickets</h3>
                        <div className="space-y-2">
                            {recentTickets.slice(0, 5).map(t => (
                                <div key={t.id} onClick={() => setEditingTicket(t)} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-100 transition">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${t.status === 'Authorized' ? 'bg-emerald-500' : t.status === 'Denied' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                        <div>
                                            <p className="font-medium text-sm text-slate-900">{t.clientName}</p>
                                            <p className="text-xs text-slate-500">{t.id} • {t.type}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm text-slate-700">${calculateTotal(t).toLocaleString()}</p>
                                        <p className="text-xs text-slate-400">{new Date(t.dateCreated).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ALL TICKETS VIEW */}
            {activeTab === 'tickets' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search tickets..." 
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                             <button 
                                onClick={handleClearAllTickets}
                                className="bg-white border border-red-200 text-red-700 px-3 py-2 rounded-lg font-bold text-sm hover:bg-red-50 flex items-center justify-center gap-2 flex-initial"
                                title="Erase All Tickets"
                            >
                                <Trash2 className="w-4 h-4" /> Erase All
                            </button>
                             <button 
                                onClick={() => excelInputRef.current?.click()}
                                className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-50 flex items-center justify-center gap-2 flex-1 md:flex-none"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Import/Update Excel
                            </button>
                            <input 
                                type="file" 
                                ref={excelInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls, .csv" 
                                onChange={handleExcelUpload} 
                            />
                            
                            <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2 flex-1 md:flex-none">
                                <Plus className="w-4 h-4" /> New Ticket
                            </button>
                        </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {recentTickets.filter(t => t.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || t.id.includes(searchTerm)).map(t => (
                            <div key={t.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition">
                                <div>
                                    <p className="font-bold text-slate-800">{t.clientName}</p>
                                    <p className="text-sm text-slate-500">{t.address}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold mt-1 inline-block ${
                                        t.status === 'Authorized' ? 'bg-emerald-100 text-emerald-700' : 
                                        t.status === 'Denied' ? 'bg-red-100 text-red-700' : 
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {t.status}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg">${calculateTotal(t).toLocaleString()}</p>
                                    <button onClick={() => setEditingTicket(t)} className="text-sm text-blue-600 hover:underline mt-1">View Details</button>
                                </div>
                            </div>
                        ))}
                        {recentTickets.length === 0 && (
                             <div className="p-8 text-center text-slate-400">
                                <p>No tickets found. Create a new one or import from Excel.</p>
                             </div>
                        )}
                    </div>
                </div>
            )}

            {/* CREATE MODAL */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-900">New Change Order</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600"><Trash2 className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Link to Ongoing Project</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    onChange={(e) => {
                                        const proj = projects.find(p => p.id === e.target.value);
                                        if (proj) setNewTicket({...newTicket, projectId: proj.id, clientName: proj.client, address: proj.address});
                                    }}
                                >
                                    <option value="">Select Project...</option>
                                    {ongoingProjects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.client})</option>)}
                                </select>
                            </div>
                            
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <h3 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4"/> Smart Invoicing</h3>
                                <textarea 
                                    className="w-full border border-blue-200 rounded-lg p-3 text-sm min-h-[100px]"
                                    placeholder="Describe the work done (e.g., 'Installed 2 GFI outlets in kitchen, used 50ft of wire')..."
                                    value={notesInput}
                                    onChange={(e) => setNotesInput(e.target.value)}
                                />
                                <button 
                                    onClick={handleGenerateInvoice}
                                    disabled={isGenerating}
                                    className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isGenerating ? 'AI Analyzing...' : 'Generate Line Items'}
                                </button>
                            </div>

                            {newTicket.items && newTicket.items.length > 0 && (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500">
                                            <tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Cost</th></tr>
                                        </thead>
                                        <tbody>
                                            {newTicket.items.map((item, idx) => (
                                                <tr key={idx} className="border-t border-slate-50">
                                                    <td className="p-2">{item.description}</td>
                                                    <td className="p-2 text-right">{item.quantity}</td>
                                                    <td className="p-2 text-right">${item.unitMaterialCost}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-slate-600 font-bold">Cancel</button>
                            <button onClick={handleCreateTicket} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800">Create Ticket</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT/VIEW TICKET MODAL */}
            {editingTicket && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Ticket {editingTicket.id}</h2>
                                <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                                    editingTicket.status === 'Authorized' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}>{editingTicket.status}</span>
                            </div>
                            <button onClick={() => setEditingTicket(null)} className="text-slate-400 hover:text-slate-600"><Trash2 className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-6 space-y-6 flex-1 overflow-auto">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="block text-slate-500 text-xs uppercase font-bold">Client</span>
                                    <span className="font-medium">{editingTicket.clientName}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-500 text-xs uppercase font-bold">Address</span>
                                    <span className="font-medium">{editingTicket.address}</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-500 font-bold text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Item</th>
                                            <th className="px-4 py-3 text-right">Qty</th>
                                            <th className="px-4 py-3 text-right">Rate</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {editingTicket.items.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium">{item.description}</div>
                                                    {item.attachments && item.attachments.map((att, i) => (
                                                        <a key={i} href={att.data} download={att.name} className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1">
                                                            <Paperclip className="w-3 h-3" /> {att.name}
                                                        </a>
                                                    ))}
                                                </td>
                                                <td className="px-4 py-3 text-right">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right">${item.unitMaterialCost}</td>
                                                <td className="px-4 py-3 text-right font-bold">${(item.quantity * item.unitMaterialCost).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <label className="cursor-pointer text-slate-400 hover:text-blue-500">
                                                        <Paperclip className="w-4 h-4" />
                                                        <input type="file" className="hidden" onChange={(e) => handleAttachFile(item.id, e)} />
                                                    </label>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold text-slate-800">
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                                            <td className="px-4 py-3 text-right">${calculateTotal(editingTicket).toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Action Bar */}
                            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    onClick={() => handleSendForApproval(editingTicket)}
                                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                                >
                                    <Mail className="w-4 h-4" /> Send for Approval
                                </button>
                                <button 
                                    onClick={() => {
                                        const doc = new jsPDF();
                                        doc.text(`Change Order ${editingTicket.id}`, 10, 10);
                                        doc.save("CO.pdf");
                                    }}
                                    className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> PDF
                                </button>
                            </div>

                            {editingTicket.status === 'Sent' && (
                                <div className="flex gap-3 mt-2">
                                    <button onClick={() => updateStatus(editingTicket.id, 'Authorized')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700">Authorize</button>
                                    <button onClick={() => updateStatus(editingTicket.id, 'Denied')} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700">Deny</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
