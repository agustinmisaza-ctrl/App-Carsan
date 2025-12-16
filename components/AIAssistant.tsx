import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Bot, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { createAssistantChat, connectLiveSession, float32ArrayToBase64, base64ToFloat32Array } from '../services/geminiService';
import { Chat, GenerateContentResponse, LiveServerMessage } from "@google/genai";
import { ProjectEstimate, MaterialItem, ServiceTicket, Lead, PurchaseRecord } from '../types';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AIAssistantProps {
    projects?: ProjectEstimate[];
    materials?: MaterialItem[];
    tickets?: ServiceTicket[];
    leads?: Lead[];
    purchases?: PurchaseRecord[];
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ projects = [], materials = [], tickets = [], leads = [], purchases = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am Sparky, your Carsan Electric AI assistant. How can I help you with your estimate today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Voice Mode State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  // Refs for Chat
  const chatSession = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs for Audio Streaming
  const inputAudioContext = useRef<AudioContext | null>(null);
  const outputAudioContext = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  // Buffers for accumulating transcription
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  useEffect(() => {
    try {
        // Initialize chat with current data context
        // If chat session exists, we don't necessarily destroy it, but we might want to update context if data changes significantly.
        // For simplicity, we re-create it on first load or just use ref. 
        // To support dynamic updates, we should probably re-create it if key data changes, but that resets conversation.
        // Best approach for this simple app: Create new chat session instance when component mounts or data updates significantly if we want context freshness.
        // Currently, we just lazy init in handleSend.
        chatSession.current = createAssistantChat(projects, tickets, materials, leads, purchases);
    } catch (e) {
        console.error("Failed to init chat", e);
    }
    return () => {
        stopVoiceSession();
    };
  }, [projects, tickets, materials, leads, purchases]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // --- TEXT CHAT HANDLERS ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      if (!chatSession.current) {
         chatSession.current = createAssistantChat(projects, tickets, materials, leads, purchases);
      }
      
      const response = await chatSession.current.sendMessageStream({ message: userMsg });
      
      setMessages(prev => [...prev, { role: 'model', text: '' }]);
      
      let fullText = '';
      for await (const chunk of response) {
          const c = chunk as GenerateContentResponse;
          if (c.text) {
              fullText += c.text;
              setMessages(prev => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  lastMsg.text = fullText;
                  return newMsgs;
              });
          }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting to the network right now." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- VOICE CHAT HANDLERS ---

  const startVoiceSession = async () => {
      try {
          setIsVoiceMode(true);
          inputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
          outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          sourceRef.current = inputAudioContext.current.createMediaStreamSource(stream);
          
          sessionPromiseRef.current = connectLiveSession({
              onopen: () => {
                  setIsVoiceConnected(true);
                  if (!inputAudioContext.current || !sourceRef.current) return;
                  
                  processorRef.current = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
                  processorRef.current.onaudioprocess = (e) => {
                      const inputData = e.inputBuffer.getChannelData(0);
                      const base64Audio = float32ArrayToBase64(inputData);
                      
                      if (sessionPromiseRef.current) {
                          sessionPromiseRef.current.then(session => {
                              session.sendRealtimeInput({
                                  media: {
                                      mimeType: "audio/pcm;rate=16000",
                                      data: base64Audio
                                  }
                              });
                          });
                      }
                  };
                  
                  sourceRef.current.connect(processorRef.current);
                  processorRef.current.connect(inputAudioContext.current.destination);
              },
              onmessage: async (message: LiveServerMessage) => {
                  // Handle Audio Output
                  const modelAudio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (modelAudio && outputAudioContext.current) {
                      const float32Data = base64ToFloat32Array(modelAudio);
                      const buffer = outputAudioContext.current.createBuffer(1, float32Data.length, 24000);
                      buffer.getChannelData(0).set(float32Data);
                      
                      const source = outputAudioContext.current.createBufferSource();
                      source.buffer = buffer;
                      source.connect(outputAudioContext.current.destination);
                      
                      const currentTime = outputAudioContext.current.currentTime;
                      if (nextStartTimeRef.current < currentTime) {
                          nextStartTimeRef.current = currentTime;
                      }
                      source.start(nextStartTimeRef.current);
                      nextStartTimeRef.current += buffer.duration;
                  }
                  
                  // Handle Transcription
                  const inputTrans = message.serverContent?.inputTranscription?.text;
                  const outputTrans = message.serverContent?.outputTranscription?.text;

                  if (inputTrans) {
                      currentInputTranscription.current += inputTrans;
                      // Update UI with partial user input
                      setMessages(prev => {
                          const lastMsg = prev[prev.length - 1];
                          if (lastMsg.role === 'user') {
                              return [...prev.slice(0, -1), { role: 'user', text: currentInputTranscription.current }];
                          } else {
                              return [...prev, { role: 'user', text: currentInputTranscription.current }];
                          }
                      });
                  }

                  if (outputTrans) {
                      currentOutputTranscription.current += outputTrans;
                      // Update UI with partial model output
                       setMessages(prev => {
                          const lastMsg = prev[prev.length - 1];
                          if (lastMsg.role === 'model') {
                              return [...prev.slice(0, -1), { role: 'model', text: currentOutputTranscription.current }];
                          } else {
                              return [...prev, { role: 'model', text: currentOutputTranscription.current }];
                          }
                      });
                  }

                  if (message.serverContent?.turnComplete) {
                      // Finalize turn, clear buffers for next turn
                      currentInputTranscription.current = '';
                      currentOutputTranscription.current = '';
                  }

                  if (message.serverContent?.interrupted) {
                      nextStartTimeRef.current = 0;
                      currentOutputTranscription.current = ''; // Clear if interrupted
                  }
              },
              onclose: () => { setIsVoiceConnected(false); },
              onerror: (err) => { setIsVoiceConnected(false); }
          });

      } catch (err) {
          console.error(err);
          setIsVoiceMode(false);
      }
  };

  const stopVoiceSession = () => {
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }
      if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
      }
      if (inputAudioContext.current) {
          inputAudioContext.current.close();
          inputAudioContext.current = null;
      }
      if (outputAudioContext.current) {
          outputAudioContext.current.close();
          outputAudioContext.current = null;
      }
      if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(session => {});
          sessionPromiseRef.current = null;
      }
      setIsVoiceMode(false);
      setIsVoiceConnected(false);
      nextStartTimeRef.current = 0;
      currentInputTranscription.current = '';
      currentOutputTranscription.current = '';
  };

  const toggleVoice = () => {
      if (isVoiceMode) {
          stopVoiceSession();
      } else {
          startVoiceSession();
      }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-all transform hover:scale-105 z-50 flex items-center justify-center ${isOpen ? 'bg-red-500 rotate-90' : 'bg-blue-600'}`}
      >
        {isOpen ? <X className="text-white w-6 h-6" /> : <MessageCircle className="text-white w-6 h-6" />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 md:inset-auto md:bottom-24 md:right-6 w-full md:w-96 h-full md:h-[500px] bg-white md:rounded-2xl shadow-2xl border-0 md:border border-slate-200 overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom-10 fade-in duration-200">
          
          <div className="bg-slate-900 p-4 flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <Bot className="text-white w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm">Carsan AI Assistant</h3>
                    <p className="text-xs text-blue-400">Powered by Gemini</p>
                </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="md:hidden text-slate-400">
                <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 relative">
            {isVoiceMode && (
                <div className="absolute inset-0 bg-slate-900 z-10 flex flex-col items-center justify-center text-white">
                    <div className="relative">
                        {isVoiceConnected ? (
                            <div className="flex items-center justify-center">
                                <span className="animate-ping absolute inline-flex h-20 w-20 rounded-full bg-blue-400 opacity-20"></span>
                                <div className="relative inline-flex rounded-full h-16 w-16 bg-gradient-to-tr from-blue-500 to-indigo-600 items-center justify-center shadow-lg shadow-blue-500/50">
                                    <Volume2 className="w-8 h-8 text-white animate-pulse" />
                                </div>
                            </div>
                        ) : (
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        )}
                    </div>
                    <h4 className="mt-8 font-semibold text-lg">{isVoiceConnected ? "Listening..." : "Connecting..."}</h4>
                    <p className="text-slate-400 text-sm mt-2">Speak naturally to Sparky</p>
                    
                    {/* Live Transcription Overlay */}
                    <div className="absolute bottom-8 left-4 right-4 text-center">
                         <p className="text-blue-300 text-xs uppercase font-bold mb-2">Live Transcript</p>
                         <p className="text-white text-sm bg-white/10 p-3 rounded-lg backdrop-blur-sm">
                             {messages[messages.length - 1]?.text || "Waiting for audio..."}
                         </p>
                    </div>
                </div>
            )}

            <div className="p-4 space-y-4 custom-scrollbar h-full">
                {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-none'
                    }`}>
                        {msg.text}
                    </div>
                </div>
                ))}
                {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    </div>
                </div>
                )}
                <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-3 bg-white border-t border-slate-200 shrink-0 pb-safe">
            <div className="relative flex items-center gap-2">
                <button 
                    onClick={toggleVoice}
                    className={`p-3 rounded-xl transition-colors ${
                        isVoiceMode 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    {isVoiceMode ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <div className="relative flex-1">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder={isVoiceMode ? "Voice mode active..." : "Ask..."}
                        disabled={isVoiceMode}
                        className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none text-sm disabled:opacity-50"
                        rows={1}
                        style={{ minHeight: '44px' }}
                    />
                    {!isVoiceMode && (
                        <button 
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 top-1.5 p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {!isVoiceMode && (
                 <div className="text-center mt-2">
                    <p className="text-[10px] text-slate-400">AI may produce inaccurate information.</p>
                </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};