import React from 'react';

export function Chip({ active = false, variant = 'filter', onClick, children, style }) {
  const filter = variant === 'filter';
  const s = filter
    ? { minHeight: 38, padding: '0 14px', fontSize: 14, background: active ? 'var(--accent)' : 'var(--paper)', color: active ? 'var(--paper)' : 'var(--mute-2)', border: '2.5px solid ' + (active ? 'var(--ink)' : 'var(--line)') }
    : { minHeight: 36, padding: '0 12px', fontSize: 13, background: active ? 'var(--ink)' : 'var(--alt)', color: active ? 'var(--paper)' : 'var(--ink)', border: 'none' };
  return (
    <div role="button" onClick={onClick} style={{ ...s, flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 999,
      fontFamily: 'var(--font-body)', fontWeight: 800, boxSizing: 'border-box', whiteSpace: 'nowrap', cursor: 'pointer', ...style }}>{children}</div>
  );
}
