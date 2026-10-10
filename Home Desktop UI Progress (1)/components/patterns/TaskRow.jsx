import React from 'react';

import { Checkbox } from '../core/Checkbox.jsx';
import { PriorityBadge } from '../core/PriorityBadge.jsx';
export function TaskRow({ title, priority = 'medium', meta, done = false, overdue = false, variant = 'inset', onToggle, onRemove }) {
  const card = variant === 'card';
  return (
    <div onClick={card ? undefined : onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: card ? 60 : 52, padding: card ? '8px 12px' : '6px 12px',
      borderRadius: card ? 18 : 16, background: card ? 'var(--paper)' : 'var(--alt)', border: card ? '2px solid var(--line)' : 'none', boxSizing: 'border-box', cursor: card ? undefined : 'pointer' }}>
      <Checkbox checked={done} size={card ? 28 : 26} onChange={onToggle} />
      <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1, whiteSpace: card ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25 }}>{title}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <PriorityBadge level={priority} />
          {meta && <span style={{ fontWeight: 700, fontSize: 12, color: overdue && !done ? 'var(--danger)' : 'var(--mute)' }}>{done ? 'Selesai' : meta}</span>}
        </div>
      </div>
      {onRemove && <div role="button" onClick={onRemove} style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute-3)', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>×</div>}
    </div>
  );
}
