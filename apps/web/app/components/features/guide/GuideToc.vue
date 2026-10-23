<script setup lang="ts">
import {
  GUIDE_BACKUP,
  GUIDE_COPY,
  GUIDE_GROUPS,
  GUIDE_SECURITY,
  guideAnchor,
  guideFeaturesInGroup,
} from '~/utils/guide'

const groups = GUIDE_GROUPS.map((group) => ({
  group,
  label: GUIDE_COPY.groupLabel[group],
  items: guideFeaturesInGroup(group),
}))

/** Keamanan sengaja paling atas supaya mudah ditemukan; dua section lain menutup halaman. */
const SECURITY = { id: GUIDE_SECURITY.id, label: GUIDE_SECURITY.title } as const
const CLOSING = [
  { id: GUIDE_BACKUP.id, label: GUIDE_BACKUP.title },
  { id: 'faq', label: GUIDE_COPY.faqTitle },
] as const

function href(item: { id: string }): string {
  return `#${guideAnchor(item.id)}`
}
</script>

<template>
  <nav class="toc" :aria-label="GUIDE_COPY.tocLabel">
    <p class="heading">{{ GUIDE_COPY.tocLabel }}</p>

    <div class="groups">
      <div class="group">
        <a class="link" :href="href(SECURITY)">{{ SECURITY.label }}</a>
      </div>

      <div v-for="{ group, label, items } in groups" :key="group" class="group">
        <p class="group-title">{{ label }}</p>
        <ul class="list">
          <li v-for="item in items" :key="item.id">
            <a class="link" :href="href(item)">
              <span class="code" aria-hidden="true">{{ item.code }}</span>
              <span>{{ item.title }}</span>
            </a>
          </li>
        </ul>
      </div>

      <div class="group">
        <ul class="list">
          <li v-for="item in CLOSING" :key="item.id">
            <a class="link" :href="href(item)">{{ item.label }}</a>
          </li>
        </ul>
      </div>
    </div>

    <a class="top" href="#panduan-atas">{{ GUIDE_COPY.tocTop }} ↑</a>
  </nav>
</template>

<style scoped>
.toc {
  position: sticky;
  top: var(--gap-desktop);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 14px;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-card);
  background: var(--paper);
}

.heading {
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-title {
  padding: 0 8px;
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  color: var(--deep);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.link {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 4px 8px;
  border-radius: var(--radius-inner);
  color: var(--ink);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  line-height: 1.3;
}

.link:hover {
  background: var(--hover);
  color: var(--ink);
}

.code {
  flex-shrink: 0;
  min-width: 22px;
  color: var(--mute-3);
  font-size: var(--fs-eyebrow);
  font-weight: var(--fw-strong);
}

.top {
  padding-top: 10px;
  border-top: var(--border-thin) dashed var(--dash);
  font-size: var(--fs-meta);
  font-weight: var(--fw-strong);
}

/* Di layar sempit daftar isi jadi baris chip yang bisa digeser, bukan kolom panjang. */
@media (max-width: 899px) {
  .toc {
    position: static;
    gap: 8px;
    padding: 12px;
  }

  .groups {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }

  .group {
    display: contents;
  }

  .group-title,
  .code {
    display: none;
  }

  .list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
  }

  .link {
    padding: 6px 12px;
    border: var(--border-thin) solid var(--line);
    border-radius: var(--radius-pill);
  }

  .top {
    display: none;
  }
}
</style>
