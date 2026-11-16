<script setup lang="ts">
/** FAQ dengan `<details>` asli: buka/tutup tanpa JavaScript, jadi aman `hydrate-never`. */
const QUESTIONS = ['internet', 'storage', 'devices', 'expired', 'move', 'payment'] as const
</script>

<template>
  <section id="faq" class="section" aria-labelledby="landing-faq-title">
    <h2 id="landing-faq-title" class="heading">{{ $t('landing.faq.title') }}</h2>
    <div class="list">
      <details v-for="question in QUESTIONS" :key="question" class="item">
        <summary class="question">{{ $t(`landing.faq.items.${question}.q`) }}</summary>
        <p class="answer">{{ $t(`landing.faq.items.${question}.a`) }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.section {
  width: 100%;
  max-width: 820px;
  display: flex;
  flex-direction: column;
  gap: var(--space-28);
  scroll-margin-top: 110px;
}

.heading {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(32px, 4.2vw, 48px) * var(--fk-display));
  line-height: var(--lh-tight);
  text-align: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.item {
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(22px * var(--rk));
}

.question {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-16);
  padding: var(--space-18) var(--space-24);
  font-weight: var(--fw-strong);
  font-size: var(--fs-17);
  cursor: pointer;
  list-style: none;
}

.question::-webkit-details-marker {
  display: none;
}

.question::after {
  content: '+';
  flex: none;
  font-family: var(--font-display);
  font-size: var(--fs-display-22);
  line-height: 1;
  transition: transform 0.15s;
}

.item[open] .question::after {
  transform: rotate(45deg);
}

.question:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  border-radius: calc(20px * var(--rk));
}

.answer {
  padding: 0 var(--space-24) var(--space-20);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.55;
  color: #6e604e;
  text-wrap: pretty;
}
</style>
