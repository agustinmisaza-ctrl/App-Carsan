
import { GoogleGenAI, Type, Chat, LiveServerMessage, Modality } from "@google/genai";
import { MaterialItem, AnalysisResult, Lead, ProjectEstimate, ServiceTicket, PurchaseRecord } from "../types";

// Adhere to coding guidelines for model selection: 'gemini-3-flash-preview' for general text tasks
const GEMINI_MODEL = "gemini-3-flash-preview";
// Use Pro model for complex blueprint analysis/vision tasks to improve recognition accuracy
const VISION_MODEL = "gemini-3-pro-preview"; 
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Schema for the analysis response
const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: "Name of the electrical component found (e.g., Duplex Receptacle, 1-Pole Switch)" },
          count: { type: Type.INTEGER, description: "Estimated quantity found in the image" },
          reasoning: { type: Type.STRING, description: "Brief explanation of where these were seen" }
        },
        required: ["description", "count"]
      }
    }
  },
  required: ["items"]
};

// Schema for Lead Extraction
const leadSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Full name of the person" },
    company: { type: Type.STRING, description: "Company name if available" },
    email: { type: Type.STRING, description: "Email address found" },
    phone: { type: Type.STRING, description: "Phone number found" },
    notes: { type: Type.STRING, description: "Summary of the request or project details" }
  },
  required: ["name"]
};

// Schema for Email Analysis
const emailAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    clientName: { type: Type.STRING, description: "Name of the client company or individual requesting work" },
    projectName: { type: Type.STRING, description: "Inferred project name (e.g., 'Smith Residence Renovation' or 'Downtown Office Wiring')" },
    summary: { type: Type.STRING, description: "A concise 1-2 sentence summary of what is being requested" },
    urgency: { type: Type.STRING, description: "Low, Medium, or High based on language used" },
    keyDetails: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Bullet points of specific electrical requirements mentioned (e.g., 'Needs 200A upgrade', 'Kitchen remodel')" 
    },
    contactInfo: {
        type: Type.OBJECT,
        properties: {
            phone: { type: Type.STRING, description: "Phone number if present" },
            address: { type: Type.STRING, description: "Job site address if present" }
        }
    }
  },
  required: ["clientName", "projectName", "summary"]
};

// Schema for Invoice Extraction
const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    invoiceData: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "Invoice Date (YYYY-MM-DD)" },
        supplier: { type: Type.STRING, description: "Supplier Name (e.g., World Electric, CES)" },
        poNumber: { type: Type.STRING, description: "Purchase Order Number" },
        projectName: { type: Type.STRING, description: "Project Reference if available" },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: "Item Name/Description" },
              quantity: { type: Type.NUMBER, description: "Quantity purchased" },
              unitCost: { type: Type.NUMBER, description: "Unit Price" },
              totalCost: { type: Type.NUMBER, description: "Total Line Item Cost" }
            }
          }
        }
      }
    }
  }
};

// Helper to extract MIME type and base64 data
const parseBase64 = (base64String: string) => {
  const match = base64String.match(/^data:(.*);base64,(.*)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2]
    };
  }
  // Fallback if no prefix provided (assume png for raw base64, though unlikely in this app)
  return {
    mimeType: 'image/png',
    data: base64String
  };
};

