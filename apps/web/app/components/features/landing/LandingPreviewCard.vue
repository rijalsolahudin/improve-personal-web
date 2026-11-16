<script setup lang="ts">
/** Cuplikan dashboard statis di hero landing (bukan data user). */
const PREVIEW_TODOS = [
  { id: 'vpc', done: true, category: 'karier' },
  { id: 'run', done: true, category: 'kesehatan' },
  { id: 'money', done: false, category: 'keuangan' },
] as const
</script>

<template>
  <div class="preview" aria-hidden="true">
    <Mascot class="mascot-top" name="kelinci" :size="96" />
    <Mascot class="mascot-bottom" name="tunas" :size="80" />
    <div class="card">
      <div class="head">
        <span class="greeting">{{ $t('landing.preview.greeting') }}</span>
        <span class="avatar" />
      </div>
      <div class="next dot-grid">
        <div>
          <span class="eyebrow next-label">{{ $t('landing.preview.nextLabel') }}</span>
          <span class="next-title">{{ $t('landing.preview.nextTitle') }}</span>
          <span class="next-time">19:00–20:30</span>
        </div>
        <span class="focus">{{ $t('common.focus') }}</span>
      </div>
      <div class="stats">
        <span class="stat stat-soft">
          <span class="stat-value">12</span>
          <span class="stat-label">{{ $t('landing.preview.streak') }}</span>
        </span>
        <span class="stat stat-pink">
          <span class="stat-value">3/5</span>
          <span class="stat-label">{{ $t('landing.preview.goals') }}</span>
        </span>
        <span class="stat stat-orange">
          <span class="stat-value">25:00</span>
          <span class="stat-label">{{ $t('landing.preview.pomodoro') }}</span>
        </span>
      </div>
      <div class="todos">
        <div v-for="todo in PREVIEW_TODOS" :key="todo.id" class="todo" :class="{ done: todo.done }">
          <span class="box">{{ todo.done ? '✓' : '' }}</span>
          <span class="todo-label">{{ $t(`landing.preview.todos.${todo.id}`) }}</span>
          <span class="tag" :class="`tag-${todo.category}`">
            {{ $t(`category.${todo.category}`) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview {
  position: relative;
  padding: var(--space-36) var(--space-8) var(--space-8);
}

.mascot-top {
  position: absolute;
  left: -6px;
  top: 0;
  z-index: 3;
  transform: rotate(calc(-8deg * var(--bev)));
}

.mascot-bottom {
  position: absolute;
  right: -4px;
  bottom: -22px;
  z-index: 3;
  transform: rotate(calc(6deg * var(--bev)));
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
  padding: var(--space-20);
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  box-shadow: 0 10px 0 rgba(47, 42, 36, 0.14);
  transform: rotate(calc(1.2deg * var(--bev)));
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
}

.greeting {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-22);
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: calc(14px * var(--rk));
  background: var(--soft);
  border: var(--border) solid var(--outline);
}

.next {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: var(--space-16) var(--space-20);
  background-color: var(--primary);
  border-radius: var(--radius-hero);
}

.next > div {
  display: flex;
  flex-direction: column;
}

.next-label {
  letter-spacing: 0.12em;
  /* Label di atas `--primary`: `--deep` 3,98:1 (cute/hijau), `--deeper` 5,09:1 (QA #67). */
  color: var(--deeper);
}

.next-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h2);
  line-height: var(--lh-title);
}

.next-time {
  font-weight: var(--fw-body);
  font-size: var(--fs-caption);
  color: var(--deeper);
}

.focus {
  padding: var(--space-10) var(--space-16);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fffbf4;
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-12);
}

.stat {
  display: flex;
  flex-direction: column;
  padding: var(--space-14) var(--space-16);
  border-radius: calc(20px * var(--rk));
}

.stat-soft {
  background: var(--soft);
}

.stat-pink {
  background: var(--cat-karier-tint);
}

.stat-orange {
  background: var(--cat-kesehatan-tint);
}

.stat-value {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-28);
  line-height: 1;
}

.stat-label {
  font-weight: var(--fw-body);
  font-size: var(--fs-meta);
  color: #6e604e;
}

.todos {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.todo {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-14);
  border: var(--border-thin) solid #ead8bc;
  border-radius: var(--radius-btn-sq);
}

.box {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: calc(8px * var(--rk));
  background: #fffbf4;
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
}

.done .box {
  background: var(--primary);
}

.todo-label {
  flex: 1;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-sm);
}

.done .todo-label {
  text-decoration: line-through;
  color: var(--mute-3);
}

.tag {
  padding: 3px var(--space-10);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
}

.tag-karier {
  background: var(--cat-karier-tint);
  color: var(--cat-karier-text);
}

.tag-kesehatan {
  background: var(--cat-kesehatan-tint);
  color: var(--cat-kesehatan-text);
}

.tag-keuangan {
  background: var(--cat-keuangan-tint);
  color: var(--cat-keuangan-text);
}
</style>
