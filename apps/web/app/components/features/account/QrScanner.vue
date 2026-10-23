<script setup lang="ts">
/**
 * Pemindai QR untuk alur tambah perangkat.
 *
 * Memakai `BarcodeDetector` bawaan browser (Chrome/Edge/Android). Deteksi sengaja tidak menambah
 * dependency decoder: satu-satunya jalur alternatif yang tetap bekerja di semua browser adalah
 * menempel isi QR secara manual - dan itu memang disediakan, bukan disembunyikan. Kamera butuh konteks
 * aman (HTTPS) dan izin; kegagalannya dijelaskan, bukan didiamkan.
 *
 * Hasil pindai diteruskan sebagai teks mentah: validasi bentuk payload ada di `utils/account/pairing.ts`,
 * jadi QR dari aplikasi lain ditolak di sana dengan alasan yang jelas.
 */
type DetectedBarcode = { rawValue: string }

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

/** Interval pindai: 4x/detik cukup responsif tanpa membakar CPU saat kamera menyala. */
const SCAN_INTERVAL_MS = 250

const emit = defineEmits<{ scanned: [value: string] }>()

const { t } = useI18n()

const video = useTemplateRef<HTMLVideoElement>('video')
const isScanning = ref(false)
const error = ref<'unsupported' | 'camera' | 'decode' | null>(null)
const manual = ref('')

let stream: MediaStream | null = null
let timer: ReturnType<typeof setInterval> | null = null

function createDetector(): BarcodeDetectorLike | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (typeof ctor !== 'function') return null

  try {
    return new ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }

  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  isScanning.value = false
}

async function start(): Promise<void> {
  error.value = null

  const detector = createDetector()
  if (detector === null) {
    error.value = 'unsupported'
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (video.value === null) {
      // Komponen keburu dilepas: kamera tidak boleh tetap menyala tanpa elemen yang menampilkannya.
      stop()
      return
    }

    video.value.srcObject = stream
    await video.value.play()
    isScanning.value = true

    timer = setInterval(async () => {
      if (video.value === null || video.value.readyState < 2) return

      try {
        const found = await detector.detect(video.value)
        const value = found[0]?.rawValue
        if (value === undefined) return

        stop()
        emit('scanned', value)
      } catch {
        // Frame yang tidak bisa dibaca bukan kegagalan yang perlu dilaporkan: lanjut ke frame berikutnya.
      }
    }, SCAN_INTERVAL_MS)
  } catch {
    error.value = 'camera'
    stop()
  }
}

function submitManual(): void {
  const value = manual.value.trim()
  if (value === '') {
    error.value = 'decode'
    return
  }

  error.value = null
  emit('scanned', value)
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="scanner">
    <div class="camera">
      <video ref="video" class="video" :class="{ on: isScanning }" muted playsinline />
      <div v-if="!isScanning" class="placeholder">
        <p>{{ t('account.pairing.scanHint') }}</p>
      </div>
    </div>

    <Button v-if="!isScanning" variant="outline" block @click="start">
      {{ t('account.pairing.scanStart') }}
    </Button>
    <Button v-else variant="soft" block @click="stop">{{ t('account.pairing.scanStop') }}</Button>

    <p v-if="error" class="error" role="alert">{{ t(`account.pairing.scanErrors.${error}`) }}</p>

    <form class="manual" novalidate @submit.prevent="submitManual">
      <label class="label" for="pairing-manual">{{ t('account.pairing.manualLabel') }}</label>
      <Input
        id="pairing-manual"
        v-model="manual"
        variant="bare"
        multiline
        rows="3"
        class="input"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="t('account.pairing.manualPlaceholder')"
      />
      <Button type="submit" variant="outline" block :disabled="manual.trim() === ''">
        {{ t('account.pairing.manualSubmit') }}
      </Button>
    </form>
  </div>
</template>

<style scoped>
.scanner {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.camera {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: var(--border-thin) dashed var(--line);
  border-radius: var(--radius-inner);
  background: var(--surface-inset, #f4efe6);
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
}

.video.on {
  opacity: 1;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-8);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  text-align: center;
}

.manual {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.label {
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
}

.input {
  width: 100%;
  padding: var(--space-6);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  background: var(--paper-2, #fff);
  font-family: ui-monospace, monospace;
  font-size: var(--fs-caption);
  word-break: break-all;
}

.error {
  color: var(--danger, #b0283e);
  font-size: var(--fs-caption);
}
</style>
