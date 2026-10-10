import React from 'react';

export function IconButton({ size = 44, tone = 'paper', title, onClick, children, style }) {
  const bg = { paper: 'var(--paper)', soft: 'var(--soft)', chip: 'var(--chip)', bell: 'var(--bell)' }[tone];
  const bell = tone === 'bell';
  return (
    <div role="button" title={title} onClick={onClick} style={{
      width: size, height: size, borderRadius: size >= 52 ? 18 : 16, background: bg, boxSizing: 'border-box',
      border: bell ? '2.5px solid var(--paper)' : '2.5px solid var(--ink)', boxShadow: bell ? '0 0 0 2px var(--bell-ring)' : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', fontWeight: 800,
      fontSize: Math.round(size * 0.42), color: 'var(--ink)', cursor: 'pointer', flexShrink: 0, position: 'relative', ...style }}>{children}</div>
  );
}
