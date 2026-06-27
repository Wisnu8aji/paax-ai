import type { Metadata } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-hanken',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

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
    <html lang="id" className={`${hanken.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-paax-bg text-paax-text antialiased">
        {children}
      </body>
    </html>
  );
}
