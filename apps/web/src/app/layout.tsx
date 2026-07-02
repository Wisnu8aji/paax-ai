import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-outfit',
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
    <html lang="id" className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-paax-bg text-paax-text antialiased">
        {children}
      </body>
    </html>
  );
}
