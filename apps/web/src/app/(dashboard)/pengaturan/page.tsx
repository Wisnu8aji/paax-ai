'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useShell } from '@/components/app-shell/shell-context';

/**
 * Pengaturan kini SATU pintu: dialog terpusat (gear di rail).
 * Route ini dipertahankan hanya agar bookmark lama tidak 404 —
 * langsung membuka dialog pengaturan di atas Dashboard.
 */
export default function PengaturanRedirect() {
  const router = useRouter();
  const { openSettings } = useShell();

  useEffect(() => {
    router.replace('/dashboard');
    openSettings('umum');
  }, [router, openSettings]);

  return null;
}
