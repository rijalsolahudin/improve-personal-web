import React from 'react';

export function TabBar({ items = [], active, onChange, onAdd }) {
  const tab = it => { const on = it.key === active; return (
    <div key={it.key} role="button" onClick={() => onChange && onChange(it.key)} style={{ height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer' }}>
      <div style={{ width: 32, height: 28, borderRadius: '10px 10px 10px 4px', background: on ? it.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, lineHeight: 1, color: on ? 'var(--ink)' : 'var(--mute)' }}>{it.glyph}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, color: on ? 'var(--ink)' : 'var(--mute)' }}>{it.label}</div>
    </div>); };
  const half = Math.ceil(items.length / 2);
  return (
    <div style={{ height: 72, background: 'var(--paper)', border: '2.5px solid var(--ink)', borderRadius: 30, boxSizing: 'border-box', display: 'grid',
      gridTemplateColumns: 'repeat(' + (items.length + 1) + ',minmax(0,1fr))', alignItems: 'center', padding: '0 4px', boxShadow: 'var(--shadow-drop)' }}>
      {items.slice(0, half).map(tab)}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div role="button" onClick={onAdd} style={{ width: 58, height: 58, marginTop: -30, borderRadius: '22px 22px 22px 8px', background: 'var(--accent)', border: '3px solid var(--ink)',
          boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper)', fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 32, lineHeight: 1, cursor: 'pointer', boxShadow: 'var(--shadow-press)' }}>+</div>
      </div>
      {items.slice(half).map(tab)}
    </div>
  );
}
