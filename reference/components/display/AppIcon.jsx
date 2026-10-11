import React from 'react';

export function AppIcon({ glyph, color = 'var(--icon-todo)', size = 32, tilt = true }) {
  const inner = Math.round(size * 0.63);
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) + 'px ' + Math.round(size * 0.34) + 'px ' + Math.round(size * 0.34) + 'px ' + Math.round(size * 0.125) + 'px',
      background: color, boxShadow: 'var(--shadow-icon-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ width: inner, height: inner, borderRadius: Math.round(inner * 0.35), background: 'var(--paper)', border: '2px solid var(--ink)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: Math.round(size * 0.34), lineHeight: 1,
        color: 'var(--ink)', transform: tilt ? 'rotate(-6deg)' : 'none' }}>{glyph}</div>
    </div>
  );
}
