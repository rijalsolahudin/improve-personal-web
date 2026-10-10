import React from 'react';

export function Card({ variant = 'paper', tint, padding, radius, dotted = false, onClick, children, style }) {
  const base = {
    paper: { background: 'var(--paper)', border: '2px solid var(--line)', borderRadius: 24, padding: 16 },
    soft: { background: 'var(--soft)', borderRadius: 22, padding: 12 },
    primary: { background: 'var(--primary)', borderRadius: 24, padding: '14px 16px' },
    tinted: { background: tint || 'var(--cat-karier-tint)', borderRadius: 24, padding: '14px 16px' },
    sticker: { background: 'var(--paper-2)', border: '3px solid var(--ink)', borderRadius: 26, padding: 16, boxShadow: 'var(--shadow-drop-sm)' },
  }[variant];
  return (
    <section onClick={onClick} style={{ ...base, position: 'relative', boxSizing: 'border-box', cursor: onClick ? 'pointer' : undefined,
      ...(dotted ? { backgroundImage: 'var(--pattern-dots)', backgroundSize: '18px 18px' } : null),
      ...(padding != null ? { padding } : null), ...(radius != null ? { borderRadius: radius } : null), ...style }}>{children}</section>
  );
}
