'use client';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { ObservabilityDashboard } from '@/components/projects/observability-dashboard';
export default function ObservabilityPage() { const params = useParams(); return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><PageHeader title="Observability Proyek" subtitle="Ringkasan telemetry tersimpan; tidak memuat konten atau prompt." /><ObservabilityDashboard projectId={params.projectId as string} /></div>; }
