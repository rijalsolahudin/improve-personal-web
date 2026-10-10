// Maskot tambahan khusus katalog sticker (Mascot.dc.html, disalin 1:1 lewat script).
// Terpisah dari utils/mascots.ts supaya tidak ikut bundle halaman yang tidak memakai sticker.

import type { MascotPart } from './mascots'

export const STICKER_MASCOTS = {
  panda: [
    {
      style:
        'left:12px;top:22px;width:28px;height:28px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:60px;top:22px;width:28px;height:28px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:12px;top:34px;width:76px;height:62px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #EDE3D3;overflow:hidden',
    },
    { style: 'left:38px;top:68px;width:24px;height:14px;background:#EDE3D3;border-radius:50%' },
  ],
  koala: [
    {
      style:
        'left:0px;top:24px;width:38px;height:38px;background:#B9B4AE;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:8px;top:8px;width:16px;height:16px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:62px;top:24px;width:38px;height:38px;background:#B9B4AE;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:8px;top:8px;width:16px;height:16px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:36px;width:76px;height:60px;background:#C9C4BE;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #B0AAA3;overflow:hidden',
    },
    { style: 'left:42px;top:60px;width:16px;height:22px;background:#6E6862;border-radius:45%' },
  ],
  pinguin: [
    {
      style:
        'left:16px;top:10px;width:68px;height:84px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50% 50% 44% 44%;overflow:hidden',
      children: [
        { style: 'left:12px;top:22px;width:38px;height:56px;background:#FFFBF4;border-radius:50%' },
      ],
    },
    {
      style:
        'left:22px;top:86px;width:22px;height:12px;background:#F5A23C;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:56px;top:86px;width:22px;height:12px;background:#F5A23C;border:3px solid #2F2A24;border-radius:50%',
    },
  ],
  katak: [
    {
      style:
        'left:16px;top:20px;width:28px;height:28px;background:#8FCB6B;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:56px;top:20px;width:28px;height:28px;background:#8FCB6B;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:12px;top:36px;width:76px;height:60px;background:#8FCB6B;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #74B052;overflow:hidden;border-radius:50% 50% 44% 44% / 60% 60% 40% 40%',
    },
  ],
  babi: [
    {
      style:
        'left:16px;top:24px;width:24px;height:24px;background:#F9B8C4;border:3px solid #2F2A24;border-radius:6px 20px 6px 6px;transform:rotate(-14deg)',
    },
    {
      style:
        'left:60px;top:24px;width:24px;height:24px;background:#F9B8C4;border:3px solid #2F2A24;border-radius:20px 6px 6px 6px;transform:rotate(14deg)',
    },
    {
      style:
        'left:12px;top:34px;width:76px;height:62px;background:#F9B8C4;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #EE9DAC;overflow:hidden',
    },
    {
      style:
        'left:36px;top:62px;width:28px;height:20px;background:#F48FA3;border:3px solid #2F2A24;border-radius:50%',
    },
  ],
  sapi: [
    {
      style:
        'left:20px;top:18px;width:12px;height:18px;background:#F2E4CC;border:3px solid #2F2A24;border-radius:50% 50% 30% 30%;transform:rotate(-20deg)',
    },
    {
      style:
        'left:68px;top:18px;width:12px;height:18px;background:#F2E4CC;border:3px solid #2F2A24;border-radius:50% 50% 30% 30%;transform:rotate(20deg)',
    },
    {
      style:
        'left:2px;top:40px;width:24px;height:16px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%;transform:rotate(-20deg)',
    },
    {
      style:
        'left:74px;top:40px;width:24px;height:16px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%;transform:rotate(20deg)',
    },
    {
      style:
        'left:12px;top:30px;width:76px;height:66px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #EDE3D3;overflow:hidden',
      children: [
        {
          style:
            'left:44px;top:4px;width:22px;height:18px;background:#5B4636;border-radius:50% 40% 60% 45%',
        },
        { style: 'left:4px;top:20px;width:16px;height:14px;background:#5B4636;border-radius:50%' },
      ],
    },
    {
      style:
        'left:26px;top:68px;width:48px;height:26px;background:#F9C9D6;border:3px solid #2F2A24;border-radius:50%',
    },
  ],
  domba: [
    {
      style:
        'left:4px;top:44px;width:20px;height:14px;background:#4E4540;border:3px solid #2F2A24;border-radius:50%;transform:rotate(-20deg)',
    },
    {
      style:
        'left:76px;top:44px;width:20px;height:14px;background:#4E4540;border:3px solid #2F2A24;border-radius:50%;transform:rotate(20deg)',
    },
    {
      style:
        'left:14px;top:16px;width:30px;height:30px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:36px;top:10px;width:30px;height:30px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:58px;top:16px;width:30px;height:30px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:20px;top:36px;width:60px;height:60px;background:#6B5A4C;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -5px -5px 0 #574839',
    },
    {
      style:
        'left:28px;top:28px;width:44px;height:22px;background:#FFFBF4;border:3px solid #2F2A24;border-radius:50%;border-top-color:transparent',
    },
  ],
  singa: [
    {
      style:
        'left:4px;top:18px;width:92px;height:82px;background:#D9822F;border:3px solid #2F2A24;border-radius:50%;box-shadow:inset -6px -6px 0 #BF6C20',
    },
    {
      style:
        'left:20px;top:32px;width:60px;height:60px;background:#F5C26B;border:3px solid #2F2A24;border-radius:50%;box-shadow:inset -5px -5px 0 #E2A84D',
    },
    {
      style:
        'left:22px;top:26px;width:18px;height:16px;background:#F5C26B;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:60px;top:26px;width:18px;height:16px;background:#F5C26B;border:3px solid #2F2A24;border-radius:50%',
    },
  ],
  harimau: [
    {
      style:
        'left:14px;top:22px;width:26px;height:26px;background:#F08A3C;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#2F2A24;border-radius:50%' },
      ],
    },
    {
      style:
        'left:60px;top:22px;width:26px;height:26px;background:#F08A3C;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#2F2A24;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:34px;width:76px;height:62px;background:#F08A3C;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #D8722A;overflow:hidden',
      children: [
        {
          style:
            'left:34px;top:0px;width:8px;height:16px;background:#2F2A24;border-radius:0 0 6px 6px',
        },
        {
          style:
            'left:20px;top:2px;width:6px;height:12px;background:#2F2A24;border-radius:0 0 6px 6px',
        },
        {
          style:
            'left:50px;top:2px;width:6px;height:12px;background:#2F2A24;border-radius:0 0 6px 6px',
        },
        { style: 'left:-4px;top:28px;width:18px;height:6px;background:#2F2A24;border-radius:6px' },
        { style: 'left:56px;top:28px;width:18px;height:6px;background:#2F2A24;border-radius:6px' },
        { style: 'left:14px;top:42px;width:44px;height:22px;background:#FFFBF4;border-radius:50%' },
      ],
    },
  ],
  'burung-hantu': [
    {
      style:
        'left:16px;top:14px;width:20px;height:24px;background:#8B5E3C;border:3px solid #2F2A24;border-radius:4px 20px 4px 4px;transform:rotate(-20deg)',
    },
    {
      style:
        'left:64px;top:14px;width:20px;height:24px;background:#8B5E3C;border:3px solid #2F2A24;border-radius:20px 4px 4px 4px;transform:rotate(20deg)',
    },
    {
      style:
        'left:14px;top:22px;width:72px;height:76px;background:#A8774A;border:3px solid #2F2A24;border-radius:50% 50% 44% 44%;overflow:hidden;box-shadow:inset -6px -6px 0 #8B5E3C',
      children: [
        { style: 'left:16px;top:34px;width:40px;height:40px;background:#E9CDA8;border-radius:50%' },
      ],
    },
    {
      style:
        'left:44px;top:48px;width:12px;height:12px;background:#F5A23C;border:3px solid #2F2A24;border-radius:2px 2px 50% 50%;transform:rotate(45deg)',
    },
  ],
  gajah: [
    {
      style:
        'left:0px;top:30px;width:40px;height:48px;background:#A9B4C2;border:3px solid #2F2A24;border-radius:50% 40% 50% 50%',
      children: [
        { style: 'left:8px;top:10px;width:20px;height:26px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:60px;top:30px;width:40px;height:48px;background:#A9B4C2;border:3px solid #2F2A24;border-radius:40% 50% 50% 50%',
      children: [
        { style: 'left:12px;top:10px;width:20px;height:26px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:28px;width:76px;height:68px;background:#BCC6D2;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #A2ADBB;overflow:hidden',
    },
    {
      style:
        'left:40px;top:64px;width:20px;height:34px;background:#BCC6D2;border:3px solid #2F2A24;border-radius:10px 10px 14px 14px',
    },
  ],
  hamster: [
    {
      style:
        'left:18px;top:26px;width:22px;height:22px;background:#E8A869;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:5px;top:5px;width:9px;height:9px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:60px;top:26px;width:22px;height:22px;background:#E8A869;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:5px;top:5px;width:9px;height:9px;background:#F9C9D6;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:36px;width:76px;height:60px;background:#F2C48D;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #E2AC70;overflow:hidden;border-radius:50%',
      children: [
        { style: 'left:16px;top:26px;width:44px;height:36px;background:#FFF1DC;border-radius:50%' },
      ],
    },
  ],
  monyet: [
    {
      style:
        'left:2px;top:44px;width:24px;height:24px;background:#E9CDA8;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:74px;top:44px;width:24px;height:24px;background:#E9CDA8;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:12px;top:28px;width:76px;height:68px;background:#9C6B45;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #83583A;overflow:hidden',
    },
    {
      style:
        'left:26px;top:48px;width:48px;height:44px;background:#E9CDA8;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%',
    },
  ],
  'kura-kura': [
    {
      style:
        'left:4px;top:58px;width:20px;height:16px;background:#9AD07E;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:14px;top:80px;width:18px;height:16px;background:#9AD07E;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:68px;top:80px;width:18px;height:16px;background:#9AD07E;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:14px;top:32px;width:72px;height:56px;background:#5FA35A;border:3px solid #2F2A24;border-radius:50% 50% 12px 12px;overflow:hidden;box-shadow:inset -5px -5px 0 #4C8A48',
      children: [
        { style: 'left:22px;top:8px;width:26px;height:22px;background:#8CC47A;border-radius:40%' },
        { style: 'left:2px;top:26px;width:20px;height:18px;background:#8CC47A;border-radius:40%' },
        { style: 'left:48px;top:26px;width:20px;height:18px;background:#8CC47A;border-radius:40%' },
      ],
    },
  ],
  paus: [
    {
      style:
        'left:66px;top:30px;width:30px;height:26px;background:#6FA3E0;border:3px solid #2F2A24;border-radius:60% 10px 60% 10px;transform:rotate(-20deg)',
    },
    {
      style:
        'left:4px;top:40px;width:74px;height:52px;background:#6FA3E0;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;overflow:hidden;box-shadow:inset -5px -5px 0 #5A8CCB',
      children: [
        { style: 'left:8px;top:30px;width:58px;height:22px;background:#DDE7FB;border-radius:50%' },
      ],
    },
    { style: 'left:36px;top:12px;width:6px;height:20px;background:#9CC9EE;border-radius:4px' },
    { style: 'left:26px;top:6px;width:10px;height:10px;background:#9CC9EE;border-radius:50%' },
    { style: 'left:42px;top:4px;width:10px;height:10px;background:#9CC9EE;border-radius:50%' },
  ],
  gurita: [
    {
      style:
        'left:14px;top:74px;width:16px;height:24px;background:#B48DE0;border:3px solid #2F2A24;border-radius:8px 8px 10px 10px',
    },
    {
      style:
        'left:32px;top:78px;width:16px;height:22px;background:#B48DE0;border:3px solid #2F2A24;border-radius:8px 8px 10px 10px',
    },
    {
      style:
        'left:52px;top:78px;width:16px;height:22px;background:#B48DE0;border:3px solid #2F2A24;border-radius:8px 8px 10px 10px',
    },
    {
      style:
        'left:70px;top:74px;width:16px;height:24px;background:#B48DE0;border:3px solid #2F2A24;border-radius:8px 8px 10px 10px',
    },
    {
      style:
        'left:14px;top:14px;width:72px;height:70px;background:#B48DE0;border:3px solid #2F2A24;border-radius:50% 50% 40% 40%;box-shadow:inset -6px -6px 0 #9A72CA',
      children: [
        { style: 'left:44px;top:14px;width:10px;height:10px;background:#D6C2F0;border-radius:50%' },
        { style: 'left:54px;top:28px;width:7px;height:7px;background:#D6C2F0;border-radius:50%' },
      ],
    },
  ],
  ikan: [
    {
      style:
        'left:66px;top:32px;width:30px;height:40px;background:#F5A23C;border:3px solid #2F2A24;border-radius:10px 50% 50% 10px;transform:rotate(0deg)',
    },
    {
      style:
        'left:4px;top:26px;width:72px;height:52px;background:#FFC567;border:3px solid #2F2A24;border-radius:50%;overflow:hidden;box-shadow:inset -5px -5px 0 #F0A93E',
      children: [
        { style: 'left:30px;top:0px;width:8px;height:52px;background:#F08A3C;border-radius:4px' },
        { style: 'left:46px;top:0px;width:8px;height:52px;background:#F08A3C;border-radius:4px' },
      ],
    },
    {
      style:
        'left:28px;top:14px;width:26px;height:18px;background:#F5A23C;border:3px solid #2F2A24;border-radius:50% 50% 0 0',
    },
  ],
  serigala: [
    {
      style:
        'left:14px;top:10px;width:26px;height:40px;background:#7C8796;border:3px solid #2F2A24;border-radius:4px 26px 4px 4px;transform:rotate(-16deg) skew(12deg)',
      children: [
        {
          style:
            'left:6px;top:10px;width:10px;height:22px;background:#4A5260;border-radius:2px 10px 2px 2px',
        },
      ],
    },
    {
      style:
        'left:60px;top:10px;width:26px;height:40px;background:#7C8796;border:3px solid #2F2A24;border-radius:26px 4px 4px 4px;transform:rotate(16deg) skew(-12deg)',
      children: [
        {
          style:
            'left:6px;top:10px;width:10px;height:22px;background:#4A5260;border-radius:10px 2px 2px 2px',
        },
      ],
    },
    {
      style:
        'left:12px;top:34px;width:76px;height:62px;background:#7C8796;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #646E7C;overflow:hidden',
      children: [
        {
          style:
            'left:14px;top:34px;width:48px;height:40px;background:#C9CFD8;border-radius:50% 50% 40% 40%',
        },
        {
          style:
            'left:30px;top:-2px;width:16px;height:22px;background:#4A5260;border-radius:0 0 8px 8px',
        },
      ],
    },
  ],
  'singa-jantan': [
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(0deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(45deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(90deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(135deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(180deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(225deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(270deg)',
    },
    {
      style:
        'left:36px;top:4px;width:28px;height:40px;background:#8E3E1C;border:3px solid #2F2A24;border-radius:50% 50% 6px 6px;transform-origin:14px 46px;transform:rotate(315deg)',
    },
    {
      style:
        'left:6px;top:14px;width:88px;height:84px;background:#B5532A;border:3px solid #2F2A24;border-radius:50%;box-shadow:inset -6px -6px 0 #8E3E1C',
    },
    {
      style:
        'left:22px;top:30px;width:56px;height:58px;background:#E8A84D;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;overflow:hidden;box-shadow:inset -5px -5px 0 #CF8E35',
      children: [
        {
          style:
            'left:18px;top:-2px;width:20px;height:28px;background:#CF8E35;border-radius:0 0 10px 10px',
        },
      ],
    },
  ],
  naga: [
    {
      style:
        'left:20px;top:0px;width:16px;height:26px;background:#E2513B;border:3px solid #2F2A24;border-radius:50% 50% 4px 4px / 90% 90% 4px 4px;transform:rotate(-24deg)',
    },
    {
      style:
        'left:42px;top:-4px;width:16px;height:26px;background:#E2513B;border:3px solid #2F2A24;border-radius:50% 50% 4px 4px / 90% 90% 4px 4px;transform:rotate(0deg)',
    },
    {
      style:
        'left:64px;top:0px;width:16px;height:26px;background:#E2513B;border:3px solid #2F2A24;border-radius:50% 50% 4px 4px / 90% 90% 4px 4px;transform:rotate(24deg)',
    },
    {
      style:
        'left:4px;top:34px;width:22px;height:20px;background:#F5C26B;border:3px solid #2F2A24;border-radius:50% 10px 50% 10px;transform:rotate(-20deg)',
    },
    {
      style:
        'left:74px;top:34px;width:22px;height:20px;background:#F5C26B;border:3px solid #2F2A24;border-radius:10px 50% 10px 50%;transform:rotate(20deg)',
    },
    {
      style:
        'left:10px;top:20px;width:80px;height:78px;background:#4DAF7C;border:3px solid #2F2A24;border-radius:46% 46% 40% 40%;overflow:hidden;box-shadow:inset -7px -7px 0 #3A9264',
      children: [
        {
          style:
            'left:14px;top:46px;width:52px;height:34px;background:#B8E3A6;border-radius:50% 50% 40% 40%',
        },
      ],
    },
    {
      style:
        'left:22px;top:6px;width:14px;height:22px;background:#FFF1DC;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px;transform:rotate(-30deg)',
    },
    {
      style:
        'left:64px;top:6px;width:14px;height:22px;background:#FFF1DC;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px;transform:rotate(30deg)',
    },
  ],
  banteng: [
    {
      style:
        'left:-2px;top:14px;width:34px;height:18px;background:#FFF1DC;border:3px solid #2F2A24;border-radius:100% 0 0 100%;transform:rotate(30deg)',
    },
    {
      style:
        'left:68px;top:14px;width:34px;height:18px;background:#FFF1DC;border:3px solid #2F2A24;border-radius:0 100% 100% 0;transform:rotate(-30deg)',
    },
    {
      style:
        'left:4px;top:38px;width:22px;height:16px;background:#5B3A26;border:3px solid #2F2A24;border-radius:50%;transform:rotate(-20deg)',
    },
    {
      style:
        'left:74px;top:38px;width:22px;height:16px;background:#5B3A26;border:3px solid #2F2A24;border-radius:50%;transform:rotate(20deg)',
    },
    {
      style:
        'left:12px;top:24px;width:76px;height:72px;background:#6E4630;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #563624;overflow:hidden',
      children: [
        { style: 'left:14px;top:40px;width:48px;height:30px;background:#9C6B4D;border-radius:50%' },
        {
          style:
            'left:30px;top:0px;width:16px;height:14px;background:#3E2618;border-radius:0 0 50% 50%',
        },
      ],
    },
    {
      style:
        'left:43px;top:82px;width:14px;height:14px;border:3.5px solid #E2A84D;border-radius:50%',
    },
  ],
  hiu: [
    {
      style:
        'left:38px;top:0px;width:28px;height:36px;background:#6F8FB0;border:3px solid #2F2A24;border-radius:80% 10% 4px 4px;transform:rotate(8deg)',
    },
    {
      style:
        'left:4px;top:26px;width:92px;height:70px;background:#7C9CBE;border:3px solid #2F2A24;border-radius:50% 50% 44% 44%;overflow:hidden;box-shadow:inset -6px -6px 0 #607F9F',
      children: [
        { style: 'left:10px;top:34px;width:72px;height:36px;background:#E7EEF6;border-radius:50%' },
        {
          style:
            'left:14px;top:40px;width:64px;height:10px;background:#FFFBF4;border-radius:0;clip-path:polygon(0.0% 0,8.3% 100%,16.7% 0,25.0% 100%,33.3% 0,41.7% 100%,50.0% 0,58.3% 100%,66.7% 0,75.0% 100%,83.3% 0,91.7% 100%,100.0% 0)',
        },
      ],
    },
  ],
  buaya: [
    {
      style:
        'left:16px;top:6px;width:16px;height:18px;background:#3F8150;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px',
    },
    {
      style:
        'left:34px;top:10px;width:16px;height:18px;background:#3F8150;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px',
    },
    {
      style:
        'left:52px;top:6px;width:16px;height:18px;background:#3F8150;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px',
    },
    {
      style:
        'left:70px;top:10px;width:16px;height:18px;background:#3F8150;border:3px solid #2F2A24;border-radius:50% 50% 3px 3px / 90% 90% 3px 3px',
    },
    {
      style:
        'left:4px;top:22px;width:92px;height:76px;background:#5A9E64;border:3px solid #2F2A24;border-radius:40% 40% 30% 30%;overflow:hidden;box-shadow:inset -6px -6px 0 #457F4E',
      children: [
        { style: 'left:8px;top:40px;width:76px;height:26px;background:#A9D49A;border-radius:40%' },
        {
          style:
            'left:14px;top:34px;width:64px;height:10px;background:#FFFBF4;border-radius:0;clip-path:polygon(0.0% 0,7.1% 100%,14.3% 0,21.4% 100%,28.6% 0,35.7% 100%,42.9% 0,50.0% 100%,57.1% 0,64.3% 100%,71.4% 0,78.6% 100%,85.7% 0,92.9% 100%,100.0% 0)',
        },
      ],
    },
  ],
  'macan-tutul': [
    {
      style:
        'left:14px;top:22px;width:24px;height:24px;background:#E8B04A;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:5px;top:5px;width:8px;height:8px;background:#2F2A24;border-radius:50%' },
      ],
    },
    {
      style:
        'left:62px;top:22px;width:24px;height:24px;background:#E8B04A;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:5px;top:5px;width:8px;height:8px;background:#2F2A24;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:34px;width:76px;height:62px;background:#E8B04A;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #CF962E;overflow:hidden',
      children: [
        {
          style:
            'left:10px;top:8px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        {
          style:
            'left:46px;top:4px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        {
          style:
            'left:28px;top:16px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        {
          style:
            'left:56px;top:22px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        {
          style:
            'left:6px;top:30px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        {
          style:
            'left:62px;top:40px;width:12px;height:10px;background:#C7922F;border-radius:50%;border:3px solid #5B3A1A',
        },
        { style: 'left:18px;top:40px;width:40px;height:24px;background:#FFF1DC;border-radius:50%' },
      ],
    },
  ],
  'macan-kumbang': [
    {
      style:
        'left:14px;top:20px;width:26px;height:28px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#5A5A68;border-radius:50%' },
      ],
    },
    {
      style:
        'left:60px;top:20px;width:26px;height:28px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#5A5A68;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:32px;width:76px;height:64px;background:#3A3A44;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #26262E;overflow:hidden',
      children: [
        { style: 'left:20px;top:40px;width:36px;height:22px;background:#4E4E5A;border-radius:50%' },
        {
          style:
            'left:30px;top:0px;width:16px;height:20px;background:#26262E;border-radius:0 0 8px 8px',
        },
      ],
    },
  ],
  'beruang-grizzly': [
    {
      style:
        'left:10px;top:18px;width:28px;height:28px;background:#5B3A26;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#3E2618;border-radius:50%' },
      ],
    },
    {
      style:
        'left:62px;top:18px;width:28px;height:28px;background:#5B3A26;border:3px solid #2F2A24;border-radius:50%',
      children: [
        { style: 'left:6px;top:6px;width:10px;height:10px;background:#3E2618;border-radius:50%' },
      ],
    },
    {
      style:
        'left:12px;top:30px;width:76px;height:66px;background:#6E4630;border:3px solid #2F2A24;border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #563624;overflow:hidden',
      children: [
        { style: 'left:18px;top:36px;width:40px;height:28px;background:#9C6B4D;border-radius:50%' },
        {
          style:
            'left:28px;top:0px;width:20px;height:18px;background:#563624;border-radius:0 0 10px 10px',
        },
      ],
    },
  ],
  kalajengking: [
    {
      style:
        'left:70px;top:8px;width:14px;height:30px;background:#B5532A;border:3px solid #2F2A24;border-radius:8px',
    },
    {
      style:
        'left:66px;top:0px;width:14px;height:14px;background:#2F2A24;border:3px solid #2F2A24;border-radius:50% 50% 0 50%;transform:rotate(45deg)',
    },
    {
      style:
        'left:4px;top:32px;width:26px;height:22px;background:#C8653A;border:3px solid #2F2A24;border-radius:50% 10px 50% 50%;transform:rotate(-20deg)',
    },
    {
      style:
        'left:70px;top:48px;width:26px;height:22px;background:#C8653A;border:3px solid #2F2A24;border-radius:10px 50% 50% 50%;transform:rotate(30deg)',
    },
    {
      style:
        'left:18px;top:40px;width:58px;height:52px;background:#C8653A;border:3px solid #2F2A24;border-radius:50% 50% 44% 44%;overflow:hidden;box-shadow:inset -5px -5px 0 #A74E25',
      children: [
        { style: 'left:0px;top:14px;width:58px;height:5px;background:#A74E25;border-radius:0' },
        { style: 'left:0px;top:28px;width:58px;height:5px;background:#A74E25;border-radius:0' },
      ],
    },
  ],
  gorila: [
    {
      style:
        'left:4px;top:42px;width:24px;height:24px;background:#2F2A30;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:72px;top:42px;width:24px;height:24px;background:#2F2A30;border:3px solid #2F2A24;border-radius:50%',
    },
    {
      style:
        'left:10px;top:14px;width:80px;height:84px;background:#46424C;border:3px solid #2F2A24;border-radius:46% 46% 40% 40% / 40% 40% 50% 50%;overflow:hidden;box-shadow:inset -6px -6px 0 #2F2A30',
      children: [
        { style: 'left:14px;top:14px;width:52px;height:14px;background:#2F2A30;border-radius:50%' },
        {
          style:
            'left:12px;top:32px;width:56px;height:40px;background:#8A8292;border-radius:50% 50% 44% 44%',
        },
      ],
    },
  ],
  kaktus: [
    {
      style:
        'left:22px;top:38px;width:16px;height:26px;background:#6FB45A;border:3px solid #2F2A24;border-radius:8px',
    },
    {
      style:
        'left:62px;top:28px;width:16px;height:26px;background:#6FB45A;border:3px solid #2F2A24;border-radius:8px',
    },
    {
      style:
        'left:37px;top:20px;width:26px;height:56px;background:#6FB45A;border:3px solid #2F2A24;border-radius:13px 13px 4px 4px;box-shadow:inset -4px 0 0 #559A42',
    },
    {
      style:
        'left:28px;top:70px;width:44px;height:26px;background:#D9774A;border:3px solid #2F2A24;border-radius:4px 4px 12px 12px;box-shadow:inset 0 5px 0 #C0613A',
    },
    {
      style:
        'left:43px;top:10px;width:14px;height:14px;background:#F49AB4;border:3px solid #2F2A24;border-radius:50%',
    },
  ],
} as const satisfies Record<string, readonly MascotPart[]>

export type StickerMascotName = keyof typeof STICKER_MASCOTS

export const BLUSHING_STICKER_MASCOTS: ReadonlySet<string> = new Set([
  'babi',
  'hamster',
  'panda',
  'koala',
  'gurita',
])
