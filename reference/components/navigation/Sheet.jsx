import React from 'react';

export function Sheet({ open = true, onClose, title, children }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--scrim)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 31, maxHeight: '70%', overflowY: 'auto', background: 'var(--paper)', borderTop: '3px solid var(--ink)',
        borderRadius: '32px 32px 0 0', padding: '12px 18px 40px', boxSizing: 'border-box' }}>
        <div style={{ width: 44, height: 5, borderRadius: 999, background: 'var(--dash)', margin: '0 auto 14px' }} />
        {title && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, marginBottom: 12 }}>{title}</div>}
        {children}
      </div>
    </>
  );
}
