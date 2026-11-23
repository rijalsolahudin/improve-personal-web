import { EncryptedBackupError } from '@improve-personal/core'

import type {
  BackupKey,
  BackupKeySource,
  BackupWorkerRequest,
  BackupWorkerResponse,
} from './backup-cipher'

/**
 * Pintu masuk kripto backup untuk UI: setiap operasi jalan di worker baru yang dihentikan setelah
 * selesai (lihat `backup.worker.ts`). Tanpa `Worker` (test, runtime lama), operasinya jalan di thread
 * ini lewat modul yang sama - hasilnya identik, hanya UI yang sempat tertahan.
 */

export async function encryptBackup(
  text: string,
  source: BackupKeySource,
  createdAtMs: number,
): Promise<Uint8Array> {
  const response = await run({ op: 'encrypt', text, source, createdAtMs })
  return response.op === 'encrypt' ? response.bytes : unexpected()
}

export async function decryptBackup(bytes: Uint8Array, password: string): Promise<string> {
  const response = await run({ op: 'decrypt', bytes, password })
  return response.op === 'decrypt' ? response.text : unexpected()
}

/** Kunci backup baru (salt acak) dari kata sandi - dipakai Drive terjadwal (T29). */
export async function deriveNewBackupKey(password: string): Promise<BackupKey> {
  const response = await run({ op: 'derive', password })
  return response.op === 'derive' ? response.backupKey : unexpected()
}

type OkResponse = Extract<BackupWorkerResponse, { ok: true }>

async function run(request: BackupWorkerRequest): Promise<OkResponse> {
  const response =
    typeof Worker === 'undefined' ? await runInThread(request) : await runInWorker(request)

  if (!response.ok) {
    if (response.reason !== null) throw new EncryptedBackupError(response.reason)
    throw new Error('Proses enkripsi backup gagal. Coba lagi.')
  }
  return response
}

function runInWorker(request: BackupWorkerRequest): Promise<BackupWorkerResponse> {
  const worker = new Worker(new URL('./backup.worker.ts', import.meta.url), { type: 'module' })

  return new Promise<BackupWorkerResponse>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<BackupWorkerResponse>) => resolve(event.data)
    worker.onerror = () =>
      reject(new Error('Proses enkripsi backup berhenti tiba-tiba. Coba lagi.'))
    worker.postMessage(request)
  }).finally(() => worker.terminate())
}

async function runInThread(request: BackupWorkerRequest): Promise<BackupWorkerResponse> {
  const [{ loadSodium }, { handleBackupRequest }] = await Promise.all([
    import('./sodium'),
    import('./backup-cipher'),
  ])
  return handleBackupRequest(await loadSodium(), request)
}

function unexpected(): never {
  throw new Error('Balasan worker backup tidak sesuai permintaan.')
}
