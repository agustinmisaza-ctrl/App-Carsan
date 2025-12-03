
import React, { useState } from 'react';
import { ServiceTicket, User, MaterialItem, ProjectEstimate, EstimateLineItem } from '../types';
import { Camera, Plus, Clock, CheckCircle, ChevronLeft, Trash2, FileDiff, Sparkles, Loader2, AlertTriangle, Mail, BellRing, Download, Paperclip, AlertOctagon, TrendingUp } from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { generateInvoiceFromNotes } from '../services/geminiService';

interface ServiceModuleProps {
  user: User;
  materials: MaterialItem[];
  projects: ProjectEstimate[];
  tickets: ServiceTicket[];
  setTickets: (tickets: ServiceTicket[]) => void;
}

export const ServiceModule: React.FC<ServiceModuleProps> = ({ user, materials, projects, tickets, setTickets }) => {
  const [activeTicket, setActiveTicket] = useState<ServiceTicket | null>(null);
  
  // Smart Invoicing State
  const [techNotes, setTechNotes] = useState('');
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [manualMaterialId, setManualMaterialId] = useState('');

  const myTickets = user.role === 'admin' ? tickets : tickets.filter(t => t.technician === user.name);

  // Filter projects for dropdown (Prioritize Ongoing)
  const availableProjects = projects.sort((a, b) => {
      if (a.status === 'Ongoing' && b.status !== 'Ongoing') return -1;
      if (a.status !== 'Ongoing' && b.status === 'Ongoing') return 1;
      return 0;
  });

  // --- LOGIC: STALE DETECTION ---
  const isStale = (ticket: ServiceTicket) => {
      if (ticket.status !== 'Sent') return false;
      const created = new Date(ticket.dateCreated);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - created.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays > 8; // Alarm threshold
  };

  const staleTickets = myTickets.filter(isStale);

  // --- CALCULATION HELPERS ---
  const calculateTotal = (ticket: ServiceTicket) => {
      const mat = ticket.items.reduce((sum, i) => sum + (i.quantity * i.unitMaterialCost), 0);
      const lab = ticket.items.reduce((sum, i) => sum + (i.quantity * i.unitLaborHours * i.laborRate), 0);
      return mat + lab;
  };

  const totalPending = myTickets.filter(t => t.status === 'Sent').reduce((sum, t) => sum + calculateTotal(t), 0);
  const totalApproved = myTickets.filter(t => t.status === 'Authorized').reduce((sum, t) => sum + calculateTotal(t), 0);

  // --- PHOTO LOGIC ---
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeTicket) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const base64 = event.target?.result as string;
          const updatedTicket = {
              ...activeTicket,
              photos: [...activeTicket.photos, base64]
          };
          updateTicket(updatedTicket);
      };
      reader.readAsDataURL(file);
  };

  // --- ITEM ATTACHMENT LOGIC ---
  const handleItemAttachment = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeTicket) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const base64 = event.target?.result as string;
          const updatedItems = activeTicket.items.map(item => {
              if (item.id === itemId) {
                  return {
                      ...item,
                      attachments: [...(item.attachments || []), { name: file.name, data: base64, type: file.type }]
                  };
              }
              return item;
          });
          updateTicket({ ...activeTicket, items: updatedItems });
      };
      reader.readAsDataURL(file);
  };

  // --- INVOICE LOGIC ---
  const handleGenerateInvoice = async () => {
      if (!activeTicket || !techNotes) return;
      setIsGeneratingInvoice(true);
      
      try {
          const newItemsData = await generateInvoiceFromNotes(techNotes, materials);
          
          const newItems: EstimateLineItem[] = newItemsData.map((item: any) => {
              const matchedMaterial = materials.find(m => m.id === item.materialId);
              return {
                  id: Date.now() + Math.random().toString(),
                  materialId: item.materialId,
                  description: item.description || matchedMaterial?.name || "Item",
                  quantity: item.quantity || 1,
                  unitMaterialCost: matchedMaterial ? matchedMaterial.materialCost * 1.25 : 0,
                  unitLaborHours: matchedMaterial ? matchedMaterial.laborHours : 0,
                  laborRate: activeTicket.laborRate,
                  attachments: []
              };
          });

          if (newItems.length === 0) {
              alert("No matching items found in notes. Try adding manually.");
          } else {
               const updatedTicket = {
                  ...activeTicket,
                  items: [...activeTicket.items, ...newItems]
              };
              updateTicket(updatedTicket);
              setTechNotes(''); 
          }
      } catch (e) {
          console.error(e);
          alert("Error generating invoice.");
      } finally {
          setIsGeneratingInvoice(false);
      }
  };

  const handleManualAdd = () => {
      if (!activeTicket || !manualMaterialId) return;
      const material = materials.find(m => m.id === manualMaterialId);
      if (!material) return;

      const newItem: EstimateLineItem = {
          id: Date.now().toString(),
          materialId: material.id,
          description: material.name,
          quantity: 1,
          unitMaterialCost: material.materialCost * 1.25,
          unitLaborHours: material.laborHours,
          laborRate: activeTicket.laborRate,
          attachments: []
      };

      const updatedTicket = {
          ...activeTicket,
          items: [...activeTicket.items, newItem]
      };
      updateTicket(updatedTicket);
      setManualMaterialId('');
  };

  const removeItem = (itemId: string) => {
      if (!activeTicket) return;
      const updatedTicket = {
          ...activeTicket,
          items: activeTicket.items.filter(i => i.id !== itemId)
      };
      updateTicket(updatedTicket);
  };

  const updateTicket = (ticket: ServiceTicket) => {
      setTickets(tickets.map(t => t.id === ticket.id ? ticket : t));
      setActiveTicket(ticket);
  };

  const handleCreateChangeOrder = () => {
      // Default to first ongoing project if available
      const linkedProject = availableProjects.find(p => p.status === 'Ongoing') || availableProjects[0];
      
      const newTicket: ServiceTicket = {
          id: Date.now().toString(),
          type: 'Change Order',
          projectId: linkedProject?.id,
          clientName: linkedProject?.client || 'New Client',
          address: linkedProject?.address || 'Miami, FL',
          status: 'Scheduled',
          technician: user.name,
          dateCreated: new Date().toISOString(),
          items: [],
          photos: [],
          notes: '',
          laborRate: 95 
      };
      setTickets([newTicket, ...tickets]);
      setActiveTicket(newTicket);
  };

  const changeStatus = (newStatus: any) => {
      if (activeTicket) {
          updateTicket({ ...activeTicket, status: newStatus });
      }
  };

  // --- PDF GENERATION ---
  const generatePDFBlob = () => {
      if (!activeTicket) return null;
      const doc = new jsPDF();
      const project = projects.find(p => p.id === activeTicket.projectId);
      const contactInfo = project?.contactInfo || 'N/A';
      
      // Header
      doc.setFillColor(37, 99, 235); 
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text("CARSAN Electric", 14, 20);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text("Change Order Request", 14, 30);
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 160, 20);
      doc.text(`Ref #: ${activeTicket.id}`, 160, 26);
      
      // Client Info
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text("Client / Project:", 14, 50);
      doc.setFont('helvetica', 'normal');
      doc.text(activeTicket.clientName, 14, 56);
      doc.text(activeTicket.address, 14, 61);
      doc.text(`Contact: ${contactInfo}`, 14, 66);
      
      // Notes
      if (activeTicket.notes) {
          doc.setFont('helvetica', 'bold');
          doc.text("Description of Work:", 14, 80);
          doc.setFont('helvetica', 'normal');
          const splitNotes = doc.splitTextToSize(activeTicket.notes, 180);
          doc.text(splitNotes, 14, 86);
      }
      
      // Line Items
      const tableBody = activeTicket.items.map(item => {
          let desc = item.description;
          if (item.attachments && item.attachments.length > 0) {
              desc += `\n[Attached: ${item.attachments.map(a => a.name).join(', ')}]`;
          }
          return [
              desc,
              item.quantity,
              `$${(item.unitMaterialCost + (item.unitLaborHours * item.laborRate)).toFixed(2)}`,
              `$${((item.quantity * item.unitMaterialCost) + (item.quantity * item.unitLaborHours * item.laborRate)).toFixed(2)}`
          ];
      });
      
      const startY = activeTicket.notes ? 95 + (Math.ceil(activeTicket.notes.length / 90) * 5) : 85;
      
      autoTable(doc, {
          startY: startY,
          head: [['Description', 'Qty', 'Unit Price', 'Total']],
          body: tableBody,
          theme: 'grid',
          headStyles: { fillColor: [37, 99, 235] },
          styles: { fontSize: 9 },
          foot: [['', '', 'Grand Total:', `$${calculateTotal(activeTicket).toFixed(2)}`]],
          footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' }
      });
      
      return doc.output('blob');
  };

  const handleDownloadPDF = () => {
      const blob = generatePDFBlob();
      if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ChangeOrder_${activeTicket?.id}.pdf`;
          link.click();
      }
  };

  const handleSendForApproval = () => {
      const blob = generatePDFBlob();
      if (!blob || !activeTicket) return;

      // 1. Download PDF to user's computer
      handleDownloadPDF();

      // 2. Open Mail Client
      const project = projects.find(p => p.id === activeTicket.projectId);
      const email = project?.contactInfo?.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi)?.[0] || '';
      
      const subject = `Approval Needed: Change Order #${activeTicket.id}`;
      const body = `Hi ${activeTicket.clientName},\n\nPlease review the attached Change Order PDF for project ${project?.name || ''}.\n\nTotal: $${calculateTotal(activeTicket).toLocaleString()}\n\nKindly reply with "Approved" or use the buttons in the portal.\n\nBest regards,\n${user.name}\nCarsan Electric`;

      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      
      // 3. Update Status
      changeStatus('Sent');
      
      alert("Step 1: PDF Downloaded.\nStep 2: Email Draft Opened.\n\nPlease attach the downloaded PDF to the email draft.");
  };

  const sendReminder = (ticket: ServiceTicket) => {
      const project = projects.find(p => p.id === ticket.projectId);
      const email = project?.contactInfo?.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi)?.[0] || '';
      const subject = `REMINDER: Approval Needed for Change Order #${ticket.id}`;
      const body = `Hi ${ticket.clientName},\n\nThis is a friendly reminder that Change Order #${ticket.id} ($${calculateTotal(ticket).toFixed(2)}) is still pending approval.\n\nPlease review at your earliest convenience.\n\nThank you,\nCarsan Electric`;
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  // --- VIEW: TICKET DETAIL ---
  if (activeTicket) {
      const total = calculateTotal(activeTicket);

      return (
          <div className="flex flex-col h-full bg-slate-50">
              {/* Header */}
              <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3">
                      <button onClick={() => setActiveTicket(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                          <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div>
                          <div className="flex items-center gap-2">
                              <h2 className="font-bold text-slate-900">{activeTicket.type}</h2>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  activeTicket.status === 'Authorized' ? 'bg-green-100 text-green-700' :
                                  activeTicket.status === 'Denied' ? 'bg-red-100 text-red-700' :
                                  'bg-blue-100 text-blue-700'
                              }`}>
                                  {activeTicket.status}
                              </span>
                          </div>
                          <div className="flex items-center gap-2">
                              <select 
                                  value={activeTicket.projectId || ''}
                                  onChange={(e) => {
                                      const p = projects.find(p => p.id === e.target.value);
                                      if (p) updateTicket({...activeTicket, projectId: p.id, clientName: p.client, address: p.address});
                                  }}
                                  className="text-xs text-slate-500 border-none bg-transparent p-0 cursor-pointer hover:text-blue-600 max-w-[200px] truncate"
                              >
                                  {availableProjects.map(p => (
                                      <option key={p.id} value={p.id}>
                                          {p.status === 'Ongoing' ? '🟢 ' : ''}{p.name} ({p.client})
                                      </option>
                                  ))}
                              </select>
                          </div>
                      </div>
                  </div>
                  <div className="flex items-center gap-4">
                      <button 
                         onClick={handleDownloadPDF}
                         className="flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm font-medium bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 transition"
                      >
                          <Download className="w-4 h-4" />
                          <span className="hidden md:inline">PDF</span>
                      </button>
                      <div className="text-right">
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Total</p>
                          <p className="font-bold text-emerald-600 text-lg tabular-nums">${total.toFixed(2)}</p>
                      </div>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
                  
                  {/* APPROVAL ACTIONS */}
                  {activeTicket.status === 'Sent' && (
                      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex justify-between items-center">
                          <div>
                              <h3 className="font-bold text-slate-800 text-sm">Awaiting Approval</h3>
                              <p className="text-xs text-slate-500">Update status based on client response.</p>
                          </div>
                          <div className="flex gap-2">
                              <button 
                                  onClick={() => changeStatus('Denied')} 
                                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold"
                              >
                                  Deny
                              </button>
                              <button 
                                  onClick={() => changeStatus('Authorized')} 
                                  className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm"
                              >
                                  <CheckCircle className="w-3 h-3" /> Approve
                              </button>
                          </div>
                      </div>
                  )}

                  {/* PHOTOS GRID */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <div className="flex justify-between items-center mb-3">
                          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Camera className="w-4 h-4 text-blue-500" /> Photos</h3>
                          <label className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">
                              + Add Photo
                              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                          </label>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                          {activeTicket.photos.map((photo, idx) => (
                              <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                  <img src={photo} className="w-full h-full object-cover" alt="Site" />
                              </div>
                          ))}
                          {activeTicket.photos.length === 0 && (
                              <div className="col-span-3 py-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                  No photos attached.
                              </div>
                          )}
                      </div>
                  </div>

                  {/* SMART INVOICING */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="p-4 space-y-4">
                          {/* AI Input Area */}
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500 uppercase">Technician Notes</label>
                              <textarea
                                  value={techNotes}
                                  onChange={(e) => setTechNotes(e.target.value)}
                                  className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                  placeholder="Describe work done... e.g. Installed 5 GFCI outlets and used 50ft of wire."
                                  rows={2}
                              />
                              <button 
                                  onClick={handleGenerateInvoice}
                                  disabled={!techNotes || isGeneratingInvoice}
                                  className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-slate-900 transition flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                  {isGeneratingInvoice ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-400" />}
                                  AI Draft Items
                              </button>
                          </div>

                          {/* Items List */}
                          <div className="space-y-0 divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50 overflow-hidden mt-4">
                              {activeTicket.items.map(item => (
                                  <div key={item.id} className="flex flex-col p-3 hover:bg-white transition-colors">
                                      <div className="flex justify-between items-center">
                                          <div>
                                              <div className="font-medium text-slate-900 text-sm">{item.description}</div>
                                              <div className="text-xs text-slate-500 mt-0.5">
                                                  Qty: {item.quantity} × <span className="tabular-nums">${(item.unitMaterialCost + (item.unitLaborHours * item.laborRate)).toFixed(2)}</span>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                              <div className="font-bold text-slate-700 text-sm tabular-nums">
                                                  ${((item.quantity * item.unitMaterialCost) + (item.quantity * item.unitLaborHours * item.laborRate)).toFixed(2)}
                                              </div>
                                              <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                                  <Trash2 className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </div>
                                      
                                      {/* Attachments for Item */}
                                      <div className="mt-2 flex flex-wrap gap-2">
                                          {item.attachments?.map((att, idx) => (
                                              <div key={idx} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded border border-blue-100">
                                                  <Paperclip className="w-3 h-3" /> {att.name}
                                              </div>
                                          ))}
                                          <label className="cursor-pointer text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1">
                                              <Plus className="w-3 h-3" /> Attach Doc
                                              <input type="file" className="hidden" onChange={(e) => handleItemAttachment(item.id, e)} />
                                          </label>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
                  
                  {/* Send Action */}
                  <div className="pb-safe">
                      <button 
                          onClick={handleSendForApproval}
                          className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                      >
                          <Mail className="w-5 h-5" /> Send for Approval
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- VIEW: DASHBOARD ---
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Change Orders</h1>
            <p className="text-slate-500 mt-1">Manage project scope changes and T&M.</p>
          </div>
          <button onClick={handleCreateChangeOrder} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> New Change Order
          </button>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-10"><AlertOctagon className="w-16 h-16 text-blue-500" /></div>
              <p className="text-xs font-bold text-slate-400 uppercase">Pending Approval</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">${totalPending.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-2">{myTickets.filter(t => t.status === 'Sent').length} tickets waiting</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-10"><TrendingUp className="w-16 h-16 text-emerald-500" /></div>
              <p className="text-xs font-bold text-slate-400 uppercase">Approved (Total)</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">${totalApproved.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-2">{myTickets.filter(t => t.status === 'Authorized').length} tickets authorized</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase">Stale Tickets</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{staleTickets.length}</p>
              <p className="text-xs text-slate-400 mt-2">Sent &gt; 8 days ago</p>
          </div>
      </div>

      {/* NEEDS ATTENTION SECTION */}
      {staleTickets.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="font-bold text-red-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Needs Attention (Old Tickets)
              </h3>
              <div className="space-y-3">
                  {staleTickets.map(ticket => (
                      <div key={ticket.id} className="bg-white p-3 rounded-lg border border-red-100 flex justify-between items-center shadow-sm">
                          <div>
                              <p className="font-bold text-slate-800">{ticket.clientName}</p>
                              <p className="text-xs text-slate-500">Sent: {new Date(ticket.dateCreated).toLocaleDateString()}</p>
                          </div>
                          <button 
                              onClick={() => sendReminder(ticket)}
                              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center gap-2 transition"
                          >
                              <BellRing className="w-3 h-3" /> Send Reminder
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* MAIN GRID */}
      <div>
          <h3 className="font-bold text-slate-800 mb-4">All Tickets</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myTickets.map(ticket => (
                  <div 
                      key={ticket.id} 
                      onClick={() => setActiveTicket(ticket)}
                      className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition cursor-pointer group relative overflow-hidden ${
                          isStale(ticket) ? 'border-red-300' : 'border-slate-200'
                      }`}
                  >
                      <div className={`absolute top-0 left-0 w-1 h-full ${
                          ticket.status === 'Authorized' ? 'bg-emerald-500' :
                          ticket.status === 'Sent' ? 'bg-blue-500' : 'bg-slate-200'
                      }`}></div>
                      <div className="flex justify-between items-start mb-3">
                          <div>
                              <h3 className="font-bold text-slate-900">{ticket.clientName}</h3>
                              <p className="text-xs text-slate-500 truncate max-w-[150px]">{ticket.address}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                              ticket.status === 'Authorized' ? 'bg-green-100 text-green-700' : 
                              ticket.status === 'Denied' ? 'bg-red-100 text-red-700' :
                              ticket.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-500'
                          }`}>
                              {ticket.status}
                          </span>
                      </div>
                      <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm">
                          <div className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-xs">{new Date(ticket.dateCreated).toLocaleDateString()}</span>
                          </div>
                          <span className="font-bold text-slate-900">${calculateTotal(ticket).toLocaleString()}</span>
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
};
