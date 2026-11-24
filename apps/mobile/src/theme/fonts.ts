/**
 * Nama keluarga font yang didaftarkan `src/platform/fonts.ts`. Di RN satu bobot = satu keluarga
 * (fontWeight pada font kustom tidak andal di Android), jadi bobot dipilih lewat nama, bukan angka.
 * Bobot mengikuti gaya default `clean` di tokens: judul 800, teks 600, tegas 800.
 */
export const FONT_FAMILY = {
  display: 'Baloo2_800ExtraBold',
  body: 'Nunito_600SemiBold',
  strong: 'Nunito_800ExtraBold',
} as const
