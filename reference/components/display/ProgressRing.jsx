import React from 'react';

export function ProgressRing({ pct = 0, size = 50, thickness = 7, color = 'var(--accent)', track = 'var(--paper)', inner = 'var(--soft)', children }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'conic-gradient(' + color + ' ' + pct + '%, ' + track + ' 0)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: size - thickness * 2, height: size - thickness * 2, borderRadius: '50%', background: inner, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: Math.round(size * 0.26) }}>{children}</div>
    </div>
  );
}
