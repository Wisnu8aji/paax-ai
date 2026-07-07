'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquarePlus,
  Search,
  CalendarClock,
  History,
  MessageSquare,
  ChevronDown,
  Filter,
  CheckCircle2,
  FolderKanban,
  FileImage,
  Calculator,
  HardHat,
  Database,
  FileSpreadsheet,
  Users
} from 'lucide-react';
import { PaaxLogoBox, PaaxWordmark } from '@/components/brand/paax-logo';
import { useShell } from './shell-context';
import { currentUser } from '@/lib/mock/workspace';

type TabType = 'home' | 'project';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { openSettings } = useShell();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [filterOpen, setFilterOpen] = useState(false);

  // Tab switcher
  const TabButton = ({ type, label }: { type: TabType; label: string }) => (
    <button
      onClick={() => setActiveTab(type)}
      style={{
        flex: 1,
        padding: '6px 0',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: activeTab === type ? 600 : 500,
        color: activeTab === type ? 'var(--side-active-ink)' : 'var(--side-muted)',
        background: activeTab === type ? 'var(--side-active-bg)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {label}
    </button>
  );

  const navItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--side-text)',
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  };

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: 'var(--side-bg)',
        borderRight: '1px solid var(--side-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Header & Logo */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <PaaxLogoBox size={32} radius={8} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--side-text)' }}>
          <PaaxWordmark height={12} />
          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--side-muted)', letterSpacing: '0.1em' }}>
            WORKSPACE
          </span>
        </span>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 10 }}>
          <TabButton type="home" label="Home" />
          <TabButton type="project" label="Project" />
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Link href="/dashboard" className="pax-nav-item" style={navItemStyle}>
                <MessageSquarePlus size={18} /> New Chat
              </Link>
              <Link href="#" className="pax-nav-item" style={navItemStyle}>
                <Search size={18} /> Search
              </Link>
              <Link href="/schedule" className="pax-nav-item" style={navItemStyle}>
                <CalendarClock size={18} /> Schedule Task
              </Link>
              <Link href="#" className="pax-nav-item" style={navItemStyle}>
                <History size={18} /> Conversation History
              </Link>

              <div style={{ marginTop: 24, marginBottom: 8, padding: '0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--side-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Conversation
                </span>
                <button onClick={() => setFilterOpen(!filterOpen)} style={{ background: 'none', border: 'none', color: 'var(--side-muted)', cursor: 'pointer' }}>
                  <Filter size={14} />
                </button>
              </div>

              {/* Dummy Conversations */}
              {[1, 2, 3].map((i) => (
                <Link key={i} href={`/chat/${i}`} className="pax-nav-item" style={{ ...navItemStyle, padding: '8px 12px' }}>
                  <MessageSquare size={16} color="var(--side-muted)" />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Draft RAB Proyek {i}...
                  </span>
                </Link>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="project"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Link href="/proyek" className="pax-nav-item" style={navItemStyle}>
                <FolderKanban size={18} /> All Projects
              </Link>
              
              <div style={{ marginTop: 16, marginBottom: 8, padding: '0 12px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--side-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tools & Modules
                </span>
              </div>
              <Link href="/database-ahsp" className="pax-nav-item" style={navItemStyle}>
                <Database size={18} /> Database AHSP
              </Link>
              <Link href="/laporan" className="pax-nav-item" style={navItemStyle}>
                <FileSpreadsheet size={18} /> Laporan & Export
              </Link>
              <Link href="/kolaborasi" className="pax-nav-item" style={navItemStyle}>
                <Users size={18} /> Kolaborasi
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Profile Footer */}
      <div style={{ padding: 16, borderTop: '1px solid var(--side-border)' }}>
        <button
          onClick={() => openSettings('akun')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--side-active-bg)', color: 'var(--side-active-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13
          }}>
            {currentUser.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--side-text)' }}>{currentUser.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 500 }}>Pro Plan</div>
          </div>
          <ChevronDown size={16} color="var(--side-muted)" />
        </button>
      </div>
    </aside>
  );
}
