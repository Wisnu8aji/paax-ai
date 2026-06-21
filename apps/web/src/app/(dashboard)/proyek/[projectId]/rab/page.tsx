'use client';

import { useState } from 'react';
import {
  Calculator,
  Sparkles,
  Upload,
  RefreshCw,
  Eye,
  TrendingDown,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  MoreHorizontal,
  FileSpreadsheet,
  ArrowUpDown,
  Search,
  Filter,
  Info,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

const rabSummary = [
  { label: 'Subtotal', value: 'Rp 714.285.714', color: 'text-white' },
  { label: 'PPN 11%', value: 'Rp 78.571.429', color: 'text-paax-text-secondary' },
  { label: 'Contingency 5%', value: 'Rp 35.714.286', color: 'text-paax-text-secondary' },
  { label: 'Grand Total', value: 'Rp 850.000.000', color: 'text-indigo-400', bold: true },
  { label: 'Missing Items', value: '5', color: 'text-amber-400', alert: true },
  { label: 'Abnormal Items', value: '2', color: 'text-red-400', alert: true },
];

const rabItems = [
  { no: '1', kode: 'PRS.001', wbs: '1.0', uraian: 'PEKERJAAN PERSIAPAN', satuan: '', volume: '', harga: '', jumlah: 'Rp 18.500.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '1.1', kode: 'PRS.001.01', wbs: '1.1', uraian: 'Pembersihan lahan & perataan tanah', satuan: 'm²', volume: '250', harga: 'Rp 25.000', jumlah: 'Rp 6.250.000', sumber: 'AHSP Depok 2026', confidence: 95, status: 'verified', warning: '' },
  { no: '1.2', kode: 'PRS.001.02', wbs: '1.2', uraian: 'Pengukuran & bouwplank', satuan: 'm\'', volume: '65', harga: 'Rp 85.000', jumlah: 'Rp 5.525.000', sumber: 'AHSP Depok 2026', confidence: 92, status: 'verified', warning: '' },
  { no: '1.3', kode: 'PRS.001.03', wbs: '1.3', uraian: 'Galian tanah pondasi', satuan: 'm³', volume: '42', harga: 'Rp 95.000', jumlah: 'Rp 3.990.000', sumber: 'AHSP Depok 2026', confidence: 88, status: 'verified', warning: '' },
  { no: '1.4', kode: 'PRS.001.04', wbs: '1.4', uraian: 'Urugan tanah kembali', satuan: 'm³', volume: '18', harga: 'Rp 45.000', jumlah: 'Rp 810.000', sumber: 'AHSP Depok 2026', confidence: 90, status: 'verified', warning: '' },
  { no: '1.5', kode: 'PRS.001.05', wbs: '1.5', uraian: 'Urugan pasir bawah pondasi t=10cm', satuan: 'm³', volume: '8,5', harga: 'Rp 225.000', jumlah: 'Rp 1.912.500', sumber: 'AHSP Depok 2026', confidence: 91, status: 'draft', warning: '' },
  { no: '2', kode: 'STR.001', wbs: '2.0', uraian: 'PEKERJAAN PONDASI', satuan: '', volume: '', harga: '', jumlah: 'Rp 98.750.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '2.1', kode: 'STR.001.01', wbs: '2.1', uraian: 'Pasangan batu kali 1Pc : 4Ps', satuan: 'm³', volume: '28', harga: 'Rp 950.000', jumlah: 'Rp 26.600.000', sumber: 'AHSP Depok 2026', confidence: 93, status: 'verified', warning: '' },
  { no: '2.2', kode: 'STR.001.02', wbs: '2.2', uraian: 'Beton bertulang pondasi footplate K-250', satuan: 'm³', volume: '12', harga: 'Rp 2.850.000', jumlah: 'Rp 34.200.000', sumber: 'AHSP Depok 2026', confidence: 89, status: 'verified', warning: '' },
  { no: '2.3', kode: 'STR.001.03', wbs: '2.3', uraian: 'Sloof beton bertulang 20/30 K-250', satuan: 'm³', volume: '8,5', harga: 'Rp 3.200.000', jumlah: 'Rp 27.200.000', sumber: 'AHSP Depok 2026', confidence: 87, status: 'needs-review', warning: 'Volume perlu dicek ulang dgn gambar' },
  { no: '2.4', kode: 'STR.001.04', wbs: '2.4', uraian: 'Pondasi cakar ayam 80x80x100', satuan: 'titik', volume: '12', harga: 'Rp 895.000', jumlah: 'Rp 10.740.000', sumber: 'AHSP Depok 2026', confidence: 85, status: 'verified', warning: '' },
  { no: '3', kode: 'STR.002', wbs: '3.0', uraian: 'PEKERJAAN STRUKTUR', satuan: '', volume: '', harga: '', jumlah: 'Rp 186.400.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '3.1', kode: 'STR.002.01', wbs: '3.1', uraian: 'Kolom beton bertulang 30/30 K-300', satuan: 'm³', volume: '9,6', harga: 'Rp 4.500.000', jumlah: 'Rp 43.200.000', sumber: 'AHSP Depok 2026', confidence: 91, status: 'verified', warning: '' },
  { no: '3.2', kode: 'STR.002.02', wbs: '3.2', uraian: 'Balok beton bertulang 25/40 K-300', satuan: 'm³', volume: '14,2', harga: 'Rp 4.200.000', jumlah: 'Rp 59.640.000', sumber: 'AHSP Depok 2026', confidence: 88, status: 'verified', warning: '' },
  { no: '3.3', kode: 'STR.002.03', wbs: '3.3', uraian: 'Pelat lantai beton t=12cm K-250', satuan: 'm²', volume: '90', harga: 'Rp 450.000', jumlah: 'Rp 40.500.000', sumber: 'AHSP Depok 2026', confidence: 90, status: 'verified', warning: '' },
  { no: '3.4', kode: 'STR.002.04', wbs: '3.4', uraian: 'Tangga beton bertulang K-300', satuan: 'm³', volume: '3,2', harga: 'Rp 5.500.000', jumlah: 'Rp 17.600.000', sumber: 'AHSP Depok 2026', confidence: 86, status: 'draft', warning: '' },
  { no: '3.5', kode: 'STR.002.05', wbs: '3.5', uraian: 'Ring balok beton 15/20 K-250', satuan: 'm\'', volume: '48', harga: 'Rp 285.000', jumlah: 'Rp 13.680.000', sumber: 'AHSP Depok 2026', confidence: 92, status: 'verified', warning: '' },
  { no: '3.6', kode: 'STR.002.06', wbs: '3.6', uraian: 'Besi beton tulangan', satuan: 'kg', volume: '4.200', harga: 'Rp 15.200', jumlah: 'Rp 63.840.000', sumber: 'Market Price', confidence: 72, status: 'warning', warning: 'Harga naik 15% dari AHSP' },
  { no: '4', kode: 'DND.001', wbs: '4.0', uraian: 'PEKERJAAN DINDING', satuan: '', volume: '', harga: '', jumlah: 'Rp 124.350.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '4.1', kode: 'DND.001.01', wbs: '4.1', uraian: 'Pasangan bata ringan (hebel) 10cm', satuan: 'm²', volume: '320', harga: 'Rp 185.000', jumlah: 'Rp 59.200.000', sumber: 'AHSP Depok 2026', confidence: 93, status: 'verified', warning: '' },
  { no: '4.2', kode: 'DND.001.02', wbs: '4.2', uraian: 'Plesteran + acian dinding 1Pc : 4Ps', satuan: 'm²', volume: '640', harga: 'Rp 65.000', jumlah: 'Rp 41.600.000', sumber: 'AHSP Depok 2026', confidence: 91, status: 'verified', warning: '' },
  { no: '4.3', kode: 'DND.001.03', wbs: '4.3', uraian: 'Cat dinding interior Dulux Pentalite', satuan: 'm²', volume: '580', harga: 'Rp 38.000', jumlah: 'Rp 22.040.000', sumber: 'Market Price', confidence: 78, status: 'needs-review', warning: 'Harga cat berbeda dari rata-rata AHSP' },
  { no: '5', kode: 'LNT.001', wbs: '5.0', uraian: 'PEKERJAAN LANTAI', satuan: '', volume: '', harga: '', jumlah: 'Rp 68.400.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '5.1', kode: 'LNT.001.01', wbs: '5.1', uraian: 'Keramik lantai 60x60 Roman Granit', satuan: 'm²', volume: '160', harga: 'Rp 285.000', jumlah: 'Rp 45.600.000', sumber: 'Market Price', confidence: 85, status: 'verified', warning: '' },
  { no: '5.2', kode: 'LNT.001.02', wbs: '5.2', uraian: 'Keramik lantai KM/WC 30x30 anti slip', satuan: 'm²', volume: '12', harga: 'Rp 175.000', jumlah: 'Rp 2.100.000', sumber: 'AHSP Depok 2026', confidence: 90, status: 'verified', warning: '' },
  { no: '5.3', kode: 'LNT.001.03', wbs: '5.3', uraian: 'Keramik dinding KM/WC 25x40', satuan: 'm²', volume: '48', harga: 'Rp 165.000', jumlah: 'Rp 7.920.000', sumber: 'AHSP Depok 2026', confidence: 89, status: 'draft', warning: '' },
  { no: '6', kode: 'ATP.001', wbs: '6.0', uraian: 'PEKERJAAN ATAP', satuan: '', volume: '', harga: '', jumlah: 'Rp 87.500.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '6.1', kode: 'ATP.001.01', wbs: '6.1', uraian: 'Rangka atap baja ringan C75.075', satuan: 'm²', volume: '120', harga: 'Rp 350.000', jumlah: 'Rp 42.000.000', sumber: 'Market Price', confidence: 87, status: 'verified', warning: '' },
  { no: '6.2', kode: 'ATP.001.02', wbs: '6.2', uraian: 'Penutup atap galvalum 0.35mm', satuan: 'm²', volume: '130', harga: 'Rp 125.000', jumlah: 'Rp 16.250.000', sumber: 'Market Price', confidence: 85, status: 'verified', warning: '' },
  { no: '6.3', kode: 'ATP.001.03', wbs: '6.3', uraian: 'Plafon gypsum 9mm + rangka hollow', satuan: 'm²', volume: '150', harga: 'Rp 95.000', jumlah: 'Rp 14.250.000', sumber: 'AHSP Depok 2026', confidence: 91, status: 'verified', warning: '' },
  { no: '7', kode: 'KSN.001', wbs: '7.0', uraian: 'PEKERJAAN KUSEN & PINTU', satuan: '', volume: '', harga: '', jumlah: 'Rp 64.800.000', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '7.1', kode: 'KSN.001.01', wbs: '7.1', uraian: 'Kusen aluminium 4" powder coating', satuan: 'm\'', volume: '86', harga: 'Rp 285.000', jumlah: 'Rp 24.510.000', sumber: 'Market Price', confidence: 83, status: 'verified', warning: '' },
  { no: '7.2', kode: 'KSN.001.02', wbs: '7.2', uraian: 'Pintu panel kayu meranti + finishing', satuan: 'unit', volume: '8', harga: 'Rp 2.850.000', jumlah: 'Rp 22.800.000', sumber: 'Market Price', confidence: 80, status: 'draft', warning: '' },
  { no: '7.3', kode: 'KSN.001.03', wbs: '7.3', uraian: 'Jendela aluminium + kaca 5mm', satuan: 'unit', volume: '14', harga: 'Rp 1.250.000', jumlah: 'Rp 17.500.000', sumber: 'Market Price', confidence: 82, status: 'verified', warning: '' },
  { no: '8', kode: 'MEP.001', wbs: '8.0', uraian: 'PEKERJAAN MEP', satuan: '', volume: '', harga: '', jumlah: 'Rp 65.585.714', sumber: '', confidence: 0, status: 'header', warning: '', isHeader: true },
  { no: '8.1', kode: 'MEP.001.01', wbs: '8.1', uraian: 'Instalasi listrik titik lampu', satuan: 'titik', volume: '32', harga: 'Rp 485.000', jumlah: 'Rp 15.520.000', sumber: 'AHSP Depok 2026', confidence: 88, status: 'verified', warning: '' },
  { no: '8.2', kode: 'MEP.001.02', wbs: '8.2', uraian: 'Instalasi stop kontak + saklar', satuan: 'titik', volume: '28', harga: 'Rp 325.000', jumlah: 'Rp 9.100.000', sumber: 'AHSP Depok 2026', confidence: 87, status: 'verified', warning: '' },
  { no: '8.3', kode: 'MEP.001.03', wbs: '8.3', uraian: 'Instalasi pipa air bersih PPR', satuan: 'titik', volume: '12', harga: 'Rp 650.000', jumlah: 'Rp 7.800.000', sumber: 'AHSP Depok 2026', confidence: 90, status: 'verified', warning: '' },
  { no: '8.4', kode: 'MEP.001.04', wbs: '8.4', uraian: 'Instalasi pipa air kotor PVC 4"', satuan: 'titik', volume: '8', harga: 'Rp 450.000', jumlah: 'Rp 3.600.000', sumber: 'AHSP Depok 2026', confidence: 89, status: 'verified', warning: '' },
  { no: '8.5', kode: 'MEP.001.05', wbs: '8.5', uraian: 'Sanitasi (closet, wastafel, shower)', satuan: 'set', volume: '3', harga: 'Rp 8.500.000', jumlah: 'Rp 25.500.000', sumber: 'Market Price', confidence: 79, status: 'needs-review', warning: 'Spesifikasi belum dikonfirmasi klien' },
];

const tabs = ['RAB Detail', 'BOQ', 'HSP/AHSP', 'Warnings', 'Assumptions'];

function getStatusBadge(status: string) {
  switch (status) {
    case 'verified': return <span className="badge badge-green text-[9px]"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
    case 'draft': return <span className="badge badge-slate text-[9px]"><Clock className="w-3 h-3" /> Draft</span>;
    case 'needs-review': return <span className="badge badge-amber text-[9px]"><Eye className="w-3 h-3" /> Review</span>;
    case 'warning': return <span className="badge badge-red text-[9px]"><AlertTriangle className="w-3 h-3" /> Warning</span>;
    default: return null;
  }
}

function getConfidenceColor(c: number) {
  if (c >= 90) return 'text-emerald-400';
  if (c >= 80) return 'text-blue-400';
  if (c >= 70) return 'text-amber-400';
  return 'text-red-400';
}

export default function RABPage() {
  const [activeTab, setActiveTab] = useState('RAB Detail');

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {rabSummary.map((item) => (
          <div key={item.label} className="stat-card py-3 px-4">
            <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">{item.label}</div>
            <div className={`text-[15px] font-bold ${item.color} ${item.bold ? 'text-lg' : ''}`}>
              {item.value}
            </div>
            {item.alert && (
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-1" />
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-primary text-[12px]">
          <Sparkles className="w-4 h-4" />
          Generate RAB
        </button>
        <button className="btn-secondary text-[12px]">
          <Upload className="w-4 h-4" />
          Import Excel
        </button>
        <button className="btn-secondary text-[12px]">
          <RefreshCw className="w-4 h-4" />
          Recalculate
        </button>
        <button className="btn-secondary text-[12px]">
          <Eye className="w-4 h-4" />
          Review
        </button>
        <button className="btn-secondary text-[12px]">
          <TrendingDown className="w-4 h-4" />
          Optimize Budget
        </button>
        <button className="btn-secondary text-[12px] ml-auto">
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-[13px] font-medium transition-all ${
              activeTab === tab ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab}
            {tab === 'Warnings' && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">3</span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paax-text-muted" />
          <input
            type="text"
            placeholder="Cari item pekerjaan..."
            className="input-field pl-10 text-[13px]"
          />
        </div>
        <button className="btn-secondary text-[12px]">
          <Filter className="w-3.5 h-3.5" />
          Filter Status
        </button>
        <button className="btn-secondary text-[12px]">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort
        </button>
      </div>

      {/* RAB Table */}
      {activeTab === 'RAB Detail' && (
        <div className="table-container max-h-[600px] overflow-y-auto">
          <table>
            <thead>
              <tr>
                <th className="w-12">No</th>
                <th className="w-24">Kode</th>
                <th className="w-12">WBS</th>
                <th className="min-w-[280px]">Uraian Pekerjaan</th>
                <th className="w-16">Satuan</th>
                <th className="w-16 text-right">Volume</th>
                <th className="w-28 text-right">Harga Satuan</th>
                <th className="w-32 text-right">Jumlah</th>
                <th className="w-28">Sumber</th>
                <th className="w-20 text-center">Confidence</th>
                <th className="w-20">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rabItems.map((item, i) => (
                <tr
                  key={i}
                  className={`${
                    item.isHeader
                      ? 'bg-white/[0.03] font-semibold'
                      : item.warning
                        ? 'bg-amber-500/[0.03]'
                        : ''
                  }`}
                >
                  <td className="text-paax-text-muted text-[12px]">{item.no}</td>
                  <td className="text-[11px] text-paax-text-muted font-mono">{item.kode}</td>
                  <td className="text-[11px] text-paax-text-muted">{item.wbs}</td>
                  <td className={`text-[12px] ${item.isHeader ? 'text-white font-bold text-[13px]' : 'text-paax-text-secondary'}`}>
                    {item.uraian}
                    {item.warning && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] text-amber-400">{item.warning}</span>
                      </div>
                    )}
                  </td>
                  <td className="text-[11px] text-paax-text-muted">{item.satuan}</td>
                  <td className="text-[12px] text-right text-paax-text-secondary">{item.volume}</td>
                  <td className="text-[12px] text-right text-paax-text-secondary font-mono">{item.harga}</td>
                  <td className={`text-[12px] text-right font-mono ${item.isHeader ? 'text-white font-bold' : 'text-white'}`}>
                    {item.jumlah}
                  </td>
                  <td className="text-[10px] text-paax-text-muted">{item.sumber}</td>
                  <td className="text-center">
                    {item.confidence > 0 && (
                      <span className={`text-[11px] font-semibold ${getConfidenceColor(item.confidence)}`}>
                        {item.confidence}%
                      </span>
                    )}
                  </td>
                  <td>{!item.isHeader && getStatusBadge(item.status)}</td>
                  <td>
                    {!item.isHeader && (
                      <button className="p-1 rounded hover:bg-white/[0.05] text-paax-text-muted hover:text-white transition-all">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* BOQ Tab Content */}
      {activeTab === 'BOQ' && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Bill of Quantities</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Spesifikasi</th>
                  <th className="text-right">Qty Total</th>
                  <th>Satuan</th>
                  <th className="text-right">Harga Satuan</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { material: 'Semen Portland', spec: 'Tiga Roda, 50kg', qty: '285', unit: 'zak', price: 'Rp 72.000', total: 'Rp 20.520.000' },
                  { material: 'Pasir Pasang', spec: 'Pasir Bangka', qty: '42', unit: 'm³', price: 'Rp 380.000', total: 'Rp 15.960.000' },
                  { material: 'Batu Split 1/2', spec: 'Ex. Bogor', qty: '38', unit: 'm³', price: 'Rp 425.000', total: 'Rp 16.150.000' },
                  { material: 'Besi Beton D10', spec: 'SNI, panjang 12m', qty: '480', unit: 'btg', price: 'Rp 85.000', total: 'Rp 40.800.000' },
                  { material: 'Besi Beton D16', spec: 'SNI, panjang 12m', qty: '320', unit: 'btg', price: 'Rp 195.000', total: 'Rp 62.400.000' },
                  { material: 'Bata Ringan (Hebel)', spec: '60x20x10cm', qty: '3.200', unit: 'bh', price: 'Rp 8.500', total: 'Rp 27.200.000' },
                  { material: 'Keramik 60x60', spec: 'Roman Granit GT602', qty: '185', unit: 'm²', price: 'Rp 125.000', total: 'Rp 23.125.000' },
                  { material: 'Cat Dulux Pentalite', spec: 'Interior, 20L', qty: '18', unit: 'pail', price: 'Rp 485.000', total: 'Rp 8.730.000' },
                ].map((item, i) => (
                  <tr key={i}>
                    <td className="text-[12px] font-medium text-white">{item.material}</td>
                    <td className="text-[11px] text-paax-text-muted">{item.spec}</td>
                    <td className="text-[12px] text-right text-paax-text-secondary">{item.qty}</td>
                    <td className="text-[11px] text-paax-text-muted">{item.unit}</td>
                    <td className="text-[12px] text-right text-paax-text-secondary font-mono">{item.price}</td>
                    <td className="text-[12px] text-right text-white font-mono font-medium">{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HSP/AHSP Tab Content */}
      {activeTab === 'HSP/AHSP' && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Harga Satuan Pekerjaan (HSP)</h3>
          <p className="text-[12px] text-paax-text-muted mb-4">Sumber: AHSP Kabupaten Depok Tahun 2026, dengan koreksi harga pasar real-time</p>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Kode AHSP</th>
                  <th>Uraian</th>
                  <th>Satuan</th>
                  <th className="text-right">Harga AHSP</th>
                  <th className="text-right">Harga Pasar</th>
                  <th className="text-right">Selisih</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { kode: 'A.1.1.1', uraian: 'Pembersihan lahan', satuan: 'm²', ahsp: 'Rp 25.000', pasar: 'Rp 25.000', diff: '0%', status: 'match' },
                  { kode: 'A.2.3.1', uraian: 'Pasangan batu kali', satuan: 'm³', ahsp: 'Rp 950.000', pasar: 'Rp 975.000', diff: '+2.6%', status: 'match' },
                  { kode: 'A.4.1.1', uraian: 'Beton K-250', satuan: 'm³', ahsp: 'Rp 2.850.000', pasar: 'Rp 2.920.000', diff: '+2.5%', status: 'match' },
                  { kode: 'A.4.1.7', uraian: 'Besi beton tulangan', satuan: 'kg', ahsp: 'Rp 13.200', pasar: 'Rp 15.200', diff: '+15.2%', status: 'diverged' },
                  { kode: 'A.6.1.1', uraian: 'Pasangan bata ringan', satuan: 'm²', ahsp: 'Rp 185.000', pasar: 'Rp 192.000', diff: '+3.8%', status: 'match' },
                ].map((item, i) => (
                  <tr key={i}>
                    <td className="text-[11px] font-mono text-paax-text-muted">{item.kode}</td>
                    <td className="text-[12px] text-paax-text-secondary">{item.uraian}</td>
                    <td className="text-[11px] text-paax-text-muted">{item.satuan}</td>
                    <td className="text-[12px] text-right font-mono text-paax-text-secondary">{item.ahsp}</td>
                    <td className="text-[12px] text-right font-mono text-white">{item.pasar}</td>
                    <td className={`text-[12px] text-right font-mono ${item.status === 'diverged' ? 'text-red-400 font-semibold' : 'text-paax-text-muted'}`}>{item.diff}</td>
                    <td>
                      {item.status === 'match' ? (
                        <span className="badge badge-green text-[9px]">Match</span>
                      ) : (
                        <span className="badge badge-red text-[9px]">Diverged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings Tab */}
      {activeTab === 'Warnings' && (
        <div className="space-y-3">
          {[
            { title: 'Harga besi beton naik signifikan', detail: 'Harga besi beton D16 saat ini Rp 15.200/kg, sedangkan AHSP Depok 2026 tercatat Rp 13.200/kg. Selisih 15.2% melebihi threshold 10%.', severity: 'critical', affected: 'STR.002.06 - Besi beton tulangan', suggestion: 'Update harga ke market price dan sesuaikan budget RAB' },
            { title: 'Volume sloof perlu verifikasi', detail: 'Volume sloof 8,5 m³ berdasarkan estimasi AI dari gambar denah. Verifikasi manual diperlukan karena ada revisi gambar denah terbaru.', severity: 'warning', affected: 'STR.001.03 - Sloof beton bertulang', suggestion: 'Bandingkan dengan gambar denah revisi 3' },
            { title: 'Harga cat berbeda dari AHSP', detail: 'Cat Dulux Pentalite dihargai Rp 38.000/m² berdasarkan market price, sedangkan AHSP menggunakan estimasi Rp 32.000/m² (cat generic).', severity: 'warning', affected: 'DND.001.03 - Cat dinding interior', suggestion: 'Konfirmasi spesifikasi cat dengan klien' },
            { title: 'Spesifikasi sanitasi belum dikonfirmasi', detail: 'Item sanitasi menggunakan estimasi harga set standar Rp 8.500.000. Klien belum mengkonfirmasi merk dan spesifikasi.', severity: 'info', affected: 'MEP.001.05 - Sanitasi', suggestion: 'Request konfirmasi spesifikasi dari klien' },
            { title: 'Missing item: Pekerjaan waterproofing', detail: 'Gambar denah menunjukkan adanya KM/WC dan dapur basah, namun tidak ada item waterproofing dalam RAB.', severity: 'critical', affected: 'Section: Pekerjaan Waterproofing', suggestion: 'Tambahkan item waterproofing membrane untuk area basah' },
          ].map((w, i) => (
            <div key={i} className={`glass-card p-4 border-l-2 ${
              w.severity === 'critical' ? 'border-l-red-500' : w.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'
            }`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {w.severity === 'critical' ? <XCircle className="w-4 h-4 text-red-400" /> : w.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <Info className="w-4 h-4 text-blue-400" />}
                  <h4 className="text-[13px] font-semibold text-white">{w.title}</h4>
                </div>
                <span className={`badge ${w.severity === 'critical' ? 'badge-red' : w.severity === 'warning' ? 'badge-amber' : 'badge-blue'} text-[9px]`}>
                  {w.severity}
                </span>
              </div>
              <p className="text-[12px] text-paax-text-secondary mb-2 ml-6">{w.detail}</p>
              <div className="ml-6 space-y-1">
                <div className="text-[11px]"><span className="text-paax-text-muted">Affected: </span><span className="text-paax-text-secondary">{w.affected}</span></div>
                <div className="text-[11px]"><span className="text-paax-text-muted">Suggestion: </span><span className="text-indigo-400">{w.suggestion}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assumptions Tab */}
      {activeTab === 'Assumptions' && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Asumsi & Catatan RAB</h3>
          <div className="space-y-3">
            {[
              'Harga material berdasarkan AHSP Kabupaten Depok Tahun 2026 kecuali disebutkan lain',
              'Harga sudah termasuk upah tenaga kerja sesuai standar AHSP',
              'Volume berdasarkan hasil ekstraksi AI dari gambar kerja denah Lt.1 & Lt.2 (revisi 2)',
              'PPN 11% dihitung dari subtotal pekerjaan',
              'Contingency 5% untuk mengantisipasi perubahan harga material',
              'Harga market price diambil per tanggal 20 Juni 2026',
              'Belum termasuk biaya IMB, notaris, dan pajak lainnya',
              'Spesifikasi material dapat berubah sesuai ketersediaan dan persetujuan klien',
              'Jarak angkut material diasumsikan dalam radius 20km dari lokasi proyek',
            ].map((assumption, i) => (
              <div key={i} className="flex items-start gap-3 py-1">
                <span className="text-[12px] text-paax-text-muted font-medium">{i + 1}.</span>
                <p className="text-[12px] text-paax-text-secondary">{assumption}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
