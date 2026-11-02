import test from 'node:test'
import assert from 'node:assert/strict'
import { addBlocked, autoReplyBlocker, createRule, findRule, hasAttachmentPart, isBlocked, messageBody, parseDraft, parseSimilarity, removeBlocked, ruleAllowsSend, ruleBlocker, sameTerms } from '../scripts/policy.mjs'

const account = { id: 'personal', address: 'me@example.com' }
const record = { account: 'personal', from: 'Ask@Example.com', subject: 'Re: 수업 문의', protected: false, draft: '안내해 드립니다.' }
const rule = () => createRule(record, '수업 시간이 궁금합니다.', '2026-11-02T00:00:00.000Z')

test('a rule is keyed by account, sender and subject and matches case-insensitively', () => {
  const r = rule()
  assert.equal(r.sender, 'ask@example.com')
  assert.equal(r.subject, '수업 문의')
  assert.equal(r.approvedReply, '안내해 드립니다.')
  assert.equal(findRule([r], { account: 'personal', from: 'ask@example.com', subject: '수업 문의' }), r)
  assert.equal(findRule([r], { account: 'personal', from: 'ask@example.com', subject: 'RE: 수업 문의' }), r)
  assert.equal(findRule([r], { account: 'other', from: 'ask@example.com', subject: '수업 문의' }), undefined)
  assert.equal(findRule([r], { account: 'personal', from: 'other@example.com', subject: '수업 문의' }), undefined)
  assert.equal(findRule([{ ...r, enabled: false }], { account: 'personal', from: 'ask@example.com', subject: '수업 문의' }), undefined)
})

test('rules cannot be made for protected, self, automated or draftless mail', () => {
  assert.equal(ruleBlocker(record, account), null)
  assert.match(ruleBlocker({ ...record, protected: true }, account), /보호/)
  assert.match(ruleBlocker({ ...record, protected: undefined }, account), /보호/, 'older records fail closed')
  assert.match(ruleBlocker({ ...record, from: 'ME@example.com' }, account), /내 주소/)
  assert.match(ruleBlocker({ ...record, from: 'no-reply@example.com' }, account), /자동/)
  assert.match(ruleBlocker({ ...record, draft: '' }, account), /초안/)
})

test('changed money, dates, attachments or new risk send the mail back to the owner', () => {
  const r = rule()
  assert.equal(autoReplyBlocker(r, { body: '수업 시간이 궁금해요. 알려 주세요.', hasAttachment: false }), null)
  assert.match(autoReplyBlocker(r, { body: '수업 시간이 궁금해요. 10만원 맞나요?', hasAttachment: false }), /금액|날짜/)
  assert.match(autoReplyBlocker(r, { body: '수업 시간이 궁금해요. 2026-12-01 가능할까요?', hasAttachment: false }), /금액|날짜/)
  assert.match(autoReplyBlocker(r, { body: '수업 시간이 궁금합니다. 첨부 파일 봐 주세요.', hasAttachment: false }), /첨부/)
  assert.match(autoReplyBlocker(r, { body: '수업 시간이 궁금합니다. 안내 메일 드려요.', hasAttachment: true }), /첨부/)
  assert.match(autoReplyBlocker(r, { body: '수업 시간과 환불 규정이 궁금합니다.', hasAttachment: false }), /계약|결제/)
  assert.match(autoReplyBlocker(r, { body: '짧음', hasAttachment: false }), /짧/)
})

test('Korean particles and spelled-out amounts cannot hide a changed term', () => {
  const r = rule()
  for (const body of ['수업 시간이 궁금합니다. 참가비 3만원이 맞나요?', '수업 시간이 궁금합니다. 12월에 가능한가요?', '수업 시간이 궁금합니다. 오후 3시에 시작하나요?', '수업 시간이 궁금합니다. 참가비가 삼만원인가요?']) {
    assert.match(autoReplyBlocker(r, { body, hasAttachment: false }), /금액|날짜/, body)
  }
})

test('quoted history does not count as the new request', () => {
  const r = rule()
  assert.equal(autoReplyBlocker(r, { body: '수업 시간이 궁금해요. 알려 주세요.\n> 환불 10만원 2026-12-01', hasAttachment: false }), null)
})

test('each rule sends at most three times in 24 hours', () => {
  const now = Date.parse('2026-11-02T12:00:00Z')
  const hours = h => new Date(now - h * 3_600_000).toISOString()
  assert.equal(ruleAllowsSend({ sends: [hours(1), hours(2)] }, now), true)
  assert.equal(ruleAllowsSend({ sends: [hours(1), hours(2), hours(3)] }, now), false)
  assert.equal(ruleAllowsSend({ sends: [hours(1), hours(2), hours(25)] }, now), true)
  assert.equal(ruleAllowsSend({}, now), true)
})

test('model similarity and drafts fail closed', () => {
  assert.equal(parseSimilarity('{"safe":true,"sameRequest":true,"sameTerms":true}'), true)
  assert.equal(parseSimilarity('{"safe":true,"sameRequest":false,"sameTerms":true}'), false)
  assert.equal(parseSimilarity('not json'), false)
  assert.equal(parseDraft('{"draft":"새 문안"}'), '새 문안')
  assert.equal(parseDraft('{"draft":"  "}'), null)
  assert.equal(parseDraft('no json'), null)
})

test('blocking is per account, case-insensitive and reversible', () => {
  const blocked = {}
  addBlocked(blocked, 'personal', 'Spam@Example.com')
  addBlocked(blocked, 'personal', 'spam@example.com')
  assert.deepEqual(blocked.personal, ['spam@example.com'])
  assert.equal(isBlocked(blocked, 'personal', 'SPAM@example.com'), true)
  assert.equal(isBlocked(blocked, 'other', 'spam@example.com'), false)
  assert.equal(removeBlocked(blocked, 'SPAM@example.com'), true)
  assert.equal(isBlocked(blocked, 'personal', 'spam@example.com'), false)
  assert.equal(removeBlocked(blocked, 'spam@example.com'), false)
})

test('message body drops the header block', () => {
  assert.equal(messageBody('From: a@example.com\nDate: 2026-11-02\nSubject: x\n\n본문입니다.\n\n둘째 줄'), '본문입니다.\n\n둘째 줄')
  assert.equal(sameTerms('10만원 입니다', '10 만원 입니다'), true)
})

test('reads the Himalaya v2 part layout and spots attachments', () => {
  const raw = 'Date: Mon, 2 Nov 2026 23:46:04 +0900\nFrom: a <a@example.com>\n\n[2] text/plain (86 B)\n    Content-Type: text/plain; charset=UTF-8\n    Content-Transfer-Encoding: base64\n\n다음 주 장소가 궁금합니다.\n\n[3] text/html (118 B)\n    Content-Type: text/html; charset=UTF-8\n'
  assert.equal(messageBody(raw), '다음 주 장소가 궁금합니다.')
  assert.equal(hasAttachmentPart(raw), false)
  assert.equal(hasAttachmentPart(`${raw}\n[4] application/pdf (20 KB)\n`), true)
})
