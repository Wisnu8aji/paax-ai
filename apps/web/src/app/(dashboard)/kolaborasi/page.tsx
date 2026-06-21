import React from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Mail, 
  MoreHorizontal
} from 'lucide-react';

export default function KolaborasiPage() {
  const members = [
    { id: 1, name: 'Budi Santoso', email: 'budi@example.com', role: 'Owner', status: 'Active', avatar: 'BS' },
    { id: 2, name: 'Andi Wijaya', email: 'andi.w@example.com', role: 'Project Manager', status: 'Active', avatar: 'AW' },
    { id: 3, name: 'Siti Aminah', email: 'siti.a@example.com', role: 'Estimator', status: 'Active', avatar: 'SA' },
    { id: 4, name: 'Reza Rahadian', email: 'reza@example.com', role: 'Site Engineer', status: 'Pending', avatar: 'RR' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tim & Kolaborasi</h1>
          <p className="text-slate-400 text-sm mt-1">Kelola akses anggota tim ke workspace PAAX AI</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
          <UserPlus className="w-4 h-4" />
          Undang Anggota
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white mb-1">Anggota Workspace</h2>
          <p className="text-sm text-slate-400">Total 4 anggota (Sisa kuota: 6 dari 10)</p>
        </div>
        
        <div className="divide-y divide-slate-800">
          {members.map((member) => (
            <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                  ${member.status === 'Pending' ? 'bg-slate-800 text-slate-500 border border-slate-700 border-dashed' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'}
                `}>
                  {member.avatar}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    {member.name}
                    {member.status === 'Pending' && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] border border-slate-700">Pending Invite</span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3" /> {member.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-1 px-3 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300">
                  <Shield className="w-3 h-3 text-slate-400" />
                  {member.role}
                </div>
                <button className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role Explanations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white/5 border border-white/5 rounded-xl">
          <Shield className="w-6 h-6 text-indigo-400 mb-3" />
          <h3 className="font-medium text-white mb-2 text-sm">Owner / Admin</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Memiliki akses penuh ke semua fitur, pengaturan billing, dan manajemen anggota.</p>
        </div>
        <div className="p-5 bg-white/5 border border-white/5 rounded-xl">
          <Shield className="w-6 h-6 text-emerald-400 mb-3" />
          <h3 className="font-medium text-white mb-2 text-sm">Project Manager</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Bisa membuat/edit proyek, mengelola RAB, jadwal, dan melihat dashboard analitik penuh.</p>
        </div>
        <div className="p-5 bg-white/5 border border-white/5 rounded-xl">
          <Shield className="w-6 h-6 text-blue-400 mb-3" />
          <h3 className="font-medium text-white mb-2 text-sm">Site / Estimator</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Akses terbatas untuk upload laporan lapangan, review gambar, dan input data spesifik.</p>
        </div>
      </div>

    </div>
  );
}
