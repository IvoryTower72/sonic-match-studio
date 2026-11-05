import assert from 'node:assert/strict'
import test from 'node:test'
import { previewPosition } from '../src/shared/preview-clock.ts'

test('preview time moves with the audio clock and stops at the end of the file', () => {
  assert.equal(previewPosition(0, 10, 12.5, 100), 2.5)
  assert.equal(previewPosition(5, 10, 12, 100), 7)
  assert.equal(previewPosition(99, 0, 5, 100), 100)
  assert.equal(previewPosition(0, 10, 9, 100), 0)
  assert.equal(previewPosition(Number.NaN, 0, 1, 100), 0)
})
