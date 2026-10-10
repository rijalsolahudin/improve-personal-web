import React from 'react';

export function Checkbox({ checked = false, onChange, size = 26, color = 'var(--success)' }) {
  return (
    <div role="checkbox" aria-checked={checked} onClick={e => { e.stopPropagation(); onChange && onChange(!checked); }} style={{
      width: size, height: size, borderRadius: Math.round(size * 0.35), border: '2.5px solid var(--ink)', boxSizing: 'border-box',
      background: checked ? color : 'var(--paper)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.54), flexShrink: 0, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>{checked ? '✓' : ''}</div>
  );
}
