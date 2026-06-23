// Minimal dependency-free ZIP writer (store / no compression).
//
// Good enough for bundling a handful of small text files (SVGs) into one
// download. Builds a valid .zip with local file headers + central directory.
//
//   const blob = makeZip([{ name: 'a.svg', text: '<svg.../>' }, ...])
//   downloadBlob(blob, 'logos.zip')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Build a ZIP Blob from [{ name, text }]. Stored (compression method 0).
export function makeZip(files) {
  const enc = new TextEncoder()
  const chunks = []          // local records
  const central = []         // central directory records
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = enc.encode(f.text)
    const crc = crc32(data)

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)   // signature
    lv.setUint16(4, 20, true)           // version needed
    lv.setUint16(6, 0, true)            // flags
    lv.setUint16(8, 0, true)            // method = store
    lv.setUint16(10, 0, true)           // mod time
    lv.setUint16(12, 0, true)           // mod date
    lv.setUint32(14, crc, true)         // crc32
    lv.setUint32(18, data.length, true) // compressed size
    lv.setUint32(22, data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)           // extra len
    local.set(nameBytes, 30)
    chunks.push(local, data)

    // Central directory header
    const cen = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)           // version made by
    cv.setUint16(6, 20, true)           // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)           // extra
    cv.setUint16(32, 0, true)           // comment
    cv.setUint16(34, 0, true)           // disk #
    cv.setUint16(36, 0, true)           // internal attrs
    cv.setUint32(38, 0, true)           // external attrs
    cv.setUint32(42, offset, true)      // local header offset
    cen.set(nameBytes, 46)
    central.push(cen)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const centralOffset = offset

  // End of central directory record
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralOffset, true)

  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
