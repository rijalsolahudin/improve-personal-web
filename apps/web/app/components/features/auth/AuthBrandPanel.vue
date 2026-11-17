<script setup lang="ts">
/** `purchase` = calon pembeli: salam "halo lagi" tidak cocok, jadi panel menjual manfaat lisensi. */
const { variant = 'login' } = defineProps<{ variant?: 'login' | 'purchase' }>()

const BENEFIT_KEYS = ['features', 'local', 'platforms', 'noRenewal'] as const
</script>

<template>
  <div class="panel">
    <BrandMark wordmark="plain" tone="paper" :size="44" />
    <div class="copy">
      <p class="headline">{{ $t(`authPanel.${variant}.headline`) }}</p>
      <p class="sub">{{ $t(`authPanel.${variant}.sub`) }}</p>
      <ul v-if="variant === 'purchase'" class="benefits">
        <li v-for="key in BENEFIT_KEYS" :key="key" class="benefit">
          <span class="tick"><Icon name="check" :size="14" :stroke="3" /></span>
          {{ $t(`authPanel.purchase.benefits.${key}`) }}
        </li>
      </ul>
    </div>
    <!--
      Pembungkus sendiri, bukan `<Mascot class="mascot">`: posisi absolut dipasang pada elemen milik
      panel ini, bukan pada root milik komponen Mascot. Kalau kelas yang sama dipakai di dua
      komponen, `position` bergantung pada URUTAN stylesheet - dan urutan CSS hasil SSR (inline)
      berbeda dari CSS yang dimuat client, sehingga maskot melompat ~100 px setelah hidrasi
      (CLS 0,233 saat `/login` dicoba SSR). Dengan pembungkus, tidak ada dua aturan yang berebut
      properti yang sama.
    -->
    <div class="mascot">
      <Mascot name="kelinci" :size="150" />
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: var(--space-24);
  padding: clamp(24px, 4vw, 40px);
  background-color: #f2c94c;
  background-image: radial-gradient(rgba(255, 255, 255, 0.4) 1.4px, transparent 1.4px);
  background-size: 20px 20px;
}

/* Kartu bisa jauh lebih tinggi dari isi panel (form beli). Judul ikut logo di atas, bukan melayang
   di tengah, supaya tidak ada dua blok yang terpisah ruang kosong besar. Padding bawah = ruang
   maskot saat kartu pendek. */
.copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  margin-top: clamp(24px, 6vh, 64px);
  padding-bottom: 150px;
}

.headline {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(34px, 5vw, 48px) * var(--fk-display));
  line-height: 1.02;
  text-wrap: balance;
}

.sub {
  max-width: 340px;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-22);
  line-height: 1.3;
  color: #5a4a2e;
}

.benefits {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  margin: var(--space-12) 0 0;
  padding: 0;
  list-style: none;
}

.benefit {
  display: flex;
  align-items: flex-start;
  gap: var(--space-10);
  font-weight: var(--fw-strong);
  line-height: 1.35;
}

/* Satu kolom (HP): panel ada di atas form; daftar manfaat mendorong form jauh ke bawah, dan
   isinya sudah diringkas di subjudul form. */
@media (max-width: 819px) {
  .benefits {
    display: none;
  }
}

.tick {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: var(--border-thin) solid var(--outline);
  border-radius: var(--radius-pill);
  background: #fffdf8;
}

.mascot {
  position: absolute;
  right: 20px;
  bottom: 16px;
  transform: rotate(calc(-6deg * var(--bev)));
}
</style>