export const analyzeBlueprint = async (
  base64Image: string, 
  materialDb: MaterialItem[]
): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare a context string from the material DB to help Gemini match terms
  const dbContext = materialDb.map(m => `- ${m.name} (${m.category})`).join("\n");

  const prompt = `
    You are an expert electrical estimator for residential and commercial construction in Miami, Florida.
    
    Task:
    1. Analyze the provided electrical blueprint image or PDF page.
    2. Identify standard electrical symbols and components (Outlets, Switches, Lights, Panels, J-Boxes, Smoke Detectors).
    3. Count the quantities of each component found accurately.
    4. Return the data in a structured JSON format.

    Context - Available Price Database Items:
    The user has the following items in their database. Map your findings to these specific names where possible.
    ${dbContext}

    Specific Instructions:
    - Focus strictly on the ELECTRICAL layer. Ignore architectural dimensions or furniture unless relevant to electrical placement.
    - If a symbol is ambiguous, use the context of the room (e.g., countertop height symbols are usually GFI).
    - Differentiate between:
      - Duplex Receptacles vs GFI Receptacles
      - Single Pole Switches vs 3-Way/4-Way Switches
      - Recessed Cans vs Surface Mount Lights
    - Return a realistic count. If the image is a partial view, count only what is visible.
  `;

  // Dynamically detect mimeType (fixes INVALID_ARGUMENT error for PDFs/JPEGs)
  const { mimeType, data } = parseBase64(base64Image);

  try {
    const response = await ai.models.generateContent({
      model: VISION_MODEL, // Use Pro model for better blueprint reasoning
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
              data: data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0, // Lower temperature for more precise counting
      }
    });

    // Fix: Solely use the .text property from GenerateContentResponse
    let text = response.text || '{ "items": [] }';
    
    // Robust JSON cleaning to handle AI returning markdown blocks
    text = text.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(json)?/i, '').replace(/```$/, '');
    }

    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze blueprint. Ensure the file is a valid Image or PDF.");
  }
};

/**
 * Uses Google Search grounding to find live prices for an electrical material.
 */
export const fetchLiveWebPrices = async (itemName: string): Promise<{ text: string, sources: { uri: string, title: string }[] }> => {
  if (!process.env.API_KEY) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Find the current price for "${itemName}" from electrical suppliers like City Electric Supply (CES), World Electric, or Home Depot in the Miami/Florida area. Provide a clear summary of the latest price per unit and provide direct links to the products if found. Focus on professional contractor pricing if available.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter((chunk: any) => chunk.web)
      ?.map((chunk: any) => ({
        uri: chunk.web.uri,
        title: chunk.web.title
      })) || [];

    return {
      text: response.text || "No live pricing information found.",
      sources
    };
  } catch (error) {
    console.error("Live Price Fetch Error:", error);
    throw new Error("Failed to search live prices. Please check your internet connection.");
  }
};

export const analyzeSchedule = async (base64File: string): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API Key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { mimeType, data } = parseBase64(base64File);

    const prompt = `
        Analyze this Project Schedule (PDF or Image).
        Identify the Key Electrical Milestones, Start Dates, and Deadlines.
        
        Return a concise summary in Markdown format with bullet points.
        Example:
        **Key Milestones:**
        * Rough-in Start: [Date]
        * Inspection: [Date]
        * Final Trim: [Date]
        
        If the document is not a schedule, return "Unable to identify schedule data."
    `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType, data } },
                    { text: prompt }
                ]
            }
        });
        // Fix: Use the .text property directly as per Gemini API guidelines
        return response.text || "No schedule analysis available.";
    } catch (e) {
        console.error("Schedule analysis failed", e);
        return "Failed to analyze schedule file.";
    }
};

export const extractLeadFromText = async (text: string): Promise<Partial<Lead>> => {
    if (!process.env.API_KEY) throw new Error("API Key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: {
                parts: [{ text: `Extract contact information (Lead) from this email text: "${text}"` }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: leadSchema,
                temperature: 0
            }
        });
        
        // Fix: Use the .text property directly
        let jsonStr = response.text || '{}';
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?/i, '').replace(/```$/, '');
        }

        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to extract lead", e);
        return {};
    }
};

export const analyzeIncomingEmail = async (subject: string, body: string): Promise<any> => {
    if (!process.env.API_KEY) throw new Error("API Key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
      Analyze this incoming email for an electrical contracting business.
      
      Email Subject: "${subject}"
      Email Body: "${body}"
      
      Task:
      1. Identify the Client Name (Company or Person).
      2. Identify or Infer the Project Name (e.g. "Smith Kitchen Remodel").
      3. Summarize the request in 1-2 sentences.
      4. List any specific technical details (voltage, amperage, devices).
      5. Determine urgency.
      
      Return JSON format matching schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: emailAnalysisSchema,
                temperature: 0.1
            }
        });

        let jsonStr = response.text || '{}';
        jsonStr = jsonStr.trim().replace(/^```(json)?/i, '').replace(/```$/, '');
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Email analysis failed", e);
        return {
            clientName: "Unknown",
            projectName: subject,
            summary: body.substring(0, 100),
            urgency: "Unknown",
            keyDetails: []
        };
    }
};

