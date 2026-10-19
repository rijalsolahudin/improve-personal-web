// @vitest-environment node
//
// Envelope recovery: 24 kata BIP39 -> Argon2id -> membungkus kunci utama (ARCHITECTURE §7, ADR 11-12).
//
// Yang diuji adalah janji-janji yang menentukan apakah pemulihan ini bisa dipercaya:
// frasa yang sah bisa membuka, frasa yang sah-tapi-bukan-itu DITOLAK, envelope tidak memuat kunci
// utama polos, dan rantai penuh "frasa -> kunci utama -> kunci data -> record" benar-benar bekerja.
import { describe, expect, it } from 'vitest'

import {
  createRecoveryEnvelope,
  createRecoveryWords,
  isValidRecoveryWords,
  recoveryWordCount,
  unwrapMasterKeyWithRecovery,
} from './recovery'
import { createMasterKey, deriveDataKey } from './master-key'
import { createSodiumCryptoProvider } from './provider'
import { loadSodium } from './sodium'

const RECORD_ID = '018f2c4e-0000-7000-8000-00000000000c'

describe('frasa recovery', () => {
  it('24 kata, sah menurut checksum BIP39, dan tidak pernah sama dua kali', () => {
    const first = createRecoveryWords()
    const second = createRecoveryWords()

    expect(recoveryWordCount(first)).toBe(24)
    expect(isValidRecoveryWords(first)).toBe(true)
    expect(first).not.toBe(second)
  })

  it('jumlah kata yang salah ditolak', () => {
    const words = createRecoveryWords().split(' ')

    expect(recoveryWordCount(words.slice(0, 23).join(' '))).toBe(23)
    expect(isValidRecoveryWords(words.slice(0, 23).join(' '))).toBe(false)
    expect(isValidRecoveryWords(`${words.join(' ')} sisa`)).toBe(false)
  })

  it('checksum salah ditolak walau katanya semua ada di wordlist', () => {
    const words = createRecoveryWords().split(' ')
    // Tukar kata terakhir dengan kata lain yang juga ada di wordlist: jumlah kata benar, checksum rusak.
    const swapped = [...words]
    swapped[23] = swapped[23] === 'zoo' ? 'zone' : 'zoo'

    expect(isValidRecoveryWords(swapped.join(' '))).toBe(false)
  })

  it('spasi berlebih, baris baru, dan huruf kapital tetap diterima (orang mengetik ulang dari kertas)', () => {
    const words = createRecoveryWords()

    expect(isValidRecoveryWords(`  ${words.toUpperCase().replaceAll(' ', '   ')}\n`)).toBe(true)
  })
})

describe('envelope recovery', () => {
  it('round-trip: frasa yang sama mengembalikan kunci utama yang sama', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const words = createRecoveryWords()

    const envelope = await createRecoveryEnvelope(masterKey, words)
    const recovered = await unwrapMasterKeyWithRecovery(words, envelope)

    expect(Buffer.from(recovered)).toEqual(Buffer.from(masterKey))
  })

  it('frasa sah tapi bukan frasa ini DITOLAK oleh auth tag', async () => {
    const sodium = await loadSodium()
    const words = createRecoveryWords()
    const envelope = await createRecoveryEnvelope(createMasterKey(sodium), words)

    await expect(unwrapMasterKeyWithRecovery(createRecoveryWords(), envelope)).rejects.toThrow(
      /tidak cocok/,
    )
  })

  it('frasa tidak sah gagal lebih dulu dengan pesan validasi, bukan lewat KDF', async () => {
    const sodium = await loadSodium()
    const words = createRecoveryWords()
    const envelope = await createRecoveryEnvelope(createMasterKey(sodium), words)

    // Bedanya penting untuk user: "frasamu salah ketik" bukan "frasamu salah".
    await expect(
      unwrapMasterKeyWithRecovery(words.split(' ').slice(0, 23).join(' '), envelope),
    ).rejects.toThrow(/tidak valid/)
  })

  it('envelope tidak memuat kunci utama polos', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const envelope = await createRecoveryEnvelope(masterKey, createRecoveryWords())

    const haystacks = [
      Buffer.from(JSON.stringify(envelope)),
      Buffer.from(envelope.salt, 'base64'),
      Buffer.from(envelope.wrappedKey, 'base64'),
    ]

    expect(haystacks.some((haystack) => haystack.includes(Buffer.from(masterKey)))).toBe(false)
  })

  it('dua envelope untuk kunci yang sama berbeda (salt acak), dua-duanya bisa dibuka', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const words = createRecoveryWords()

    const first = await createRecoveryEnvelope(masterKey, words)
    const second = await createRecoveryEnvelope(masterKey, words)

    expect(first.salt).not.toBe(second.salt)
    expect(first.wrappedKey).not.toBe(second.wrappedKey)
    expect(Buffer.from(await unwrapMasterKeyWithRecovery(words, first))).toEqual(
      Buffer.from(masterKey),
    )
    expect(Buffer.from(await unwrapMasterKeyWithRecovery(words, second))).toEqual(
      Buffer.from(masterKey),
    )
  })

  it('parameter KDF tersimpan di envelope, dan menolak envelope versi/KDF asing', async () => {
    const sodium = await loadSodium()
    const envelope = await createRecoveryEnvelope(createMasterKey(sodium), createRecoveryWords())

    // Parameter disimpan supaya menaikkan biaya Argon2id nanti tidak membuat envelope lama mati.
    expect(envelope.ops).toBe(sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE)
    expect(envelope.mem).toBe(sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE)
    expect(Buffer.from(envelope.salt, 'base64').length).toBe(16)

    await expect(
      unwrapMasterKeyWithRecovery(createRecoveryWords(), {
        ...envelope,
        kdf: 'pbkdf2',
      } as unknown as Parameters<typeof unwrapMasterKeyWithRecovery>[1]),
    ).rejects.toThrow(/tidak dikenal/)
  })

  it('rantai penuh: frasa recovery -> kunci utama -> kunci data -> record terbuka', async () => {
    const sodium = await loadSodium()
    const provider = await createSodiumCryptoProvider()
    const masterKey = createMasterKey(sodium)
    const words = createRecoveryWords()
    const envelope = await createRecoveryEnvelope(masterKey, words)

    const plaintext = JSON.stringify({ type: 'todo', schemaVersion: 1, data: { title: 'pulih' } })
    const blob = await provider.sealRecord({
      recordId: RECORD_ID,
      dataKey: deriveDataKey(sodium, masterKey),
      plaintext,
    })

    // Skenario nyata: perangkat baru, tidak punya apa pun kecuali berkas backup + 24 kata.
    const recoveredMasterKey = await unwrapMasterKeyWithRecovery(words, envelope)
    const opened = await provider.openRecord({
      recordId: RECORD_ID,
      dataKey: deriveDataKey(sodium, recoveredMasterKey),
      blob,
    })

    expect(opened).toBe(plaintext)
  })
})
