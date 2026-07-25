export function formatElapsedHuman(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) return `${minutes} menit ${seconds} detik`;
  if (minutes > 0) return `${minutes} menit`;
  return `${seconds} detik`;
}

export function formatRunDuration(ms: number, type: 'thought' | 'reasoned' | 'failed' | 'stopped'): string {
  const timeLabel = formatElapsedHuman(ms);
  switch (type) {
    case 'thought':
    case 'reasoned':
      return `Memproses selama ${timeLabel}`;
    case 'failed':
      return `Gagal setelah ${timeLabel}`;
    case 'stopped':
      return `Dihentikan setelah ${timeLabel}`;
    default:
      return timeLabel;
  }
}

export function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
