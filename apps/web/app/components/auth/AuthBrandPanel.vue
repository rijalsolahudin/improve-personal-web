<template>
  <div class="panel">
    <UiBrandMark wordmark="plain" tone="paper" :size="44" />
    <div class="copy">
      <p class="headline">{{ $t('login.brand.headline') }}</p>
      <p class="sub">{{ $t('login.brand.sub') }}</p>
    </div>
    <UiMascot class="mascot" name="kelinci" :size="120" />
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
  font-weight: 800;
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
  transform: rotate(-6deg);
}
</style>
