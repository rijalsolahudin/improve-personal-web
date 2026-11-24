import { bytesToHex, hexToBytes } from './hex'

describe('hex', () => {
  it('round-trip byte -> hex huruf kecil -> byte', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 171, 255])

    expect(bytesToHex(bytes)).toBe('00010f10abff')
    expect(hexToBytes('00010f10abff')).toEqual(bytes)
  })

  it.each(['abc', 'ABCD', 'zz', "00'; --"])(
    'menolak input bukan hex genap huruf kecil: %s',
    (input) => {
      expect(hexToBytes(input)).toBeNull()
    },
  )
})
