import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReply, emailAddress, himalayaVersionOk, ownerDecision, sentMatch, parseTriage, safeDiscord, mustReview } from '../scripts/policy.mjs'

test('only the configured owner can choose one action', () => {
  assert.equal(ownerDecision({ '✅': ['other'] }, 'owner').action, 'none')
  assert.equal(ownerDecision({ '✅': ['owner'], '🗑️': ['owner'] }, 'owner').action, 'conflict')
  assert.equal(ownerDecision({ '✅': ['owner'] }, 'owner').action, 'send')
})
test('sent verification requires recipient, subject, and time', () => {
  const record = { from: 'sender@example.com', subject: 'Hello', receivedAt: '2026-10-24T00:00:00Z' }
  assert.equal(sentMatch([{ to: [{ addr: 'sender@example.com' }], subject: 'Re: Hello', date: '2026-10-24T00:02:00Z' }], record), true)
  assert.equal(sentMatch([{ to: [{ addr: 'other@example.com' }], subject: 'Re: Hello', date: '2026-10-24T00:02:00Z' }], record), false)
  assert.equal(sentMatch([{ to: [{ addr: 'sender@example.com' }], subject: 'Hello', date: '2026-10-24T00:02:00Z' }], record), false)
})
test('invalid model output fails closed and mentions are escaped', () => {
  assert.equal(parseTriage('not JSON'), null)
  assert.equal(safeDiscord('@everyone').includes('@everyone'), false)
})
test('security and billing notices cannot be silenced by model triage', () => {
  assert.equal(mustReview({ from: 'notice@example.com', subject: 'Payment failed', body: '' }), true)
  assert.equal(mustReview({ from: 'news@example.com', subject: 'Weekly digest', body: 'Hello' }), false)
})

test('reads Himalaya v2 address objects', () => {
  assert.equal(emailAddress([{ name: 'A', email: 'a@example.com' }]), 'a@example.com')
  const record = { from: 'sender@example.com', subject: 'Hello', receivedAt: '2026-10-24T00:00:00Z' }
  assert.equal(sentMatch([{ to: [{ name: null, email: 'sender@example.com' }], subject: 'Re: Hello', date: '2026-10-24T00:02:00-08:00' }], record), true)
})

test('requires Himalaya v2 or newer', () => {
  assert.equal(himalayaVersionOk('himalaya v2.2.1 +imap'), true)
  assert.equal(himalayaVersionOk('himalaya v1.1.0 +imap'), false)
  assert.equal(himalayaVersionOk('unknown'), false)
})

test('builds an ASCII-only reply that decodes back to Korean', () => {
  const body = '안녕하세요.\n화요일 오후 2시 가능합니다.'
  const subject = '다음 주 미팅 가능한 시간을 알려 주세요 — 아주 긴 제목이 여러 조각으로 나뉘어도 글자가 깨지면 안 됩니다'
  const raw = buildReply({ from: '한이룸 <me@example.com>', to: 'you@example.com', subject, body })
  assert.match(raw, /^[\x00-\x7f]*$/)
  const [head, encoded] = raw.split('\r\n\r\n')
  assert.ok(head.split('\r\n').every(line => line.length <= 78), 'header lines stay within 78 characters')
  assert.equal(Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString(), body)
  const words = [...head.matchAll(/Subject: ((?:=\?UTF-8\?B\?[^?]+\?=(?:\r\n )?)+)/g)][0][1]
  const decoded = [...words.matchAll(/\?B\?([^?]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString()).join('')
  assert.equal(decoded, `Re: ${subject}`)
  assert.match(head, /From: =\?UTF-8\?B\?[^?]+\?= <me@example\.com>/)
  assert.match(head, /Message-ID: <[^@]+@example\.com>/)
})

test('subject spaces survive encoding wherever the split lands', () => {
  for (let pad = 0; pad < 16; pad++) {
    const subject = `${'가'.repeat(pad)} [시험] 모임 장소 문의 아주 긴 제목 나눠도 공백이 남아야 합니다`
    const raw = buildReply({ from: 'me@example.com', to: 'you@example.com', subject, body: 'x' })
    const parts = [...raw.split('\r\n\r\n')[0].matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString())
    assert.equal(parts.join(''), `Re: ${subject}`)
    assert.ok(parts.every(part => part === part.trim()), `no edge space with pad ${pad}`)
  }
})

test('sent verification tolerates a reader that dropped a subject space', () => {
  const record = { from: 'sender@example.com', subject: '[시험] 모임 장소', receivedAt: '2026-10-24T00:00:00Z' }
  assert.equal(sentMatch([{ to: [{ email: 'sender@example.com' }], subject: 'Re: [시험]모임 장소', date: '2026-10-24T00:02:00Z' }], record), true)
})
