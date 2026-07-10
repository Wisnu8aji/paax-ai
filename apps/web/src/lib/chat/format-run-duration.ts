export function formatRunDuration(ms: number, type: 'thought' | 'reasoned' | 'failed' | 'stopped'): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  
  let timeLabel = '';
  if (m > 0 && s > 0) {
    timeLabel = `${m} minute${m > 1 ? 's' : ''} ${s} second${s !== 1 ? 's' : ''}`;
  } else if (m > 0) {
    timeLabel = `${m} minute${m > 1 ? 's' : ''}`;
  } else {
    timeLabel = `${s} second${s !== 1 ? 's' : ''}`;
  }

  switch (type) {
    case 'thought':
      return `Thought for ${timeLabel}.`;
    case 'reasoned':
      return `Reasoned for ${timeLabel}.`;
    case 'failed':
      return `Failed after ${timeLabel}.`;
    case 'stopped':
      return `Stopped after ${timeLabel}.`;
    default:
      return `${timeLabel}`;
  }
}

export function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  
  return `${mm}:${ss}`;
}
