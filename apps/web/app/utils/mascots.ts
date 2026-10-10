/**
 * Maskot hewan/tanaman dari Mascot.dc.html, disalin 1:1 (kanvas 100×100, bentuk CSS murni).
 * Hanya subset yang dipakai di halaman fase 1; tambah dari file design bila perlu.
 */

export interface MascotPart {
  style: string
  children?: MascotPart[]
}

const INK = 'border:3px solid #2F2A24'

export const MASCOTS = {
  kelinci: [
    {
      style: `left:26px;top:0;width:19px;height:47px;background:#FFFBF4;${INK};border-radius:50%;transform:rotate(-12deg)`,
      children: [{ style: 'inset:8px 4px 9px;background:#F9C9D6;border-radius:50%' }],
    },
    {
      style: `left:53px;top:3px;width:19px;height:44px;background:#FFFBF4;${INK};border-radius:50%;transform:rotate(14deg)`,
      children: [{ style: 'inset:8px 4px 9px;background:#F9C9D6;border-radius:50%' }],
    },
    {
      style: `left:15px;top:34px;width:70px;height:62px;background:#FFFBF4;${INK};border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #F2E4CC`,
    },
  ],
  kucing: [
    {
      style: `left:18px;top:24px;width:26px;height:26px;background:#F6D3B0;${INK};border-radius:6px 20px 6px 6px;transform:rotate(-8deg) skew(8deg)`,
      children: [{ style: 'inset:6px;background:#F9C9D6;border-radius:3px 12px 3px 3px' }],
    },
    {
      style: `left:56px;top:24px;width:26px;height:26px;background:#F6D3B0;${INK};border-radius:20px 6px 6px 6px;transform:rotate(8deg) skew(-8deg)`,
      children: [{ style: 'inset:6px;background:#F9C9D6;border-radius:12px 3px 3px 3px' }],
    },
    {
      style: `left:13px;top:36px;width:74px;height:60px;background:#F6D3B0;${INK};border-radius:50% 50% 44% 44%;box-shadow:inset -6px -6px 0 #E8B98E`,
    },
    {
      style:
        'left:40px;top:39px;width:20px;height:9px;border-radius:0 0 10px 10px;background:#E8A86E',
    },
  ],
  ayam: [
    {
      style: `left:42px;top:14px;width:10px;height:22px;background:#F9D857;${INK};border-radius:50%;transform:rotate(-20deg)`,
    },
    {
      style: `left:50px;top:12px;width:10px;height:24px;background:#F9D857;${INK};border-radius:50%;transform:rotate(18deg)`,
    },
    {
      style: `left:13px;top:28px;width:74px;height:68px;background:#F9D857;${INK};border-radius:50%;box-shadow:inset -6px -6px 0 #E6B820`,
    },
    {
      style: `left:4px;top:62px;width:20px;height:24px;background:#F2C22C;${INK};border-radius:50% 20% 50% 50%;transform:rotate(25deg)`,
    },
    {
      style: `left:76px;top:62px;width:20px;height:24px;background:#F2C22C;${INK};border-radius:20% 50% 50% 50%;transform:rotate(-25deg)`,
    },
  ],
  beruang: [
    {
      style: `left:12px;top:22px;width:30px;height:30px;background:#A8774A;${INK};border-radius:50%`,
      children: [{ style: 'inset:6px;background:#C99A6B;border-radius:50%' }],
    },
    {
      style: `left:58px;top:22px;width:30px;height:30px;background:#A8774A;${INK};border-radius:50%`,
      children: [{ style: 'inset:6px;background:#C99A6B;border-radius:50%' }],
    },
    {
      style: `left:12px;top:34px;width:76px;height:62px;background:#C08A58;${INK};border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #A8774A`,
    },
    { style: 'left:36px;top:66px;width:28px;height:18px;background:#E9CDA8;border-radius:50%' },
  ],
  rubah: [
    {
      style: `left:14px;top:16px;width:28px;height:36px;background:#F08A3C;${INK};border-radius:4px 24px 6px 6px;transform:rotate(-14deg) skew(10deg)`,
      children: [{ style: 'inset:8px 6px 4px;background:#FFFBF4;border-radius:2px 14px 3px 3px' }],
    },
    {
      style: `left:58px;top:16px;width:28px;height:36px;background:#F08A3C;${INK};border-radius:24px 4px 6px 6px;transform:rotate(14deg) skew(-10deg)`,
      children: [{ style: 'inset:8px 6px 4px;background:#FFFBF4;border-radius:14px 2px 3px 3px' }],
    },
    {
      style: `left:12px;top:36px;width:76px;height:60px;background:#F08A3C;${INK};border-radius:50% 50% 46% 46%;overflow:hidden;box-shadow:inset -6px -6px 0 #D8722A`,
      children: [
        {
          style: 'left:8px;right:8px;bottom:-14px;height:38px;background:#FFFBF4;border-radius:50%',
        },
      ],
    },
  ],
  anjing: [
    {
      style: `left:14px;top:34px;width:72px;height:62px;background:#E8C49A;${INK};border-radius:50% 50% 46% 46%;box-shadow:inset -6px -6px 0 #D2A878`,
    },
    {
      style: `left:4px;top:34px;width:24px;height:44px;background:#8B5E3C;${INK};border-radius:50%;transform:rotate(18deg)`,
    },
    {
      style: `left:72px;top:34px;width:24px;height:44px;background:#8B5E3C;${INK};border-radius:50%;transform:rotate(-18deg)`,
    },
    { style: 'left:52px;top:44px;width:22px;height:18px;background:#8B5E3C;border-radius:50%' },
  ],
  elang: [
    {
      style: `left:4px;top:44px;width:36px;height:46px;background:#7A5232;${INK};border-radius:50%;transform:rotate(22deg)`,
    },
    {
      style: `left:60px;top:44px;width:36px;height:46px;background:#7A5232;${INK};border-radius:50%;transform:rotate(-22deg)`,
    },
    {
      style: `left:22px;top:40px;width:56px;height:56px;background:#8B5E3C;${INK};border-radius:50% 50% 44% 44%;box-shadow:inset -5px -5px 0 #7A5232`,
    },
    {
      style: `left:29px;top:14px;width:42px;height:40px;background:#FFFBF4;${INK};border-radius:50%;box-shadow:inset -5px -5px 0 #F2E4CC`,
    },
    {
      style: `left:43px;top:44px;width:14px;height:13px;background:#F2C22C;${INK};border-radius:0 0 50% 50%`,
    },
  ],
  tunas: [
    { style: 'left:47px;top:38px;width:6px;height:36px;background:#4E9A3E;border-radius:3px' },
    {
      style: `left:18px;top:28px;width:32px;height:20px;background:#7CC466;${INK};border-radius:50% 0 50% 0;transform:rotate(-10deg)`,
    },
    {
      style: `left:50px;top:18px;width:34px;height:22px;background:#7CC466;${INK};border-radius:0 50% 0 50%;transform:rotate(-14deg)`,
    },
    {
      style: `left:26px;top:68px;width:48px;height:28px;background:#D9774A;${INK};border-radius:4px 4px 12px 12px;box-shadow:inset 0 5px 0 #C0613A`,
    },
  ],
  bunga: [
    { style: 'left:47px;top:50px;width:6px;height:46px;background:#4E9A3E;border-radius:3px' },
    {
      style: `left:52px;top:68px;width:24px;height:14px;background:#6FB45A;${INK};border-radius:0 50% 0 50%`,
    },
    {
      style: `left:37px;top:7px;width:26px;height:26px;background:#F49AB4;${INK};border-radius:50%`,
    },
    {
      style: `left:52px;top:18px;width:26px;height:26px;background:#F49AB4;${INK};border-radius:50%`,
    },
    {
      style: `left:46px;top:36px;width:26px;height:26px;background:#F49AB4;${INK};border-radius:50%`,
    },
    {
      style: `left:28px;top:36px;width:26px;height:26px;background:#F49AB4;${INK};border-radius:50%`,
    },
    {
      style: `left:22px;top:18px;width:26px;height:26px;background:#F49AB4;${INK};border-radius:50%`,
    },
    {
      style: `left:39px;top:25px;width:22px;height:22px;background:#F9D857;${INK};border-radius:50%`,
    },
  ],
  jamur: [
    {
      style: `left:36px;top:52px;width:28px;height:42px;background:#F6E7CF;${INK};border-radius:10px 10px 14px 14px`,
    },
    {
      style: `left:10px;top:16px;width:80px;height:48px;background:#E2445C;${INK};border-radius:50% 50% 18px 18px;box-shadow:inset -6px -6px 0 #C2304A`,
    },
    { style: 'left:22px;top:32px;width:12px;height:10px;background:#FFFBF4;border-radius:50%' },
    { style: 'left:44px;top:22px;width:14px;height:12px;background:#FFFBF4;border-radius:50%' },
    { style: 'left:66px;top:36px;width:10px;height:9px;background:#FFFBF4;border-radius:50%' },
  ],
  awan: [
    {
      style:
        'inset:0;filter:drop-shadow(3px 0 0 #2F2A24) drop-shadow(-3px 0 0 #2F2A24) drop-shadow(0 3px 0 #2F2A24) drop-shadow(0 -3px 0 #2F2A24)',
      children: [
        {
          style: 'left:10px;top:52px;width:80px;height:36px;background:#E3F1F8;border-radius:18px',
        },
        { style: 'left:16px;top:34px;width:38px;height:38px;background:#E3F1F8;border-radius:50%' },
        { style: 'left:40px;top:22px;width:46px;height:46px;background:#E3F1F8;border-radius:50%' },
      ],
    },
  ],
} as const satisfies Record<string, readonly MascotPart[]>

export type MascotName = keyof typeof MASCOTS

/** Pipi merah muda untuk maskot tertentu (sesuai daftar `blush` di design). */
export const BLUSHING_MASCOTS: ReadonlySet<MascotName> = new Set([
  'kelinci',
  'kucing',
  'ayam',
  'awan',
])