export const extractInvoiceData = async (base64File: string): Promise<PurchaseRecord[]> => {
    if (!process.env.API_KEY) throw new Error("API Key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const { mimeType, data } = parseBase64(base64File);

    const prompt = `
        You are an AI Procurement Assistant. 
        Analyze this Supplier Invoice (Image or PDF).
        Extract the invoice details and line items.
        
        IMPORTANT: Return ONLY raw JSON. Do not include markdown formatting (like \`\`\`json).
        
        Return a JSON object matching this structure:
        {
          "invoiceData": {
            "date": "YYYY-MM-DD",
            "supplier": "Supplier Name",
            "poNumber": "PO Number or N/A",
            "projectName": "Project Name or Inventory",
            "items": [
               { "description": "Item Name", "quantity": 1, "unitCost": 10.50, "totalCost": 10.50 }
            ]
          }
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType, data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: invoiceSchema,
                temperature: 0
            }
        });

        // Fix: Access response text output via the .text property
        let jsonStr = response.text || '{}';
        
        // Robust JSON cleaning to handle potential AI markdown formatting
        jsonStr = jsonStr.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(json)?/i, '').replace(/```$/, '');
        }
        
        console.log("AI Response:", jsonStr); // Debug log

        const result = JSON.parse(jsonStr);
        
        // Robust handling: AI might skip the 'invoiceData' wrapper or return flattened JSON
        let invoice = result.invoiceData;
        if (!invoice) {
            // Fallback: Check if the root object has the invoice properties directly
            if (result.items && Array.isArray(result.items)) {
                invoice = result;
            }
        }

        if (!invoice || !invoice.items) {
            console.error("Invalid invoice structure:", JSON.stringify(result, null, 2));
            return [];
        }

        // Map to application PurchaseRecord type
        return invoice.items.map((item: any, idx: number) => ({
            id: `inv-${invoice.poNumber}-${idx}-${Date.now()}`,
            date: invoice.date || new Date().toISOString(),
            poNumber: invoice.poNumber || 'Unknown',
            brand: 'N/A',
            itemDescription: item.description,
            quantity: item.quantity || 1,
            unitCost: item.unitCost || 0,
            totalCost: item.totalCost || (item.quantity * item.unitCost) || 0,
            supplier: invoice.supplier || 'Unknown Supplier',
            projectName: invoice.projectName || 'Inventory',
            type: 'Material'
        }));

    } catch (e) {
        console.error("Invoice Extraction Failed", e);
        throw new Error("Failed to extract invoice data. Please ensure the file is clear.");
    }
};

export const generateInvoiceFromNotes = async (
    notes: string,
    materialDb: MaterialItem[]
): Promise<any[]> => {
    if (!process.env.API_KEY) throw new Error("API Key not found");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Create a simplified DB map to reduce token usage
    const dbContext = materialDb.map(m => `ID: ${m.id} | Name: ${m.name}`).join("\n");

    const prompt = `
        You are an intelligent invoicing assistant for an electrician.
        
        Task:
        1. Read the Technician Notes: "${notes}"
        2. Match items mentioned in the notes to the provided Material Database.
        3. Extract quantities.
        4. Return a JSON array of found items.

        Material Database:
        ${dbContext}

        Return format:
        {
            "items": [
                { "materialId": "string (id from DB)", "quantity": number, "description": "string (name from DB)" }
            ]
        }
        
        If an item is generic (like "wire" or "pipe") and matches multiple DB items, pick the most standard 3/4" or #12 size unless specified otherwise.
    `;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                temperature: 0
            }
        });
        
        // Fix: Access response text output via the .text property
        let text = response.text || '{ "items": [] }';
        text = text.trim();
        if (text.startsWith('```')) {
            text = text.replace(/^```(json)?/i, '').replace(/```$/, '');
        }

        const result = JSON.parse(text);
        return result.items || [];
    } catch (e) {
        console.error("Invoice Generation Error", e);
        return [];
    }
};

