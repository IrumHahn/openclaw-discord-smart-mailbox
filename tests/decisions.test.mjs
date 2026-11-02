import test from 'node:test'
import assert from 'node:assert/strict'
import { ACTIONS, ownerCommands, ownerDecision, parseDecision, resolveOwnerInput } from '../scripts/policy.mjs'

test('all six reactions map to an action and a second reaction still conflicts', () => {
  assert.deepEqual(Object.values(ACTIONS), ['send', 'send_similar', 'trash', 'no_reply', 'block_sender', 'hold'])
  assert.equal(ownerDecision({ '🔁': ['owner'] }, 'owner').action, 'send_similar')
  assert.equal(ownerDecision({ '🚫': ['owner'] }, 'owner').action, 'block_sender')
  assert.equal(ownerDecision({ '✅': ['owner'], '🔁': ['owner'] }, 'owner').action, 'conflict')
})

test('owner text maps to the same decisions', () => {
  assert.equal(parseDecision('승인').action, 'send')
  assert.equal(parseDecision('보류').action, 'hold')
  assert.equal(parseDecision('답장필요없음').action, 'no_reply')
  assert.equal(parseDecision('삭제').action, 'trash')
  assert.equal(parseDecision('스팸처리하고 다시 수신하지마').action, 'block_sender')
  assert.deepEqual(parseDecision('수정: 더 정중하게'), { action: 'revise', instruction: '더 정중하게' })
  assert.deepEqual(parseDecision('답장: 감사합니다.'), { action: 'draft', body: '감사합니다.' })
})

test('free-form prose asks for a new draft and never approves sending', () => {
  for (const text of ['내일 오후 3시 가능하다고 회신해 줘', '이렇게 보내 줘: 감사합니다', '승인 부탁드려요 라고 고쳐 줘']) {
    assert.equal(parseDecision(text).action, 'revise', text)
  }
  for (const text of ['승인할까 고민 중', '좋아 보여요', '']) assert.equal(parseDecision(text), null, text)
})

test('only the owner\'s messages after the current card count, oldest first', () => {
  const messages = [
    { id: '30', author: { id: 'owner' }, content: '둘째' },
    { id: '20', author: { id: 'owner' }, content: '첫째' },
    { id: '25', author: { id: 'other' }, content: '승인' },
    { id: '26', author: { id: 'owner', bot: true }, content: '승인' },
    { id: '5', author: { id: 'owner' }, content: '이전 카드에 남긴 글' }
  ]
  assert.deepEqual(ownerCommands(messages, 'owner', '10').map(x => x.id), ['20', '30'])
  assert.deepEqual(ownerCommands(messages, 'owner', '20').map(x => x.id), ['30'])
})

const owner = (id, content) => ({ id, author: { id: 'owner' }, content })

test('a revision wins over a reaction on the card it replaces', () => {
  const next = resolveOwnerInput([owner('20', '수정: 더 짧게')], { action: 'send', emoji: '✅' })
  assert.equal(next.kind, 'revise')
  assert.equal(next.commandId, '20')
})

test('text and reaction that disagree stop instead of guessing', () => {
  assert.equal(resolveOwnerInput([owner('20', '승인')], { action: 'trash', emoji: '🗑️' }).kind, 'conflict')
  assert.equal(resolveOwnerInput([owner('20', '승인')], { action: 'send', emoji: '✅' }).action, 'send')
})

test('a text decision applies alone, and a reaction applies when no text is waiting', () => {
  assert.deepEqual(resolveOwnerInput([owner('20', '보류')], { action: 'none' }), { kind: 'decide', action: 'hold', commandId: '20', unknownIds: [] })
  assert.deepEqual(resolveOwnerInput([], { action: 'trash', emoji: '🗑️' }), { kind: 'decide', action: 'trash', commandId: null, unknownIds: [] })
  assert.equal(resolveOwnerInput([], { action: 'none' }).kind, 'none')
  assert.equal(resolveOwnerInput([], { action: 'conflict' }).kind, 'conflict')
})

test('unclear text is reported and passed over, and empty text means the bot cannot read it', () => {
  const next = resolveOwnerInput([owner('20', '좋아 보여요'), owner('21', '보류')], { action: 'none' })
  assert.equal(next.action, 'hold')
  assert.deepEqual(next.unknownIds, ['20'])
  const alone = resolveOwnerInput([owner('20', '좋아 보여요')], { action: 'none' })
  assert.deepEqual([alone.kind, alone.unknownIds], ['none', ['20']])
  assert.equal(resolveOwnerInput([owner('20', '')], { action: 'none' }).unreadable, true)
})
