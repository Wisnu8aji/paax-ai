'use client';

import React, { useState } from 'react';
import { 
  Database, 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  Info
} from 'lucide-react';
import { formatRupiah } from '@/lib/format';

export default function DatabaseAHSPPage() {
  const initialAhspItems = [
    { id: 'A.2.2.1.4', name: 'Galian tanah biasa sedalam 1 meter', unit: 'm3', category: 'Pekerjaan Tanah', region: 'Kota Depok', material: 0, labor: 85500, equipment: 0, total: 85500, year: 2026 },
    { id: 'A.3.2.1.2', name: 'Pemasangan pondasi batu kali campuran 1SP : 4PP', unit: 'm3', category: 'Pekerjaan Pondasi', region: 'Kota Depok', material: 625000, labor: 245000, equipment: 0, total: 870000, year: 2026 },
    { id: 'A.4.1.1.5', name: 'Membuat beton mutu f’c = 19,3 MPa (K 225)', unit: 'm3', category: 'Pekerjaan Beton', region: 'Kota Depok', material: 950000, labor: 185000, equipment: 45000, total: 1180000, year: 2026 },
    { id: 'A.4.1.1.17', name: 'Pembesian 10 kg dengan besi polos atau besi ulir', unit: '10 kg', category: 'Pekerjaan Beton', region: 'Kota Depok', material: 145000, labor: 35000, equipment: 0, total: 180000, year: 2026 },
    { id: 'A.4.1.1.20', name: 'Pemasangan bekisting untuk pondasi', unit: 'm2', category: 'Pekerjaan Beton', region: 'Kota Depok', material: 125000, labor: 65000, equipment: 0, total: 190000, year: 2026 },
    { id: 'A.4.4.1.9', name: 'Pemasangan dinding bata merah (5x11x22) cm tebal ½ bata', unit: 'm2', category: 'Pekerjaan Dinding', region: 'Kota Depok', material: 85000, labor: 45000, equipment: 0, total: 130000, year: 2026 },
    { id: 'A.4.4.2.4', name: 'Pemasangan plesteran 1 SP : 4 PP tebal 15 mm', unit: 'm2', category: 'Pekerjaan Dinding', region: 'Kota Depok', material: 32000, labor: 38000, equipment: 0, total: 70000, year: 2026 },
  ];

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Semua Kategori');
  const [region, setRegion] = useState('Kota Depok');
  const [year, setYear] = useState('2026');

  const filteredItems = initialAhspItems.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.id.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'Semua Kategori' || item.category === category;
    const matchRegion = item.region === region;
    const matchYear = item.year.toString() === year;
    return matchSearch && matchCat && matchRegion && matchYear;
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Database AHSP</h1>
          <p className="text-paax-text-muted text-sm mt-1">Pusat data Analisa Harga Satuan Pekerjaan berstandar PUPR</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" />
            Update Database
          </button>
          <button className="btn-primary text-sm">
            <Download className="w-4 h-4" />
            Export Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-paax-text-muted">Total Item AHSP</p>
            <p className="text-2xl font-bold text-white">12,450</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-paax-text-muted">Harga Material Dasar</p>
            <p className="text-2xl font-bold text-white">4,820</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-paax-text-muted">Regional Tersedia</p>
            <p className="text-2xl font-bold text-white">34 Prov</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paax-text-muted" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode atau nama pekerjaan..." 
              className="input-field pl-9 text-[13px] w-full"
            />
          </div>
          
          <div className="flex w-full lg:w-auto gap-2 overflow-x-auto pb-1 scrollbar-none">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field appearance-none py-2 text-[13px]">
              <option value="Semua Kategori">Semua Kategori</option>
              <option value="Pekerjaan Tanah">Pekerjaan Tanah</option>
              <option value="Pekerjaan Pondasi">Pekerjaan Pondasi</option>
              <option value="Pekerjaan Beton">Pekerjaan Beton</option>
              <option value="Pekerjaan Dinding">Pekerjaan Dinding</option>
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="input-field appearance-none py-2 text-[13px]">
              <option value="Kota Depok">Kota Depok</option>
              <option value="Jakarta Selatan">Jakarta Selatan</option>
              <option value="Kota Bogor">Kota Bogor</option>
            </select>
            <select value={year} onChange={(e) => setYear(e.target.value)} className="input-field appearance-none py-2 text-[13px]">
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium w-32">Kode</th>
                <th className="p-4 font-medium">Uraian Pekerjaan</th>
                <th className="p-4 font-medium w-16">Sat</th>
                <th className="p-4 font-medium w-32 text-right">Bahan</th>
                <th className="p-4 font-medium w-32 text-right">Upah</th>
                <th className="p-4 font-medium w-32 text-right">Alat</th>
                <th className="p-4 font-medium w-36 text-right">Harga Satuan</th>
                <th className="p-4 font-medium w-16 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50">
              {filteredItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-mono text-indigo-400">{item.id}</td>
                  <td className="p-4 text-slate-200 font-medium leading-relaxed">{item.name}</td>
                  <td className="p-4 text-paax-text-muted">{item.unit}</td>
                  <td className="p-4 text-paax-text-muted text-right">{item.material > 0 ? formatRupiah(item.material) : '-'}</td>
                  <td className="p-4 text-paax-text-muted text-right">{item.labor > 0 ? formatRupiah(item.labor) : '-'}</td>
                  <td className="p-4 text-paax-text-muted text-right">{item.equipment > 0 ? formatRupiah(item.equipment) : '-'}</td>
                  <td className="p-4 text-white font-semibold text-right">{formatRupiah(item.total)}</td>
                  <td className="p-4 text-center">
                    <button className="p-1.5 text-paax-text-muted hover:text-indigo-400 rounded-lg hover:bg-slate-800 transition-colors">
                      <Info className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-paax-text-muted">Tidak ada data AHSP yang sesuai filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-between items-center text-sm text-paax-text-muted">
          <span>Menampilkan {filteredItems.length} dari {initialAhspItems.length} item (Kategori: {category})</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">Prev</button>
            <button className="px-3 py-1 bg-indigo-600 text-white rounded">1</button>
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
