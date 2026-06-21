import React from 'react';
import { 
  Database, 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  Info
} from 'lucide-react';

export default function DatabaseAHSPPage() {
  const ahspItems = [
    { id: 'A.2.2.1.4', name: 'Galian tanah biasa sedalam 1 meter', unit: 'm3', material: 0, labor: 85500, equipment: 0, total: 85500, region: 'Kota Depok', year: 2024 },
    { id: 'A.3.2.1.2', name: 'Pemasangan pondasi batu kali campuran 1SP : 4PP', unit: 'm3', material: 625000, labor: 245000, equipment: 0, total: 870000, region: 'Kota Depok', year: 2024 },
    { id: 'A.4.1.1.5', name: 'Membuat beton mutu f’c = 19,3 MPa (K 225)', unit: 'm3', material: 950000, labor: 185000, equipment: 45000, total: 1180000, region: 'Kota Depok', year: 2024 },
    { id: 'A.4.1.1.17', name: 'Pembesian 10 kg dengan besi polos atau besi ulir', unit: '10 kg', material: 145000, labor: 35000, equipment: 0, total: 180000, region: 'Kota Depok', year: 2024 },
    { id: 'A.4.1.1.20', name: 'Pemasangan bekisting untuk pondasi', unit: 'm2', material: 125000, labor: 65000, equipment: 0, total: 190000, region: 'Kota Depok', year: 2024 },
    { id: 'A.4.4.1.9', name: 'Pemasangan dinding bata merah (5x11x22) cm tebal ½ bata', unit: 'm2', material: 85000, labor: 45000, equipment: 0, total: 130000, region: 'Kota Depok', year: 2024 },
    { id: 'A.4.4.2.4', name: 'Pemasangan plesteran 1 SP : 4 PP tebal 15 mm', unit: 'm2', material: 32000, labor: 38000, equipment: 0, total: 70000, region: 'Kota Depok', year: 2024 },
  ];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Database AHSP</h1>
          <p className="text-slate-400 text-sm mt-1">Pusat data Analisa Harga Satuan Pekerjaan berstandar PUPR</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Update Database
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
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
            <p className="text-sm text-slate-400">Total Item AHSP</p>
            <p className="text-2xl font-bold text-white">12,450</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Harga Material Dasar</p>
            <p className="text-2xl font-bold text-white">4,820</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Regional Tersedia</p>
            <p className="text-2xl font-bold text-white">34 Prov</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari kode atau nama pekerjaan..." 
              className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          
          <div className="flex w-full lg:w-auto gap-2 overflow-x-auto pb-1 scrollbar-none">
            <select className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 min-w-[150px]">
              <option>Pekerjaan Tanah</option>
              <option>Pekerjaan Pondasi</option>
              <option>Pekerjaan Beton</option>
              <option>Pekerjaan Dinding</option>
            </select>
            <select className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 min-w-[150px]">
              <option>Kota Depok</option>
              <option>Jakarta Selatan</option>
              <option>Kota Bogor</option>
            </select>
            <select className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 min-w-[100px]">
              <option>2024</option>
              <option>2023</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
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
              {ahspItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-mono text-indigo-400">{item.id}</td>
                  <td className="p-4 text-slate-200 font-medium leading-relaxed">{item.name}</td>
                  <td className="p-4 text-slate-400">{item.unit}</td>
                  <td className="p-4 text-slate-400 text-right">{item.material > 0 ? formatCurrency(item.material) : '-'}</td>
                  <td className="p-4 text-slate-400 text-right">{item.labor > 0 ? formatCurrency(item.labor) : '-'}</td>
                  <td className="p-4 text-slate-400 text-right">{item.equipment > 0 ? formatCurrency(item.equipment) : '-'}</td>
                  <td className="p-4 text-slate-200 font-semibold text-right">{formatCurrency(item.total)}</td>
                  <td className="p-4 text-center">
                    <button className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-slate-800 transition-colors">
                      <Info className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-between items-center text-sm text-slate-400">
          <span>Menampilkan 1-7 dari 245 item (Kategori: Semua)</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700 disabled:opacity-50">Prev</button>
            <button className="px-3 py-1 bg-indigo-600 text-white rounded">1</button>
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700">2</button>
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700">3</button>
            <button className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
