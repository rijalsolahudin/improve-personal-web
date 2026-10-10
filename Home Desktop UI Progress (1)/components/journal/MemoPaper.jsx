import React from 'react';

const PAPERS = { krem: ['#FFFDF6', '#D9CDB8', '#EE9A88'], putih: ['#FFFFFF', '#DCE3EA', '#EE9A88'], pink: ['#FFF0F3', '#F2C6D0', '#E77F97'], kuning: ['#FFF8D6', '#E8D78E', '#E59A4F'],
  hijau: ['#EEF8EA', '#C3DDB8', '#E3907E'], biru: ['#EDF4FC', '#BFD3EA', '#E88C8C'], lavender: ['#F4EFFC', '#D3C6EC', '#D982A8'], malam: ['#2F3446', '#4B5370', '#C9739A'] };
export function MemoPaper({ paper = 'krem', value, onChange, placeholder = 'Dear diary, hari ini…', minHeight = 150, readOnly = false }) {
  const [bg, line, margin] = PAPERS[paper] || PAPERS.krem;
  return (
    <textarea value={value} onChange={onChange} readOnly={readOnly} placeholder={placeholder} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight,
      border: 'none', outline: 'none', resize: 'none', fontFamily: 'var(--font-hand)', fontSize: 19, lineHeight: '30px', color: paper === 'malam' ? '#F4EFE6' : 'var(--ink)',
      padding: '6px 16px 0 44px', backgroundColor: bg,
      backgroundImage: 'linear-gradient(90deg,transparent 30px,' + margin + ' 30px,' + margin + ' 32px,transparent 32px),repeating-linear-gradient(transparent 0px,transparent 29px,' + line + ' 29px,' + line + ' 30px)',
      backgroundAttachment: 'local', backgroundPosition: '0 6px' }} />
  );
}
MemoPaper.papers = Object.keys(PAPERS);
