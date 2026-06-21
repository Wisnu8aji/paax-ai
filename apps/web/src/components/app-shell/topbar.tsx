'use client';

import { Search, Bell, ChevronDown, Sparkles, Command } from 'lucide-react';

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-white/5" style={{ background: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(16px)' }}>
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paax-text-muted" />
          <input
            type="text"
            placeholder="Cari proyek, RAB, gambar kerja..."
            className="input-field pl-10 pr-20 py-2 text-[13px] bg-white/[0.03] border-white/[0.06]"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-paax-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">
              <Command className="w-3 h-3 inline" />
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">K</kbd>
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* AI Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 mr-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[12px] font-medium text-indigo-300">AI Ready</span>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-paax-text-muted hover:text-white hover:bg-white/[0.05] transition-all">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            5
          </span>
        </button>

        {/* User Dropdown */}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.05] transition-all ml-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-[10px] font-bold text-white">
            BA
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-paax-text-muted" />
        </button>
      </div>
    </header>
  );
}
