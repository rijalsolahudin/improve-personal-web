<script setup lang="ts">
import {
  DEFAULT_PHONE_COUNTRY,
  formatNational,
  nationalDigits,
  phoneCountryByIso,
  phonePlaceholder,
  toE164,
} from '~/utils/phone'

/**
 * Nomor WhatsApp: pemilih kode negara (bendera) + kolom nomor ber-mask. Model berisi E.164
 * (`+62812…`) atau kosong; mask hanya tampilan.
 */
const { id, isInvalid = false } = defineProps<{ id: string; isInvalid?: boolean }>()

const model = defineModel<string>({ required: true })

const iso = ref(DEFAULT_PHONE_COUNTRY.iso)
const digits = ref('')
const country = computed(() => phoneCountryByIso(iso.value))
const display = computed(() => formatNational(digits.value, country.value))

function update(raw: string): void {
  digits.value = nationalDigits(raw, country.value)
  model.value = toE164(digits.value, country.value)
}

function onInput(event: Event): void {
  const input = event.target as HTMLInputElement
  update(input.value)
  // Tulis ulang langsung: bila hasil mask sama dengan nilai sebelumnya, Vue tidak me-render ulang.
  input.value = display.value
}

watch(country, () => update(digits.value))
</script>

<template>
  <div class="phone" :class="{ invalid: isInvalid }">
    <PurchaseCountryPicker v-model="iso" />
    <input
      :id="id"
      class="number"
      :value="display"
      type="tel"
      inputmode="numeric"
      autocomplete="tel-national"
      :placeholder="phonePlaceholder(country)"
      :aria-invalid="isInvalid"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
/* Tanpa `overflow: hidden`: popover pemilih negara keluar dari kotak ini. */
.phone {
  display: flex;
  min-height: 52px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-inner);
  background: #fffdf8;
}

.phone.invalid {
  border-color: var(--danger);
}

.phone:has(.number:focus-visible) {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.number {
  flex: 1;
  min-width: 0;
  padding: 0 var(--space-16);
  border: 0;
  border-radius: 0 var(--radius-inner) var(--radius-inner) 0;
  background: transparent;
  color: var(--ink);
  font-weight: var(--fw-body);
  outline: none;
}
</style>
