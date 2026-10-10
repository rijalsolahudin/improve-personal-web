<script setup lang="ts">
/** Jam weker analog dari design (widget Pomodoro desktop). Dekoratif. */
const { progress } = defineProps<{
  /** 0–1 */
  progress: number
}>()

const TICK_COUNT = 12
const ticks = Array.from({ length: TICK_COUNT }, (_, index) => ({
  deg: index * (360 / TICK_COUNT),
  isMajor: index % 3 === 0,
}))
</script>

<template>
  <span class="clock" aria-hidden="true">
    <span class="knob" />
    <span class="stem" />
    <span class="lever" />
    <span class="face">
      <span
        class="dial"
        :style="{
          background: `conic-gradient(var(--accent) ${Math.round(progress * 100)}%, #fffdf8 0)`,
        }"
      >
        <span class="dial-hole" />
        <span
          v-for="tick in ticks"
          :key="tick.deg"
          class="tick"
          :class="{ major: tick.isMajor }"
          :style="{ transform: `rotate(${tick.deg}deg)` }"
        />
        <span class="hand" :style="{ transform: `rotate(${Math.round(progress * 360)}deg)` }" />
        <span class="pin" />
      </span>
    </span>
  </span>
</template>

<style scoped>
.clock {
  position: relative;
  display: block;
  width: 76px;
  height: 84px;
  flex-shrink: 0;
}

.clock span {
  position: absolute;
  display: block;
}

.knob {
  left: 31px;
  top: 0;
  width: 14px;
  height: 8px;
  border-radius: 4px 4px 0 0;
  background: var(--ink);
}

.stem {
  left: 35px;
  top: 6px;
  width: 6px;
  height: 6px;
  background: var(--ink);
}

.lever {
  left: 4px;
  top: 10px;
  width: 12px;
  height: 6px;
  border-radius: 3px;
  background: var(--ink);
  transform: rotate(-40deg);
}

.face {
  left: 0;
  top: 10px;
  width: 76px;
  height: 76px;
  padding: 4px;
  border-radius: 50%;
  background: var(--ink);
}

.clock .dial {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.dial-hole {
  inset: 6px;
  border-radius: 50%;
  background: #fffdf8;
}

.tick {
  left: 50%;
  top: 7px;
  width: 2px;
  height: 3px;
  margin-left: -1px;
  background: var(--ink);
  transform-origin: 1px 27px;
}

.tick.major {
  height: 6px;
}

.hand {
  left: 50%;
  top: 12px;
  width: 3px;
  height: 22px;
  margin-left: -1.5px;
  border-radius: 2px;
  background: var(--deeper);
  transform-origin: 1.5px 22px;
}

.pin {
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
  background: var(--ink);
}
</style>
