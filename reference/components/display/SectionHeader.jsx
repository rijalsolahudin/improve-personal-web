import React from 'react';

export function SectionHeader({ title, action, onAction, eyebrow }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
      <div>
        {eyebrow && <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, letterSpacing: '.1em', color: 'var(--deep)' }}>{eyebrow}</div>}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>{title}</div>
      </div>
      {action && <div role="button" onClick={onAction} style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 13, color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>{action}</div>}
    </div>
  );
}
