import React from 'react';

export function Tape({ color = 'var(--primary)', width = 80, rotate = -4, style }) {
  return <div style={{ position: 'absolute', top: -12, left: 24, width, height: 22, background: color, opacity: 0.8, borderRadius: 3, transform: 'rotate(' + rotate + 'deg)', ...style }} />;
}
