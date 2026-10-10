import React from 'react';

export function ProgressBar({ pct = 0, color = 'var(--accent)', track = 'rgba(255,255,255,.65)', height = 8 }) {
  return (
    <div style={{ height, borderRadius: 999, background: track, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 999 }} />
    </div>
  );
}
