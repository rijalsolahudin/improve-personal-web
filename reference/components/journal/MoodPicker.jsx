import React from 'react';

const MOODS = [['😢', 'Sedih', '#D6E4F5'], ['😕', 'Kurang', '#E6DDF5'], ['😐', 'Biasa', '#F2E4CC'], ['🙂', 'Senang', '#FFE7A8'], ['😄', 'Mantap', '#FFD3BC']];
export function MoodPicker({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6 }}>
      {MOODS.map(([e, label, c], i) => { const on = value === i; return (
        <div key={i} role="button" onClick={() => onChange && onChange(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 2px 6px',
          borderRadius: '16px 16px 16px 6px', cursor: 'pointer', background: on ? c : 'var(--paper)', border: '2.5px solid ' + (on ? 'var(--ink)' : 'var(--line)'), transform: on ? 'rotate(-3deg)' : 'none' }}>
          <div style={{ fontSize: on ? 26 : 22, lineHeight: 1 }}>{e}</div>
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 13, lineHeight: 1.1 }}>{label}</div>
        </div>); })}
    </div>
  );
}
