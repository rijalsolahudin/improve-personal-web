import React from 'react';

export function Toggle({ on = false, onChange, size = 'md' }) {
  const w = size === 'sm' ? 34 : 40, h = size === 'sm' ? 22 : 24, k = h - 8;
  return (
    <div role="switch" aria-checked={on} onClick={() => onChange && onChange(!on)} style={{ width: w, height: h, borderRadius: 999,
      background: on ? 'var(--accent)' : 'var(--chip)', border: '2px solid var(--ink)', boxSizing: 'border-box', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: on ? w - k - 6 : 2, width: k, height: k, borderRadius: '50%', background: 'var(--paper)',
        border: '2px solid var(--ink)', boxSizing: 'border-box', transition: 'left .2s ease' }} />
    </div>
  );
}
