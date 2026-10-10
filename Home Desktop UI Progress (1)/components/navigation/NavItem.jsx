import React from 'react';

import { AppIcon } from '../display/AppIcon.jsx';
export function NavItem({ glyph, color, label, active = false, collapsed = false, onClick }) {
  return (
    <div role="button" title={label} onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 12,
      padding: collapsed ? 6 : '6px 14px 6px 8px', borderRadius: 999, fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, cursor: 'pointer',
      background: active ? 'var(--soft)' : 'transparent', whiteSpace: 'nowrap' }}>
      <AppIcon glyph={glyph} color={color} />
      {!collapsed && <span>{label}</span>}
    </div>
  );
}
