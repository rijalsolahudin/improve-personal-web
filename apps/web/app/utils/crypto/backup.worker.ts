/// <reference lib="webworker" />
import sodiumWrappers from 'libsodium-wrappers-sumo'

import { handleBackupRequest, type BackupWorkerRequest } from './backup-cipher'

/**
 * Worker kripto backup (AC T27: "jalan di worker"). Argon2id MODERATE memakai 256 MB dan ~0,4-3 dtk;
 * di main thread itu membekukan UI. Worker dibuat per operasi dan dihentikan pemanggil setelahnya,
 * sehingga memori WASM 256 MB itu ikut dilepas - tidak menetap di tab.
 *
 * libsodium diimpor STATIS di sini: worker adalah bundel terpisah yang hanya diunduh saat backup
 * dibuat/dibuka, jadi tidak membebani rute mana pun.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<BackupWorkerRequest>) => {
  await sodiumWrappers.ready
  scope.postMessage(await handleBackupRequest(sodiumWrappers, event.data))
}
