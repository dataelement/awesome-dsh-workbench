import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { inspectImage, readBounded, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../scripts/media-lib.mjs'

for (const format of ['png', 'jpeg', 'webp']) {
  test(`fully decodes ${format} and rejects wrong extensions and truncated bytes`, async () => {
    const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: 'red' } }).toFormat(format).toBuffer()
    assert.equal((await inspectImage(bytes, `a.${format}`)).width, 64)
    await assert.rejects(() => inspectImage(bytes, `a.${format === 'png' ? 'jpeg' : 'png'}`), /格式/)
    await assert.rejects(() => inspectImage(bytes.subarray(0, Math.floor(bytes.length / 2)), `a.${format}`))
  })
}

test('enforces byte and decoded pixel limits', async () => {
  await assert.rejects(() => inspectImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'a.png'), /2 MiB/)
  const bytes = await sharp({ create: { width: 4097, height: 4096, channels: 3, background: 'white' } }).png().toBuffer()
  assert.ok(4097 * 4096 > MAX_IMAGE_PIXELS)
  await assert.rejects(() => inspectImage(bytes, 'a.png'), /pixel limit/)
})

test('stops oversized chunked downloads and accepts bounded content', async () => {
  await assert.rejects(() => readBounded(new Response('123456'), 5, 'test'), /超过/)
  await assert.rejects(() => readBounded(new Response('1', { headers: { 'content-length': '999' } }), 5, 'test'), /超过/)
  assert.equal((await readBounded(new Response('123'), 5, 'test')).toString(), '123')
})
