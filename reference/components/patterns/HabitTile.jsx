import React from 'react';

export function HabitTile({ name, color = 'var(--icon-todo)', streak = 0, done = false, onToggle }) {
  return (
    <div role="button" onClick={onToggle} style={{ flexShrink: 0, width: 104, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 22, cursor: 'pointer',
      background: done ? 'var(--success-soft)' : 'var(--paper)', border: '2px solid ' + (done ? 'var(--success-line)' : 'var(--line)'), boxSizing: 'border-box', fontFamily: 'var(--font-body)' }}>
      <div style={{ width: 38, height: 38, borderRadius: '13px 13px 13px 5px', background: done ? color : 'var(--icon-off)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--paper)', fontWeight: 800, fontSize: 17 }}>{done ? '✓' : ''}</div>
      <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{name}</div>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--mute)' }}>{streak} hari</div>
    </div>
  );
}
