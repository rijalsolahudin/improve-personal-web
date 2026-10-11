import React from 'react';

export function CountdownCard({ title, days, date, bg = 'var(--cat-karier-tint)', fg = 'var(--cat-karier-text)', layout = 'compact', pct }) {
  if (layout === 'wide') return (
    <div style={{ background: bg, borderRadius: 24, padding: 16, display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-body)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, letterSpacing: '.1em', fontSize: 11, color: fg }}>{date}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>{title}</div>
        {pct != null && <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.65)', marginTop: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: fg, borderRadius: 999 }} /></div>}
      </div>
      <div style={{ width: 82, height: 82, borderRadius: '24px 24px 24px 8px', background: 'var(--paper)', border: '2.5px solid var(--ink)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, lineHeight: 1, color: fg }}>{days}</div>
        <div style={{ fontWeight: 800, fontSize: 11, color: 'var(--mute)' }}>hari lagi</div>
      </div>
    </div>);
  return (
    <div style={{ flexShrink: 0, width: 150, padding: '12px 14px', borderRadius: 22, background: bg, boxSizing: 'border-box', fontFamily: 'var(--font-body)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: fg }}>{days}<span style={{ fontSize: 13, marginLeft: 3 }}>hari</span></div>
      <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4, lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: 12, color: fg, marginTop: 2 }}>{date}</div>
    </div>
  );
}
