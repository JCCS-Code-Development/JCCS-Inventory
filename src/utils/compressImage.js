// Resizes + re-encodes a picked photo client-side before upload — phone
// camera photos are routinely 3-8MB, and nothing here needs that much detail
// for a quick visual reference. Keeps uploads fast on a cellular connection
// in the field and comfortably under the backend's size limit.
const MAX_DIMENSION = 900
const JPEG_QUALITY   = 0.8

export function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const width  = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Could not process that image')),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}
