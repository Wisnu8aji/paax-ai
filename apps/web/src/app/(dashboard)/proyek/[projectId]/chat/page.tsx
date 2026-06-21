import React from 'react';
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
  Bot
} from 'lucide-react';

export default function ChatPage() {
  const tools = [
    { icon: FileText, name: 'Get Project Context' },
    { icon: Calculator, name: 'Edit RAB Draft' },
    { icon: Calculator, name: 'Recalculate RAB' },
    { icon: Calendar, name: 'Generate Schedule' },
    { icon: Search, name: 'Analyze Drawing' },
    { icon: FileText, name: 'Export Excel' },
  ];

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
              <p className="text-xs text-slate-400">Mode: Analyze & Edit</p>
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
          
          <div className="flex gap-4 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
              UD
            </div>
            <div className="space-y-2">
              <div className="bg-slate-800 text-slate-200 px-4 py-3 rounded-2xl rounded-tl-none text-sm">
                Tolong analisis RAB proyek ini. Apakah ada item pekerjaan struktur yang under-budget berdasarkan AHSP standar daerah Depok?
              </div>
              <span className="text-xs text-slate-500 px-1">10:42 AM</span>
            </div>
          </div>

          <div className="flex gap-4 max-w-[85%] ml-auto flex-row-reverse">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div className="space-y-2">
              <div className="bg-indigo-600/20 border border-indigo-500/30 text-slate-200 px-4 py-3 rounded-2xl rounded-tr-none text-sm">
                <p className="mb-2">Saya telah menganalisis RAB untuk pekerjaan struktur dan membandingkannya dengan AHSP Depok 2024. Ditemukan 2 item yang terindikasi under-budget (berisiko):</p>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                  <li>
                    <span className="font-semibold text-white">Beton Bertulang K-250 (Pondasi Footplat)</span><br/>
                    Harga RAB: Rp 1.150.000/m3<br/>
                    Harga Wajar: Rp 1.450.000/m3<br/>
                    <span className="text-amber-400">Selisih: -20.6%</span>
                  </li>
                  <li>
                    <span className="font-semibold text-white">Besi Tulangan Polos</span><br/>
                    Harga RAB: Rp 14.500/kg<br/>
                    Harga Wajar: Rp 16.200/kg<br/>
                    <span className="text-amber-400">Selisih: -10.4%</span>
                  </li>
                </ol>
                <p className="mt-3">Apakah Anda ingin saya menyesuaikan harga tersebut ke harga wajar dan menghitung ulang total RAB?</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors border border-slate-700">Ya, sesuaikan & hitung ulang</button>
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors border border-slate-700">Tampilkan detail analisa</button>
              </div>
              <span className="text-xs text-slate-500 px-1 text-right block">10:43 AM</span>
            </div>
          </div>

        </div>

        {/* Chat Input */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="relative flex items-center">
            <button className="absolute left-3 p-2 text-slate-400 hover:text-white transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              placeholder="Ketik instruksi atau pertanyaan untuk PAAX AI..." 
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl pl-12 pr-12 py-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
            />
            <button className="absolute right-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs text-slate-500 py-1 whitespace-nowrap">Saran:</span>
            <button className="text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 px-3 py-1 rounded-full border border-slate-700/50 whitespace-nowrap transition-colors">Review pekerjaan arsitektur</button>
            <button className="text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 px-3 py-1 rounded-full border border-slate-700/50 whitespace-nowrap transition-colors">Cek durasi kritis</button>
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
              <div className="text-xs text-slate-400 mb-1">Dokumen RAB (Draft)</div>
              <div className="text-sm font-medium text-slate-200">RAB_Revisi_v2.xlsx</div>
              <div className="text-xs text-amber-400 mt-1">2 Warning Aktif</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Total Nilai Saat Ini</div>
              <div className="text-sm font-medium text-slate-200">Rp 2.150.000.000</div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1">Referensi Harga</div>
              <div className="text-sm font-medium text-slate-200">AHSP Kota Depok 2024</div>
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
              <button key={idx} className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-colors group">
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
