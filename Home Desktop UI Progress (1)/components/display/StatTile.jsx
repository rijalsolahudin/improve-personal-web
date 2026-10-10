import React from 'react';

export function StatTile({ value, unit, label, tone = 'soft', icon }) {
  const bg = { soft: 'var(--soft)', paper: 'var(--paper)', primary: 'var(--primary)' }[tone] || tone;
  return (
    <div style={{ background: bg, border: tone === 'paper' ? '2.5px solid var(--line)' : 'none', borderRadius: 22, padding: tone === 'paper' ? '10px 12px' : 12, boxSizing: 'border-box', minWidth: 0 }}>
      {icon}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1, marginTop: icon ? 6 : 0, color: tone === 'soft' ? 'var(--ink)' : 'var(--deeper)' }}>
        {value}{unit && <span style={{ fontSize: 13, marginLeft: 2 }}>{unit}</span>}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, color: 'var(--deep)', marginTop: 2, lineHeight: 1.2 }}>{label}</div>
    </div>
  );
}
