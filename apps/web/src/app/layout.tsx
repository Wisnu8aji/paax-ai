import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paax-bg text-paax-text antialiased">
        {children}
      </body>
    </html>
  );
}
