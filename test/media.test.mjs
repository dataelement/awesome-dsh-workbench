import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { inspectImage, readBounded, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_PACKAGE_BYTES } from '../scripts/media-lib.mjs'

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


test('package download limit accepts exactly 32 MiB and rejects one extra byte with or without a length header', async () => {
  assert.equal(MAX_PACKAGE_BYTES, 32 * 1024 * 1024)
  const bytes = Buffer.alloc(MAX_PACKAGE_BYTES)
  assert.equal((await readBounded(new Response(bytes), MAX_PACKAGE_BYTES, 'package')).length, MAX_PACKAGE_BYTES)
  await assert.rejects(() => readBounded(new Response('x', { headers: { 'content-length': String(MAX_PACKAGE_BYTES + 1) } }), MAX_PACKAGE_BYTES, 'package'), /超过 33554432 bytes/)
  const streamed = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.enqueue(new Uint8Array(1)); controller.close() } })
  await assert.rejects(() => readBounded(new Response(streamed), MAX_PACKAGE_BYTES, 'package'), /超过 33554432 bytes/)
})
