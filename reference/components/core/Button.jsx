import React from 'react';

const SIZES = { sm: { minHeight: 36, fontSize: 13, padding: '0 14px' }, md: { minHeight: 44, fontSize: 15, padding: '0 20px' }, lg: { minHeight: 56, fontSize: 18, padding: '0 28px' } };
export function Button({ variant = 'primary', size = 'md', chunky = false, block = false, disabled = false, onClick, children, style }) {
  const v = {
    primary: { background: 'var(--accent)', color: 'var(--paper)', border: chunky ? '3px solid var(--ink)' : 'none' },
    outline: { background: 'var(--paper)', color: 'var(--ink)', border: '2.5px solid var(--ink)' },
    dashed: { background: 'var(--paper)', color: 'var(--ink)', border: '2.5px dashed var(--dash-2)' },
    ghost: { background: 'transparent', color: 'var(--accent)', border: 'none' },
  }[variant];
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      ...SIZES[size], ...v, boxSizing: 'border-box', borderRadius: 999, fontFamily: 'var(--font-body)', fontWeight: 800,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, width: block ? '100%' : undefined,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
      boxShadow: chunky ? 'var(--shadow-press)' : 'none', ...style }}>{children}</button>
  );
}
