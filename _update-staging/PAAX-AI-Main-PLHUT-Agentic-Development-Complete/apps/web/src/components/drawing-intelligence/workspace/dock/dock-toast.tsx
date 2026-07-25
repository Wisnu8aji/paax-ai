'use client';

/**
 * Toast lokal sederhana khusus dock Drawing Intelligence — tidak ada
 * dependency global. Dipakai untuk aksi UI non-teknik (export/settings/dsb).
 * Tidak menyimpan/menghitung apa pun — murni umpan balik visual sementara.
 */

import { useCallback, useEffect, useState } from 'react';

interface ToastEntry {
  id: number;
  message: string;
}

let counter = 0;

export function useDockToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback((message: string) => {
    counter += 1;
    const id = counter;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  return { toasts, showToast };
}

export function DockToastHost({ toasts }: { toasts: ToastEntry[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="di-panel di-rise"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--di-text)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
