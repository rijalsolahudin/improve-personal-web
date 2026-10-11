import React from 'react';

export function Segmented({ options = [], value, onChange, framed = false, style }) {
  return (
    <div style={{ display: 'flex', background: framed ? 'var(--paper)' : 'var(--chip)', border: framed ? '2px solid var(--line)' : 'none',
      borderRadius: 999, padding: 4, gap: 4, ...style }}>
      {options.map(o => { const on = o.value === value; return (
        <div key={o.value} role="button" onClick={() => onChange && onChange(o.value)} style={{ flex: 1, minHeight: 40, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6, borderRadius: 999, fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14, cursor: 'pointer',
          background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--mute-2)' }}>
          {o.swatch && <span style={{ width: 14, height: 14, borderRadius: '50%', background: o.swatch, border: '2px solid var(--ink)', boxSizing: 'border-box' }} />}
          {o.label}
        </div>); })}
    </div>
  );
}
