import type { Metadata } from 'next';
import './globals.css';
import '@/components/command-room/command-room.css';

export const metadata: Metadata = {
  title: 'PAAX AI — Civil Engineering AI Workspace',
  description: 'Platform AI untuk estimasi RAB, analisis gambar kerja, penjadwalan proyek, dan manajemen konstruksi sipil Indonesia.',
  keywords: ['RAB', 'BOQ', 'konstruksi', 'AI', 'civil engineering', 'estimasi biaya', 'gambar kerja'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
