'use client';

import { CloudSun, Users, Plus } from 'lucide-react';
import { Card, Button, StatusPill, ProgressBar, PageHeader } from '@/components/ui';
import { siteLogs } from '@/lib/mock/workspace';

export default function ProjectSiteAgentPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        title="Site Agent"
        subtitle="Catatan harian lapangan & progres"
        actions={
          <Button>
            <Plus size={15} /> Laporan Harian
          </Button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {siteLogs.map((log) => (
          <Card key={log.date} padding={16}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span className="pax-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{log.date}</span>
                  <StatusPill tone="neutral"><CloudSun size={12} /> {log.weather}</StatusPill>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>{log.summary}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text2)' }}>
                  <Users size={13} /> {log.manpower} pekerja
                </div>
              </div>
              <div style={{ width: 160 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>Progress</span>
                  <span className="pax-mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{log.progress}%</span>
                </div>
                <ProgressBar value={log.progress} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — laporan lapangan belum tersambung ke backend.</p>
    </div>
  );
}
