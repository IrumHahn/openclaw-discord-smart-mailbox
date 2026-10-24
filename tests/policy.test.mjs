import test from 'node:test'
import assert from 'node:assert/strict'
import { ownerDecision, sentMatch, parseTriage, safeDiscord, mustReview } from '../scripts/policy.mjs'

test('only the configured owner can choose one action', () => {
  assert.equal(ownerDecision({ '✅': ['other'] }, 'owner').action, 'none')
  assert.equal(ownerDecision({ '✅': ['owner'], '🗑️': ['owner'] }, 'owner').action, 'conflict')
  assert.equal(ownerDecision({ '✅': ['owner'] }, 'owner').action, 'send')
})
test('sent verification requires recipient, subject, and time', () => {
  const record = { from: 'sender@example.com', subject: 'Hello', receivedAt: '2026-10-24T00:00:00Z' }
  assert.equal(sentMatch([{ to: [{ addr: 'sender@example.com' }], subject: 'Re: Hello', date: '2026-10-24T00:02:00Z' }], record), true)
  assert.equal(sentMatch([{ to: [{ addr: 'other@example.com' }], subject: 'Re: Hello', date: '2026-10-24T00:02:00Z' }], record), false)
})
test('invalid model output fails closed and mentions are escaped', () => {
  assert.equal(parseTriage('not JSON'), null)
  assert.equal(safeDiscord('@everyone').includes('@everyone'), false)
})
test('security and billing notices cannot be silenced by model triage', () => {
  assert.equal(mustReview({ from: 'notice@example.com', subject: 'Payment failed', body: '' }), true)
  assert.equal(mustReview({ from: 'news@example.com', subject: 'Weekly digest', body: 'Hello' }), false)
})
