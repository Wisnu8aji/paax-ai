'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  MessageSquare, 
  Send, 
  Paperclip, 
  BrainCircuit,
  Calculator,
  Calendar,
  FileText,
  Wrench,
  Search,
  Bot,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { DrawingToRabContext } from '@paax/types';

export default function ChatPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<any>(null);
  const [drawingContext, setDrawingContext] = useState<DrawingToRabContext | null>(null);
  
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'user',
      text: 'Tolong analisis RAB proyek ini. Apakah ada item pekerjaan struktur yang under-budget berdasarkan AHSP standar?',
      time: new Date(Date.now() - 60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    },
    {
      id: 2,
      sender: 'bot',
      text: 'Saya telah menganalisis RAB untuk pekerjaan struktur dan membandingkannya dengan referensi AHSP. Ditemukan 2 item yang terindikasi under-budget (berisiko):\\n\\n1. **Beton Bertulang K-250** (Pondasi Footplat)\\n Harga RAB: Rp 1.150.000/m³\\n Harga Wajar: Rp 1.450.000/m³\\n Selisih: -20.6%\\n\\n2. **Besi Tulangan Polos**\\n Harga RAB: Rp 14.500/kg\\n Harga Wajar: Rp 16.200/kg\\n Selisih: -10.4%\\n\\nApakah Anda ingin saya menyesuaikan harga tersebut ke harga wajar dan menghitung ulang total RAB?',
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      actions: ['Ya, sesuaikan & hitung ulang', 'Tampilkan detail analisa']
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    const found = savedProjects.find(p => p.id === projectId);
    if (found) setProject(found);

    const savedContext = LocalStorage.get<DrawingToRabContext | null>("paax_drawing_to_rab_context", null);
    if (savedContext && (savedContext.project_id === projectId || savedContext.project_id === "demo-project")) {
      setDrawingContext(savedContext);
    }
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const tools = [
    { icon: FileText, name: 'Get Project Context' },
    { icon: Calculator, name: 'Edit RAB Draft' },
    { icon: Calculator, name: 'Recalculate RAB' },
    { icon: Calendar, name: 'Generate Schedule' },
    { icon: Search, name: 'Analyze Drawing' },
    { icon: FileText, name: 'Export Excel' },
  ];

  const handleSend = (text: string = input) => {
    if (!text.trim()) return;
    
    const newMsg = {
      id: Date.now(),
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    // Mock AI response
    setTimeout(() => {
      let botResponse = 'Saya menerima permintaan Anda.';
      
      if (text.toLowerCase().includes('sesuaikan') || text.toLowerCase().includes('hitung ulang')) {
        botResponse = 'Baik, saya telah menyesuaikan harga Beton K-250 menjadi Rp 1.450.000/m³ dan Besi Tulangan Polos menjadi Rp 16.200/kg. Total RAB telah diperbarui dan health score proyek meningkat. Anda dapat melihat perubahannya di menu RAB.';
      } else if (text.toLowerCase().includes('jadwal') || text.toLowerCase().includes('durasi')) {
        botResponse = 'Berdasarkan data schedule saat ini, durasi kritis proyek Anda adalah 90 hari. Apakah Anda ingin saya men-generate skenario "Cepat" untuk mencoba memampatkan jadwal ke 75 hari?';
      } else if (text.toLowerCase().includes('gambar') || text.toLowerCase().includes('drawing') || text.toLowerCase().includes('denah')) {
        if (drawingContext) {
          botResponse = `Saya melihat Anda sudah memverifikasi ${drawingContext.verified_quantities.length} kandidat kuantitas dari gambar ${drawingContext.drawing_file}. Terdapat ${drawingContext.warnings.length} warning yang perlu diperhatikan sebelum finalisasi RAB.`;
        } else {
          botResponse = 'Belum ada data gambar kerja yang diverifikasi untuk proyek ini. Silakan buka menu Gambar Kerja AI untuk mengunggah dan menganalisis gambar Anda.';
        }
      }

      const reply = {
        id: Date.now() + 1,
        sender: 'bot',
        text: botResponse,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      };
      
      setMessages(prev => [...prev, reply]);
      setIsTyping(false);
    }, 1500);
  };

  const handleActionClick = (actionText: string) => {
    handleSend(actionText);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* Left Panel - Chat */}
      <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">PAAX Engineering Assistant</h2>
              <p className="text-xs text-slate-400">Mode: Analyze & Edit ({project?.name || 'Loading...'})</p>
            </div>
          </div>
          <select className="bg-slate-800 border-none text-sm text-slate-300 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-indigo-500">
            <option>General Assitance</option>
            <option>RAB Analysis</option>
            <option>Schedule Optimization</option>
            <option>Contract Review</option>
          </select>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 max-w-[85%] ${msg.sender === 'bot' ? 'ml-auto flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'bot' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {msg.sender === 'bot' ? <BrainCircuit className="w-4 h-4" /> : 'UD'}
              </div>
              <div className="space-y-2">
                <div className={`px-4 py-3 text-sm ${msg.sender === 'bot' ? 'bg-indigo-600/20 border border-indigo-500/30 text-slate-200 rounded-2xl rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-none'}`}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: msg.text.replace(/\\n/g, '<br/>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')}} />
                </div>
                {msg.actions && (
                  <div className={`flex gap-2 ${msg.sender === 'bot' ? 'justify-end' : ''}`}>
                    {msg.actions.map((action, i) => (
                      <button key={i} onClick={() => handleActionClick(action)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors border border-slate-700">
                        {action}
                      </button>
                    ))}
                  </div>
                )}
                <span className={`text-xs text-slate-500 px-1 block ${msg.sender === 'bot' ? 'text-right' : ''}`}>{msg.time}</span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-4 max-w-[85%] ml-auto flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white">
                <BrainCircuit className="w-4 h-4" />
              </div>
              <div className="bg-indigo-600/20 border border-indigo-500/30 text-slate-200 px-4 py-3 rounded-2xl rounded-tr-none text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="relative flex items-center">
            <button className="absolute left-3 p-2 text-slate-400 hover:text-white transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ketik instruksi atau pertanyaan untuk PAAX AI..." 
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl pl-12 pr-12 py-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
            />
            <button onClick={() => handleSend()} className="absolute right-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs text-slate-500 py-1 whitespace-nowrap">Saran:</span>
            <button onClick={() => setInput("Review pekerjaan arsitektur")} className="text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 px-3 py-1 rounded-full border border-slate-700/50 whitespace-nowrap transition-colors">Review pekerjaan arsitektur</button>
            <button onClick={() => setInput("Cek durasi kritis proyek ini")} className="text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 px-3 py-1 rounded-full border border-slate-700/50 whitespace-nowrap transition-colors">Cek durasi kritis</button>
          </div>
        </div>
      </div>

      {/* Right Panel - Context & Tools */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            Konteks Aktif
          </h3>
          <div className="space-y-3">
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Status Proyek</div>
              <div className="text-sm font-medium text-slate-200 capitalize">{project?.status || 'Draft'}</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Total Nilai Saat Ini</div>
              <div className="text-sm font-medium text-slate-200">{project?.rabValue ? `Rp ${project.rabValue.toLocaleString('id-ID')}` : 'Belum dihitung'}</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Drawing Data</div>
              <div className="text-sm font-medium text-slate-200">
                {drawingContext ? (
                  <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {drawingContext.verified_quantities.length} Verified Items</span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Not Available</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-indigo-400" />
            AI Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool, idx) => (
              <button key={idx} onClick={() => handleSend(`Run ${tool.name}`)} className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-colors group">
                <tool.icon className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                <span className="text-[10px] text-center text-slate-300 font-medium leading-tight">{tool.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
