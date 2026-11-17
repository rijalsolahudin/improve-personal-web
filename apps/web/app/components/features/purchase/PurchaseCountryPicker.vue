<script setup lang="ts">
import {
  filterPhoneCountries,
  flagEmoji,
  phoneCountryByIso,
  type PhoneCountry,
} from '~/utils/phone'

/**
 * Pemilih kode negara nomor WA: tombol bendera + popover berisi kolom cari dan daftar negara.
 * Pola ARIA combobox (kolom cari) + listbox; fokus pindah ke kolom cari saat dibuka dan kembali ke
 * tombol saat ditutup.
 */
const model = defineModel<string>({ required: true })
const { t } = useI18n()

const isOpen = ref(false)
const query = ref('')
const activeIndex = ref(0)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const search = useTemplateRef<HTMLInputElement>('search')
const list = useTemplateRef<HTMLUListElement>('list')
useDismiss(root, isOpen)

const listId = useId()
const selected = computed(() => phoneCountryByIso(model.value))
const nameOf = (country: PhoneCountry): string => t(`purchase.countries.${country.iso}`)
const results = computed(() => filterPhoneCountries(query.value, nameOf))
const optionId = (country: PhoneCountry): string => `${listId}-${country.iso}`
const activeId = computed(() => {
  const active = results.value[activeIndex.value]
  return active ? optionId(active) : undefined
})

watch(isOpen, async (open) => {
  if (!open) return
  query.value = ''
  activeIndex.value = Math.max(0, results.value.indexOf(selected.value))
  await nextTick()
  search.value?.focus()
  scrollActiveIntoView()
})

watch(query, () => {
  activeIndex.value = 0
})

function scrollActiveIntoView(): void {
  if (!activeId.value) return
  list.value?.querySelector(`#${CSS.escape(activeId.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function choose(country: PhoneCountry): void {
  model.value = country.iso
  close()
}

function close(): void {
  isOpen.value = false
  trigger.value?.focus()
}

function move(step: number): void {
  const count = results.value.length
  if (count === 0) return
  activeIndex.value = (activeIndex.value + step + count) % count
  nextTick(scrollActiveIntoView)
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const active = results.value[activeIndex.value]
    if (active) choose(active)
  } else if (event.key === 'Escape') {
    close()
  } else if (event.key === 'Tab') {
    isOpen.value = false
  }
}
</script>

<template>
  <div ref="root" class="picker">
    <button
      ref="trigger"
      type="button"
      class="trigger"
      :class="{ on: isOpen }"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-label="`${t('purchase.mobileCountryLabel')}: ${nameOf(selected)} (+${selected.dial})`"
      @click="isOpen = !isOpen"
    >
      <span class="flag" aria-hidden="true">{{ flagEmoji(selected.iso) }}</span>
      <span aria-hidden="true">+{{ selected.dial }}</span>
      <span class="caret" aria-hidden="true" />
    </button>

    <div v-if="isOpen" class="menu">
      <input
        ref="search"
        v-model="query"
        class="search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        :aria-controls="listId"
        :aria-activedescendant="activeId"
        :aria-label="t('purchase.countrySearch')"
        :placeholder="t('purchase.countrySearch')"
        autocomplete="off"
        @keydown="onSearchKeydown"
      />
      <ul :id="listId" ref="list" class="list" role="listbox">
        <li
          v-for="(country, index) in results"
          :id="optionId(country)"
          :key="country.iso"
          class="option"
          :class="{ active: index === activeIndex, selected: country.iso === selected.iso }"
          role="option"
          :aria-selected="country.iso === selected.iso"
          @pointerenter="activeIndex = index"
          @click="choose(country)"
        >
          <span class="flag" aria-hidden="true">{{ flagEmoji(country.iso) }}</span>
          <span class="name">{{ nameOf(country) }}</span>
          <span class="dial">+{{ country.dial }}</span>
        </li>
        <li v-if="results.length === 0" class="empty" role="presentation">
          {{ t('purchase.countryEmpty') }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  display: flex;
}

.trigger {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-12);
  border: 0;
  border-right: var(--border-thick) solid var(--outline);
  border-radius: calc(var(--radius-inner) - var(--border-thick)) 0 0
    calc(var(--radius-inner) - var(--border-thick));
  background: var(--primary);
  color: var(--ink);
  font-weight: var(--fw-strong);
  white-space: nowrap;
  cursor: pointer;
}

.trigger:hover,
.trigger.on {
  filter: brightness(0.96);
}

.flag {
  font-size: 20px;
  line-height: 1;
}

.caret {
  width: 7px;
  height: 7px;
  margin: -3px 0 0 var(--space-2);
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.12s ease-out;
}

.trigger.on .caret {
  margin-top: 3px;
  transform: rotate(-135deg);
}

/* Membuka ke ATAS: field ini di dasar form dan kartu memotong isinya (`overflow: hidden` untuk
   sudut panel), sedangkan di atasnya selalu ada field lain dalam kartu. */
.menu {
  position: absolute;
  bottom: calc(100% + var(--space-8) + var(--border-thick));
  left: calc(-1 * var(--border-thick));
  z-index: 20;
  width: min(320px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-8);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-inner);
  background: #fffdf8;
  box-shadow: 0 6px 0 rgba(47, 42, 36, 0.14);
  transform-origin: bottom left;
  animation: country-pop 0.12s ease-out both;
}

@keyframes country-pop {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}

.search {
  min-height: 42px;
  padding: 0 var(--space-12);
  border: var(--border) solid var(--outline);
  border-radius: calc(var(--radius-inner) - 4px);
  background: #fffdf8;
  color: var(--ink);
  font-weight: var(--fw-body);
  font-size: 16px;
}

.search:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.list {
  max-height: 264px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.option {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  min-height: 42px;
  padding: 0 var(--space-10);
  border-radius: calc(var(--radius-inner) - 4px);
  cursor: pointer;
}

.option.active {
  background: #f6ebda;
  box-shadow: inset 0 0 0 2px var(--outline);
}

.option.selected {
  background: var(--primary);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-strong);
}

.dial {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
  color: #6e604e;
}

.empty {
  padding: var(--space-12) var(--space-10);
  font-size: var(--fs-body-sm);
  color: #8a7a60;
}

@media (prefers-reduced-motion: reduce) {
  .menu {
    animation: none;
  }
}
</style>
