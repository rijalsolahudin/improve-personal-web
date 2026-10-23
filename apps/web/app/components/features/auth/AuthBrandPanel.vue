<template>
  <div class="panel">
    <BrandMark wordmark="plain" tone="paper" :size="44" />
    <div class="copy">
      <p class="headline">{{ $t('login.brand.headline') }}</p>
      <p class="sub">{{ $t('login.brand.sub') }}</p>
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
      <Mascot name="kelinci" :size="120" />
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: clamp(24px, 4vw, 40px);
  background-color: #f2c94c;
  background-image: radial-gradient(rgba(255, 255, 255, 0.4) 1.4px, transparent 1.4px);
  background-size: 20px 20px;
}

.copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}

.headline {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(34px, 5vw, 48px);
  line-height: 1.02;
  text-wrap: balance;
}

.sub {
  max-width: 340px;
  font-family: var(--font-hand);
  font-size: 22px;
  line-height: 1.3;
  color: #5a4a2e;
}

.mascot {
  position: absolute;
  right: 20px;
  bottom: 16px;
  transform: rotate(calc(-6deg * var(--bev)));
}
</style>
