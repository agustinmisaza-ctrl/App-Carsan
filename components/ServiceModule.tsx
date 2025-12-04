
import React, { useState, useEffect, useRef } from 'react';
import { ServiceTicket, ProjectEstimate, EstimateLineItem, User, MaterialItem } from '../types';
import { Plus, FileText, MapPin, Calendar, CheckCircle, Clock, DollarSign, AlertTriangle, User as UserIcon, Search, ArrowRight, Trash2, Paperclip, Mail, Download } from 'lucide-react';
import { generateInvoiceFromNotes } from '../services/geminiService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search tickets..." 
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                        <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> New Ticket
                        </button>
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
