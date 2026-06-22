'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  CreditCard, 
  Bell, 
  Lock, 
  Cpu,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  FileBadge
} from 'lucide-react';
import { CoreEngineAPI } from '@/lib/core-engine-client';
import { DocumentIntelligenceClient } from '@/lib/document-intelligence-client';
import { DocumentIntelligenceHealth } from '@paax/types';

export default function PengaturanPage() {
  const [activeTab, setActiveTab] = useState('profil');
  const [healthInfo, setHealthInfo] = useState<any>(null);
  const [docHealthInfo, setDocHealthInfo] = useState<DocumentIntelligenceHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const info = await CoreEngineAPI.health();
      setHealthInfo(info);
    } catch (error) {
      setHealthInfo({ status: 'offline', version: 'unknown', error: true });
    }
    
    try {
      const docInfo = await DocumentIntelligenceClient.getHealth();
      setDocHealthInfo(docInfo);
    } catch (error) {
      setDocHealthInfo({ status: 'offline', version: 'unknown', service: 'document-intelligence', mode: 'fallback_demo', ai_provider_configured: false });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'system') {
      checkHealth();
    }
  }, [activeTab]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Pengaturan</h1>
        <p className="text-paax-text-muted text-sm mt-1">Kelola profil, preferensi, dan langganan workspace</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Settings Navigation */}
        <div className="w-full md:w-64 space-y-1">
          <button 
            onClick={() => setActiveTab('profil')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profil' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Building2 className="w-4 h-4" />
            Profil Perusahaan
          </button>
          <button 
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'system' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Server className="w-4 h-4" />
            System & Engine
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ai' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <Cpu className="w-4 h-4" />
            Preferensi AI
          </button>
          <button 
            onClick={() => setActiveTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
          >
            <CreditCard className="w-4 h-4" />
            Billing & Langganan
          </button>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 space-y-6">
          
          {activeTab === 'profil' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-fade-in">
              <h2 className="text-lg font-semibold text-white mb-6">Informasi Perusahaan</h2>
              <div className="space-y-5">
                <div className="flex gap-4 items-center mb-6">
                  <div className="w-20 h-20 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-500">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <button className="btn-secondary text-sm mb-2">Upload Logo</button>
                    <p className="text-[11px] text-paax-text-secondary">Direkomendasikan ukuran 256x256px (PNG/JPG)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-paax-text-secondary">Nama Perusahaan</label>
                    <input type="text" defaultValue="PT Bangun Nusantara" className="input-field" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium text-paax-text-secondary">Bidang Usaha</label>
                    <select className="input-field appearance-none">
                      <option>Kontraktor Pelaksana</option>
                      <option>Konsultan Perencana</option>
                      <option>Developer / Owner</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-medium text-paax-text-secondary">Alamat Kantor</label>
                    <textarea rows={3} defaultValue="Jl. Sudirman No. 123, Jakarta Selatan" className="input-field resize-none"></textarea>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button className="btn-primary">Simpan Perubahan</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Status Core Engine</h2>
                <button onClick={checkHealth} disabled={isChecking} className="btn-secondary text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} /> Refresh Status
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {healthInfo?.status === 'ok' ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    ) : healthInfo?.status === 'offline' ? (
                      <XCircle className="w-8 h-8 text-red-500" />
                    ) : (
                      <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-white">FastAPI Calculation Engine</h3>
                      <p className="text-xs text-paax-text-muted mt-0.5">http://127.0.0.1:8081</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                      healthInfo?.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      healthInfo?.status === 'offline' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                      {healthInfo?.status === 'ok' ? 'Online' : healthInfo?.status === 'offline' ? 'Offline' : 'Checking...'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-xs text-paax-text-secondary mb-1">Versi Engine</div>
                    <div className="text-sm text-slate-200 font-medium">{healthInfo?.version || 'Unknown'}</div>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-xs text-paax-text-secondary mb-1">Environment</div>
                    <div className="text-sm text-slate-200 font-medium capitalize">{healthInfo?.environment || 'Unknown'}</div>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30 col-span-2">
                    <div className="text-xs text-paax-text-secondary mb-1">Uptime</div>
                    <div className="text-sm text-slate-200 font-medium">{healthInfo?.uptime ? `${healthInfo.uptime} seconds` : 'N/A'}</div>
                  </div>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-center justify-between mt-4">
                  <div className="flex items-center gap-3">
                    {docHealthInfo?.status === 'ok' ? (
                      <CheckCircle2 className="w-8 h-8 text-indigo-500" />
                    ) : docHealthInfo?.status === 'offline' ? (
                      <XCircle className="w-8 h-8 text-red-500" />
                    ) : (
                      <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-white">Document Intelligence Engine</h3>
                      <p className="text-xs text-paax-text-muted mt-0.5">http://127.0.0.1:8083</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col gap-1 items-end">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                      docHealthInfo?.status === 'ok' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 
                      docHealthInfo?.status === 'offline' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                      {docHealthInfo?.status === 'ok' ? 'Online' : docHealthInfo?.status === 'offline' ? 'Offline' : 'Checking...'}
                    </span>
                    {docHealthInfo?.mode && (
                       <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider ${
                        docHealthInfo?.mode === 'real_ai' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {docHealthInfo?.mode === 'real_ai' ? 'Gemini AI Active' : 'Demo Mode (No API Key)'}
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Plan Info Card - Always visible below */}
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Zap className="w-32 h-32 text-indigo-400" />
            </div>
            <div className="relative z-10">
              <div className="inline-block px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold rounded-full mb-4">
                PRO PLAN
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Langganan Aktif</h2>
              <p className="text-sm text-slate-400 mb-6 max-w-md">Anda sedang menggunakan paket Pro. Nikmati fitur AI tanpa batas untuk manajemen konstruksi yang lebih efisien.</p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-[11px] text-paax-text-secondary mb-1">AI Tokens Usage</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-lg font-bold text-white">45.2K</span>
                    <span className="text-[10px] text-slate-500 mb-1">/ 100K (Bulan ini)</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-[11px] text-paax-text-secondary mb-1">Storage Usage</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-lg font-bold text-white">2.4 GB</span>
                    <span className="text-[10px] text-slate-500 mb-1">/ 10 GB</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '24%' }}></div>
                  </div>
                </div>
              </div>

              <button className="px-4 py-2 bg-white text-indigo-900 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors">
                Upgrade Plan
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
