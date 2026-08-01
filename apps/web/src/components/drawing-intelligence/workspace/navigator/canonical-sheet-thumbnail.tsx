'use client';

import { useEffect, useState } from 'react';
import { resolveCanonicalThumbnailUrl } from '../sheet-thumbnail-resolver';

export interface CanonicalSheetThumbnailProps {
  runId?: string | null;
  pageIndex?: number | null;
  rawUrl?: string | null;
  alt: string;
  width?: number;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function CanonicalSheetThumbnail({
  runId,
  pageIndex,
  rawUrl,
  alt,
  width = 320,
  height = 92,
  style,
  className,
  onLoad,
}: CanonicalSheetThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const canonicalUrl = resolveCanonicalThumbnailUrl({ runId, pageIndex, rawUrl, width });

  // Reset error state automatically whenever canonical URL changes
  useEffect(() => {
    setImageError(false);
    setRetryKey(0);
  }, [canonicalUrl]);

  if (!canonicalUrl || imageError) {
    return (
      <div
        role="img"
        aria-label="Gambar sheet tidak tersedia"
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: typeof height === 'number' ? `${height}px` : height,
          padding: 8,
          background: 'var(--di-paper)',
          color: 'var(--di-text2)',
          fontSize: 10.5,
          textAlign: 'center',
          boxSizing: 'border-box',
          ...style,
        }}
      >
        <span>Gambar sheet tidak dapat dimuat</span>
        {canonicalUrl && (
          <button
            type="button"
            className="di-btn di-btn-ghost"
            style={{ height: 20, fontSize: 10, padding: '0 8px' }}
            onClick={(e) => {
              e.stopPropagation();
              setImageError(false);
              setRetryKey((k) => (k < 3 ? k + 1 : k));
            }}
          >
            Coba lagi
          </button>
        )}
      </div>
    );
  }

  const effectiveUrl = retryKey > 0 ? `${canonicalUrl}${canonicalUrl.includes('?') ? '&' : '?'}_r=${retryKey}` : canonicalUrl;

  return (
    <img
      src={effectiveUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        objectFit: 'contain',
        background: 'var(--di-paper)',
        ...style,
      }}
      onLoad={(e) => {
        setImageError(false);
        onLoad?.(e);
      }}
      onError={() => {
        setImageError(true);
      }}
    />
  );
}
