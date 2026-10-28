<script setup lang="ts">
import { PROFILE_DISPLAY_NAME_MAX_LENGTH } from '@improve-personal/core'

import { AvatarImageError, resizeAvatar } from '~/utils/profile/avatar'

/**
 * Modal "Edit profil": nama tampilan + foto. Disimpan sebagai record terenkripsi (`useProfile`),
 * jadi tombolnya baru aktif setelah data lokal terbuka.
 */
const { open } = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { session } = useAuthSession()
const localData = useLocalData()
const { profile, save } = useProfile()

const email = computed(() => session.value?.user.email ?? '')
const isUnlocked = computed(() => localData.state.value.status === 'ready')

const draftName = ref('')
const draftAvatar = ref<string | null>(null)
/** User sudah mengubah sesuatu: profil yang baru selesai dimuat/di-sync tidak boleh menimpa draft. */
const isDirty = ref(false)
const isSaving = ref(false)
const message = ref<string | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return
    isDirty.value = false
    message.value = null
  },
  { immediate: true },
)

// Draft mengikuti profil tersimpan sampai user mulai mengedit; batal = buang perubahan.
watch(
  [() => open, profile],
  ([isOpen, saved]) => {
    if (!isOpen || isDirty.value) return
    draftName.value = saved.displayName
    draftAvatar.value = saved.avatar
  },
  { immediate: true },
)

function setName(value: string | number): void {
  draftName.value = String(value)
  isDirty.value = true
}

function removePhoto(): void {
  draftAvatar.value = null
  isDirty.value = true
}

async function onPickPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset supaya memilih berkas yang sama lagi tetap memicu `change`.
  input.value = ''
  if (file === undefined) return

  message.value = null
  try {
    draftAvatar.value = await resizeAvatar(file)
    isDirty.value = true
  } catch (cause) {
    message.value =
      cause instanceof AvatarImageError
        ? t(`profile.errors.${cause.reason}`)
        : t('profile.errors.decode')
  }
}

async function submit(): Promise<void> {
  isSaving.value = true
  message.value = null
  try {
    await save({ displayName: draftName.value, avatar: draftAvatar.value })
    emit('close')
  } catch {
    message.value = t('profile.errors.save')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('profile.title')"
    is-dismissible
    width="26rem"
    @close="emit('close')"
  >
    <form class="profile" @submit.prevent="submit">
      <div class="photo-row">
        <AccountProfileAvatar :src="draftAvatar" :label="draftName || email" :size="88" />
        <div class="photo-actions">
          <Button variant="outline" size="sm" :disabled="!isUnlocked" @click="fileInput?.click()">
            {{ draftAvatar ? t('profile.changePhoto') : t('profile.addPhoto') }}
          </Button>
          <Button
            v-if="draftAvatar"
            variant="link-danger"
            :disabled="!isUnlocked"
            @click="removePhoto"
          >
            {{ t('profile.removePhoto') }}
          </Button>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="visually-hidden"
            tabindex="-1"
            @change="onPickPhoto"
          />
        </div>
      </div>

      <Field :label="t('profile.nameLabel')">
        <Input
          :model-value="draftName"
          :placeholder="t('profile.namePlaceholder')"
          :maxlength="PROFILE_DISPLAY_NAME_MAX_LENGTH"
          :disabled="!isUnlocked"
          data-autofocus
          @update:model-value="setName"
        />
      </Field>

      <p v-if="email" class="email">{{ t('profile.emailNote', { email }) }}</p>
      <p v-if="!isUnlocked" class="hint">{{ t('profile.locked') }}</p>
      <p v-if="message" class="error" role="alert">{{ message }}</p>

      <div class="actions">
        <Button variant="ghost" @click="emit('close')">{{ t('profile.cancel') }}</Button>
        <Button type="submit" :disabled="!isUnlocked || isSaving">
          {{ isSaving ? t('profile.saving') : t('profile.save') }}
        </Button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--space-9);
}

.photo-row {
  display: flex;
  align-items: center;
  gap: var(--space-9);
}

.photo-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-5);
}

.email,
.hint {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}

.error {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-urgent-bg);
  color: var(--danger);
  font-size: var(--fs-body-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-6);
}
</style>
