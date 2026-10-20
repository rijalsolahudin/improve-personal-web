<script setup lang="ts">
/**
 * Kolom kata sandi dengan tombol mata untuk menampilkan / menyembunyikan isinya.
 *
 * Tersembunyi secara default, dan kembali tersembunyi saat komponen dibuang - kata sandi yang sempat
 * terlihat tidak boleh "menempel" terlihat ke layar berikutnya. Tombolnya `aria-pressed` dan punya
 * label, bukan ikon bisu.
 */
const {
  id,
  autocomplete = 'off',
  isInvalid = false,
} = defineProps<{
  /** Dipasangkan dengan `<label for>` milik pemanggil. */
  id: string
  autocomplete?: 'off' | 'current-password' | 'new-password'
  isInvalid?: boolean
}>()

const model = defineModel<string>({ required: true })

const { t } = useI18n()
const isVisible = ref(false)
</script>

<template>
  <div class="field">
    <input
      :id="id"
      v-model="model"
      class="input"
      :type="isVisible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :aria-invalid="isInvalid"
      autocapitalize="off"
      spellcheck="false"
    />
    <button
      type="button"
      class="toggle"
      :aria-pressed="isVisible"
      :aria-label="t(isVisible ? 'common.hidePassword' : 'common.showPassword')"
      @click="isVisible = !isVisible"
    >
      <Icon :name="isVisible ? 'eye-off' : 'eye'" />
    </button>
  </div>
</template>

<style scoped>
.field {
  position: relative;
}

.input {
  width: 100%;
  padding: var(--space-5) calc(var(--space-6) + 36px) var(--space-5) var(--space-6);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  background: var(--paper-2);
  font-size: var(--fs-body);
}

.input[aria-invalid='true'] {
  border-color: var(--danger);
}

.toggle {
  position: absolute;
  top: 50%;
  right: var(--space-3);
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  transform: translateY(-50%);
  border: none;
  border-radius: var(--radius-pill);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.toggle:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
</style>
