import sharp from 'sharp'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024

// Stop while streaming, not after allocating an arbitrarily large response.
export async function readBounded(response, limit, label) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error(`${label} 超过 ${limit} bytes`)
  if (!response.body) throw new Error(`${label} 没有内容`)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error(`${label} 超过 ${limit} bytes`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

export async function inspectImage(bytes, imagePath) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('截图必须为 1 byte 至 2 MiB')
  const decoder = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' })
  const metadata = await decoder.metadata()
  const extension = imagePath.split('.').at(-1).toLowerCase().replace('jpg', 'jpeg')
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || extension !== metadata.format) throw new Error('截图扩展名与真实格式不一致')
  if ((metadata.pages || 1) !== 1) throw new Error('截图不接受动画或多页图片')
  // metadata alone accepts truncated images; force a full, bounded decode.
  await decoder.raw().toBuffer()
  return { width: metadata.width, height: metadata.height, bytes: bytes.length }
}
