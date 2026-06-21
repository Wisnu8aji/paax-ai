import {
  Upload,
  FileImage,
  CheckCircle2,
  XCircle,
  Edit3,
  Eye,
  Sparkles,
  Layers,
  DoorOpen,
  Square,
  Ruler,
  RotateCcw,
  Download,
  ZoomIn,
  ChevronRight,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const drawingPages = [
  {
    id: 'dwg-001',
    name: 'Denah Lantai 1',
    type: 'Denah',
    status: 'extracted',
    confidence: 94,
    uploadedAt: '20 Jun 2026, 14:30',
    extractedAt: '20 Jun 2026, 14:32',
    results: {
      rooms: [
        { name: 'Ruang Tamu', width: '4.0m', length: '5.0m', area: '20.0 m²' },
        { name: 'Ruang Keluarga', width: '4.0m', length: '4.5m', area: '18.0 m²' },
        { name: 'Dapur', width: '3.0m', length: '3.5m', area: '10.5 m²' },
        { name: 'Kamar Tidur Utama', width: '4.0m', length: '4.0m', area: '16.0 m²' },
        { name: 'Kamar Mandi Utama', width: '2.0m', length: '2.5m', area: '5.0 m²' },
        { name: 'Teras Depan', width: '6.0m', length: '2.0m', area: '12.0 m²' },
        { name: 'Carport', width: '3.0m', length: '6.0m', area: '18.0 m²' },
        { name: 'Taman Belakang', width: '4.0m', length: '3.0m', area: '12.0 m²' },
      ],
      doors: 6,
      windows: 8,
      totalArea: '111.5 m²',
    },
  },
  {
    id: 'dwg-002',
    name: 'Denah Lantai 2',
    type: 'Denah',
    status: 'extracted',
    confidence: 91,
    uploadedAt: '20 Jun 2026, 14:30',
    extractedAt: '20 Jun 2026, 14:33',
    results: {
      rooms: [
        { name: 'Kamar Tidur 2', width: '3.5m', length: '4.0m', area: '14.0 m²' },
        { name: 'Kamar Tidur 3', width: '3.0m', length: '3.5m', area: '10.5 m²' },
        { name: 'Kamar Mandi 2', width: '2.0m', length: '2.0m', area: '4.0 m²' },
        { name: 'Ruang Kerja', width: '3.0m', length: '3.0m', area: '9.0 m²' },
        { name: 'Balkon', width: '3.0m', length: '1.5m', area: '4.5 m²' },
        { name: 'Void Ruang Tamu', width: '2.0m', length: '2.5m', area: '5.0 m²' },
      ],
      doors: 5,
      windows: 6,
      totalArea: '47.0 m²',
    },
  },
  {
    id: 'dwg-003',
    name: 'Tampak Depan',
    type: 'Tampak',
    status: 'pending',
    confidence: 0,
    uploadedAt: '20 Jun 2026, 14:31',
    extractedAt: '-',
    results: {
      rooms: [],
      doors: 0,
      windows: 0,
      totalArea: '-',
    },
  },
];

export default function GambarKerjaPage() {
  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div className="glass-card p-6 border-2 border-dashed border-white/[0.08] hover:border-indigo-500/30 transition-all cursor-pointer group">
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-all group-hover:scale-110">
            <Upload className="w-7 h-7 text-indigo-400" />
          </div>
          <h3 className="text-[15px] font-semibold text-white mb-1">Upload Gambar Kerja</h3>
          <p className="text-[12px] text-paax-text-muted text-center max-w-md">
            Drag & drop file PDF gambar kerja Anda di sini, atau klik untuk browse. AI akan mengekstrak ruangan, dimensi, pintu, jendela, dan komponen bangunan secara otomatis.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-[10px] text-paax-text-muted px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06]">PDF</span>
            <span className="text-[10px] text-paax-text-muted px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06]">DWG</span>
            <span className="text-[10px] text-paax-text-muted px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06]">Max 50MB</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Halaman', value: '3', icon: FileImage, color: 'text-blue-400' },
          { label: 'Sudah Diekstrak', value: '2', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Menunggu', value: '1', icon: Clock, color: 'text-amber-400' },
          { label: 'Avg Confidence', value: '92.5%', icon: Sparkles, color: 'text-indigo-400' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card py-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-[10px] text-paax-text-muted uppercase tracking-wider">{s.label}</span>
              </div>
              <div className="text-lg font-bold text-white">{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Drawing Pages Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {drawingPages.map((page) => (
          <div key={page.id} className="glass-card overflow-hidden">
            {/* Thumbnail Placeholder */}
            <div className="relative h-40 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border-b border-white/[0.04]">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-4 border-2 border-dashed border-white/30 rounded-lg" />
                <div className="absolute top-8 left-8 w-20 h-12 border border-white/20 rounded" />
                <div className="absolute top-8 right-8 w-16 h-16 border border-white/20 rounded" />
                <div className="absolute bottom-8 left-8 w-24 h-8 border border-white/20 rounded" />
              </div>
              <div className="text-center z-10">
                <FileImage className="w-8 h-8 text-paax-text-muted mx-auto mb-1" />
                <span className="text-[11px] text-paax-text-muted">{page.type}</span>
              </div>
              {page.status === 'extracted' && (
                <div className="absolute top-2 right-2 badge badge-green text-[9px]">
                  <CheckCircle2 className="w-3 h-3" />
                  Extracted
                </div>
              )}
              {page.status === 'pending' && (
                <div className="absolute top-2 right-2 badge badge-amber text-[9px]">
                  <Clock className="w-3 h-3" />
                  Pending
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[13px] font-semibold text-white">{page.name}</h4>
                {page.confidence > 0 && (
                  <span className="text-[11px] text-indigo-400 font-medium">{page.confidence}% confidence</span>
                )}
              </div>

              {page.status === 'extracted' && page.results.rooms.length > 0 && (
                <>
                  {/* Extraction Summary */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                      <Layers className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
                      <div className="text-[12px] font-bold text-white">{page.results.rooms.length}</div>
                      <div className="text-[9px] text-paax-text-muted">Ruangan</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
                      <div className="text-[12px] font-bold text-white">{page.results.doors}</div>
                      <div className="text-[9px] text-paax-text-muted">Pintu</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                      <Square className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-0.5" />
                      <div className="text-[12px] font-bold text-white">{page.results.windows}</div>
                      <div className="text-[9px] text-paax-text-muted">Jendela</div>
                    </div>
                  </div>

                  {/* Room List */}
                  <div className="space-y-1 mb-3 max-h-36 overflow-y-auto">
                    {page.results.rooms.map((room, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-[11px]">
                        <span className="text-paax-text-secondary">{room.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-paax-text-muted">{room.width} × {room.length}</span>
                          <span className="text-white font-medium">{room.area}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-[11px]">
                    <span className="text-paax-text-muted">Total Luas</span>
                    <span className="text-white font-bold">{page.results.totalArea}</span>
                  </div>
                </>
              )}

              {page.status === 'pending' && (
                <div className="py-6 text-center">
                  <Sparkles className="w-6 h-6 text-amber-400 mx-auto mb-2 animate-pulse" />
                  <p className="text-[12px] text-paax-text-muted">Menunggu ekstraksi AI...</p>
                  <button className="btn-primary text-[12px] mt-3">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ekstrak Sekarang
                  </button>
                </div>
              )}

              {/* Actions */}
              {page.status === 'extracted' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
                  <button className="flex-1 btn-primary text-[11px] py-1.5 justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button className="flex-1 btn-secondary text-[11px] py-1.5 justify-center">
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button className="btn-secondary text-[11px] py-1.5 px-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