export const createAssistantChat = (
  projects: ProjectEstimate[] = [],
  tickets: ServiceTicket[] = [],
  materials: MaterialItem[] = [],
  leads: Lead[] = [],
  purchases: PurchaseRecord[] = []
): Chat => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Generate a concise summary of the application data for context
  const projectSummary = projects.map(p => 
    `- Project: ${p.name} | Client: ${p.client} | Status: ${p.status} | Date: ${p.dateCreated.split('T')[0]} | Value: $${p.contractValue || 'N/A'}`
  ).join('\n');

  const ticketSummary = tickets.map(t => 
    `- Change Order: ${t.id} | Project Ref: ${t.projectId} | Client: ${t.clientName} | Status: ${t.status} | Date: ${t.dateCreated.split('T')[0]}`
  ).join('\n');

  const leadSummary = leads.slice(0, 20).map(l => 
    `- Lead: ${l.name} | Source: ${l.source} | Date: ${l.dateAdded.split('T')[0]} | Notes: ${l.notes ? l.notes.substring(0, 50) + '...' : ''}`
  ).join('\n');

  const purchaseSummary = purchases.slice(0, 20).map(p => 
    `- Purchase: ${p.itemDescription} | Qty: ${p.quantity} | Total: $${p.totalCost} | Supplier: ${p.supplier} | Project: ${p.projectName}`
  ).join('\n');

  const totalSpend = purchases.reduce((acc, p) => acc + p.totalCost, 0);

  const materialStats = `Database contains ${materials.length} items. Categories: ${Array.from(new Set(materials.map(m => m.category))).join(', ')}.`;

  const systemInstruction = `
    You are 'Sparky', an expert AI assistant for Carsan Electric's estimating application in Miami, FL.
    
    You have access to the complete live database of the application.
    
    **Current Application Data Context:**
    
    **Projects (Estimates):**
    ${projectSummary || "No projects found."}
    
    **Change Orders:**
    ${ticketSummary || "No change orders found."}
    
    **CRM Leads (Recent):**
    ${leadSummary || "No leads found."}

    **Purchase History (Recent):**
    ${purchaseSummary || "No recent purchases."}
    Total Spend Recorded: $${totalSpend.toLocaleString()}
    
    **Materials:**
    ${materialStats}
    
    **Your Capabilities:**
    1. **Data Analysis**: Answer questions about the data provided above. 
       - e.g. "How many projects were sent in the last 15 days?"
       - e.g. "Do we have any leads from Outlook?"
       - e.g. "What is our total spend on materials?"
    2. **Electrical Knowledge**: Answer questions about NEC 2020/2023 codes, wiring methods, and Miami-Dade specific requirements.
    3. **Estimation Help**: Assist with labor unit calculations, material pricing trends, and estimating formulas.
    
    **Tone**: Professional, helpful, concise, and knowledgeable.
    
    **Important**: When asked about "last X days", compare the dates in the context with the current date (${new Date().toISOString().split('T')[0]}).
    You cannot modify the database directly, but you can read from the context provided.
  `;
  
  return ai.chats.create({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: systemInstruction,
    }
  });
};

// --- Live Audio / Voice Features ---

export const connectLiveSession = async (callbacks: {
    onopen?: () => void;
    onmessage?: (message: LiveServerMessage) => void;
    onclose?: (e: CloseEvent) => void;
    onerror?: (e: ErrorEvent) => void;
}) => {
     if (!process.env.API_KEY) {
        throw new Error("API Key not found");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      return ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
            onopen: callbacks.onopen ?? (() => {}),
            onmessage: callbacks.onmessage ?? (() => {}),
            onclose: callbacks.onclose ?? (() => {}),
            onerror: callbacks.onerror ?? (() => {}),
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
            },
            systemInstruction: "You are Sparky, an expert electrician assistant. Keep answers concise, helpful and spoken naturally. Focus on Miami electrical codes.",
        }
      });
};

// Convert Base64 audio string from Gemini to Float32Array for AudioBuffer
export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Convert PCM 16-bit little-endian to Float32
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for(let i=0; i<int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// Convert Float32Array from Mic to Base64 PCM 16-bit for Gemini
export function float32ArrayToBase64(data: Float32Array): string {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Clamp values
      int16[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
