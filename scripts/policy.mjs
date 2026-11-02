import { createHash } from 'node:crypto'

export const ACTIONS = Object.freeze({ '✅': 'send', '🔁': 'send_similar', '🗑️': 'trash', '🙅': 'no_reply', '🚫': 'block_sender', '⏸️': 'hold' })
export const RULE_MAX_PER_DAY = 3

export function recordKey(account, id) { return `${account}:${id}` }
export function safeHeader(value) { return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200) }
export function safeDiscord(value, limit = 1200) { return String(value ?? '').replace(/@/g, '@\u200b').slice(0, limit) }
export function emailAddress(value) {
  const first = Array.isArray(value) ? value[0] : value
  const candidate = typeof first === 'string' ? first : first?.email ?? first?.addr
  return String(candidate ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
}
// `himalaya message send` transmits bytes as given, so non-ASCII headers must be RFC 2047 encoded here.
export function encodeHeaderWord(value) {
  const text = String(value ?? '')
  if (/^[\x20-\x7e]*$/.test(text)) return text
  // A space at the edge of an encoded word gets dropped by some readers, so split only between non-spaces.
  const chars = [...text]
  const words = []
  let start = 0
  while (start < chars.length) {
    let end = start
    while (end < chars.length && Buffer.byteLength(chars.slice(start, end + 1).join('')) <= 39) end++
    while (end < chars.length && end > start + 1 && (/\s/.test(chars[end]) || /\s/.test(chars[end - 1]))) end--
    words.push(chars.slice(start, end).join(''))
    start = end
  }
  return words.map(word => `=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`).join('\r\n ')
}
function encodeMailbox(value) {
  const match = String(value ?? '').match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/)
  return match ? `${match[1] ? `${encodeHeaderWord(match[1])} ` : ''}<${match[2]}>` : String(value ?? '')
}
export function buildReply({ from, to, subject, body, date = new Date(), id = crypto.randomUUID() }) {
  const domain = emailAddress(from).split('@')[1] || 'localhost'
  const headers = [
    `From: ${encodeMailbox(from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(/^re\s*:/i.test(subject) ? subject : `Re: ${subject}`)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64'
  ]
  const encoded = Buffer.from(String(body)).toString('base64').match(/.{1,76}/g) ?? []
  return `${headers.join('\r\n')}\r\n\r\n${encoded.join('\r\n')}\r\n`
}
export function himalayaVersionOk(output) {
  const major = Number(String(output).match(/v?(\d+)\.\d+/)?.[1])
  return major >= 2
}
export function normalizedSubject(value) { return safeHeader(value).replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/ig, '').toLowerCase() }
export function sentMatch(items, record) {
  const cutoff = Date.parse(record.receivedAt ?? '') - 5 * 60_000
  // A self-sent original also sits in Sent with the same subject; only a reply (Re:) counts as already answered.
  return items.some(item => /^\s*re\s*:/i.test(String(item.subject ?? ''))
    && normalizedSubject(item.subject).replace(/\s+/g, '') === normalizedSubject(record.subject).replace(/\s+/g, '')
    && (Array.isArray(item.to) ? item.to : [item.to]).some(to => emailAddress(to).toLowerCase() === record.from.toLowerCase())
    && Date.parse(item.date ?? '') >= cutoff)
}
export function ownerDecision(reactions, ownerId) {
  const selected = Object.keys(ACTIONS).filter(emoji => reactions[emoji]?.includes(ownerId))
  return selected.length === 1 ? { action: ACTIONS[selected[0]], emoji: selected[0] } : { action: selected.length ? 'conflict' : 'none' }
}
export function mustReview(record) {
  if (!emailAddress(record.from)) return true
  return /보안|로그인|비밀번호|계정|결제|청구|영수증|계약|서명|환불|주문|배송|정지|중단|수강|입학|security|sign.?in|login|password|account|payment|billing|invoice|contract|signature|refund|order|delivery|suspend|outage/i.test(`${record.subject || ''}\n${record.body || ''}`)
}
export function parseTriage(output) {
  try {
    const text = String(output).match(/\{[\s\S]*\}/)?.[0] ?? ''
    const x = JSON.parse(text)
    if (typeof x.summary !== 'string' || typeof x.recommendation !== 'string' || typeof x.needsAttention !== 'boolean' || typeof x.draft !== 'string') return null
    if (!x.summary.trim() || !x.recommendation.trim()) return null
    return { summary: x.summary.trim().slice(0, 400), recommendation: x.recommendation.trim().slice(0, 180), needsAttention: x.needsAttention, draft: x.draft.trim().slice(0, 4000) }
  } catch { return null }
}

// Owner text in the approval thread. Prose can only ask for a new draft; it never approves sending.
export function parseDecision(content) {
  const value = String(content ?? '').trim()
  if (/^승인\s*$/u.test(value)) return { action: 'send' }
  if (/^보류\s*$/u.test(value)) return { action: 'hold' }
  if (/^(?:답장\s*(?:필요\s*없음|필요\s*없어|안\s*해도\s*돼)|회신\s*(?:필요\s*없음|불필요)|답장하지\s*마|회신하지\s*마|보내지\s*마)[.!。\s]*$/u.test(value)) return { action: 'no_reply' }
  if (/^(?:(?:삭제하고\s*)?스팸\s*처리(?:하고\s*다시\s*수신하지\s*마)?|다시\s*수신하지\s*마|수신\s*거부(?:해\s*줘)?|구독\s*(?:취소|해지)(?:해\s*줘)?)[.!。\s]*$/u.test(value)) return { action: 'block_sender' }
  if (/^(?:삭제\s*해\s*줘|삭제|휴지통(?:으로)?\s*보내\s*줘)[.!。\s]*$/u.test(value)) return { action: 'trash' }
  const revise = value.match(/^수정\s*:\s*([\s\S]{1,4000})$/u)
  if (revise) return { action: 'revise', instruction: revise[1].trim() }
  const draft = value.match(/^답장\s*:\s*([\s\S]{1,4000})$/u)
  if (draft) return { action: 'draft', body: draft[1].trim() }
  if (value.length <= 4000 && /(?:회신|답장)(?:\s*(?:해\s*줘|해\s*주세요|부탁(?:해|드립니다|드려요)?|으로\s*보내\s*줘))|(?:수정|고쳐|바꿔|써|적어|넣어|반영해|보내|물어봐|질문해|전달해)\s*(?:줘|주세요)/u.test(value)) {
    return { action: 'revise', instruction: value }
  }
  return null
}
export function ownerCommands(messages, ownerId, afterId) {
  return messages
    .filter(item => item.author?.id === ownerId && !item.author?.bot && BigInt(item.id) > BigInt(afterId))
    .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
}
export function resolveOwnerInput(commands, reaction) {
  const unknownIds = []
  let unreadable = false
  for (const command of commands) {
    const parsed = parseDecision(command.content)
    if (!parsed) {
      unknownIds.push(command.id)
      if (!String(command.content ?? '').trim()) unreadable = true
      continue
    }
    const extra = unreadable ? { unreadable } : {}
    if (parsed.action === 'revise') return { kind: 'revise', instruction: parsed.instruction, commandId: command.id, unknownIds, ...extra }
    if (parsed.action === 'draft') return { kind: 'draft', body: parsed.body, commandId: command.id, unknownIds, ...extra }
    if (reaction.action !== 'none' && reaction.action !== parsed.action) return { kind: 'conflict', unknownIds, ...extra }
    return { kind: 'decide', action: parsed.action, commandId: command.id, unknownIds, ...extra }
  }
  const extra = unreadable ? { unreadable } : {}
  if (reaction.action === 'conflict') return { kind: 'conflict', unknownIds, ...extra }
  if (reaction.action === 'none') return { kind: 'none', unknownIds, ...extra }
  return { kind: 'decide', action: reaction.action, commandId: null, unknownIds, ...extra }
}

// Sender block list: { accountId: [lowercase address] }.
export function isBlocked(blocked, account, address) { return (blocked[account] || []).includes(String(address).toLowerCase()) }
export function addBlocked(blocked, account, address) {
  const value = String(address).toLowerCase()
  if (!isBlocked(blocked, account, value)) blocked[account] = [...(blocked[account] || []), value]
}
export function removeBlocked(blocked, address) {
  const value = String(address).toLowerCase()
  let removed = false
  for (const account of Object.keys(blocked)) {
    if (blocked[account].includes(value)) { blocked[account] = blocked[account].filter(x => x !== value); removed = true }
  }
  return removed
}

// Similar-mail auto replies. The approved text is sent verbatim, so mail content can never reach the outgoing reply.
const ATTACHMENT = /첨부|attachment|attached|enclosed|\.pdf\b|\.docx?\b/i
const HIGH_RISK = /계약|서명|환불|해지|독점|2차\s*활용|usage rights|exclusiv|contract|sign(?:ature)?|refund|cancel|licen[cs]e|invoice|payment|결제|지급|수익\s*배분|commission/i
// Any digit counts, so Korean particles ("3만원이", "12월에") cannot hide a changed amount or date.
const MATERIAL_TERM = /\d[\d,.]*|[일이삼사오육칠팔구십백천만억]+\s?(?:원|달러)/gu
const AUTO_SENDER = /(?:^|[.\-_])(newsletter|news|marketing|promo|mailer|mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?|digest|updates)(?:[.@+\-_]|$)/i
// `himalaya message read` prints a header block, then `[n] type (size)` summaries with indented Content-* lines.
const PART_SUMMARY = /^\[\d+\] [\w.+-]+\/[\w.+-]+.*$/
export function messageBody(text) {
  const value = String(text ?? '').replace(/\r\n/g, '\n')
  const gap = value.indexOf('\n\n')
  const rest = gap < 0 ? value : value.slice(gap + 2)
  return rest.split('\n').filter(line => !PART_SUMMARY.test(line) && !/^\s+Content-[\w-]+:/i.test(line)).join('\n').trim()
}
export function hasAttachmentPart(text) { return /^\[\d+\] (?!text\/|multipart\/)[\w.+-]+\/[\w.+-]+/m.test(String(text ?? '')) }
export function currentBody(value) { return String(value ?? '').split(/(?:^|\n)(?:On .{8,160} wrote:|.{8,160} 작성:|>)/m)[0].trim().slice(0, 8000) }
function materialTerms(value) { return [...new Set((String(value ?? '').match(MATERIAL_TERM) || []).map(x => x.replace(/[\s,]/g, '').replace(/\.$/, '')))].sort() }
export function sameTerms(a, b) { return JSON.stringify(materialTerms(a)) === JSON.stringify(materialTerms(b)) }
export function createRule(record, exampleBody, now = new Date().toISOString()) {
  const sender = String(record.from).toLowerCase()
  const subject = normalizedSubject(record.subject)
  return { id: createHash('sha256').update(`${record.account}:${sender}:${subject}`).digest('hex').slice(0, 12), account: record.account, sender, subject, exampleBody: currentBody(exampleBody), approvedReply: record.draft, createdAt: now, sends: [], enabled: true }
}
export function findRule(rules, record) {
  const sender = String(record.from).toLowerCase()
  const subject = normalizedSubject(record.subject)
  return rules.find(rule => rule.enabled && rule.account === record.account && rule.sender === sender && rule.subject === subject)
}
export function ruleBlocker(record, account) {
  const sender = String(record.from).toLowerCase()
  if (record.protected !== false) return '보안·결제·계약 등 보호 대상 메일이에요'
  if (sender === emailAddress(account.address).toLowerCase()) return '내 주소에서 온 메일이에요'
  if (AUTO_SENDER.test(sender.split('@')[0] || '')) return '자동 발송 주소에서 온 메일이에요'
  if (!record.draft) return '보낼 초안이 없어요'
  return null
}
export function autoReplyBlocker(rule, { body, hasAttachment }) {
  const after = currentBody(body)
  if (hasAttachment || ATTACHMENT.test(after)) return '첨부 파일이 있어요'
  if (after.length < 15) return '내용이 너무 짧아 같은 요청인지 알 수 없어요'
  if (HIGH_RISK.test(after) && !HIGH_RISK.test(rule.exampleBody)) return '계약·결제 관련 표현이 새로 생겼어요'
  if (!sameTerms(rule.exampleBody, after)) return '금액이나 날짜 조건이 달라졌어요'
  return null
}
export function ruleAllowsSend(rule, now = Date.now()) {
  return (rule.sends || []).filter(at => now - Date.parse(at) < 24 * 3_600_000).length < RULE_MAX_PER_DAY
}
export function parseSimilarity(output) {
  try {
    const x = JSON.parse(String(output).match(/\{[\s\S]*\}/)?.[0] ?? '')
    return x.safe === true && x.sameRequest === true && x.sameTerms === true
  } catch { return false }
}
export function parseDraft(output) {
  try {
    const x = JSON.parse(String(output).match(/\{[\s\S]*\}/)?.[0] ?? '')
    return typeof x.draft === 'string' && x.draft.trim() ? x.draft.trim().slice(0, 4000) : null
  } catch { return null }
}
