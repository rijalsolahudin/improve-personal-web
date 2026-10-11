import React from 'react';

const P = { urgent: 'Urgent', medium: 'Medium', low: 'Low' };
export function PriorityBadge({ level = 'medium', label }) {
  return <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 11, padding: '1px 8px', borderRadius: 999,
    background: 'var(--prio-' + level + '-bg)', color: 'var(--prio-' + level + '-fg)', whiteSpace: 'nowrap' }}>{label || P[level]}</span>;
}
