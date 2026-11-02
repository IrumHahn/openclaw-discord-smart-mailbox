export const ACTIONS = Object.freeze({ '✅': 'send', '🗑️': 'trash', '🙅': 'no_reply', '⏸️': 'hold' })

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
  const words = []
  let chunk = ''
  for (const char of text) {
    if (Buffer.byteLength(chunk + char) > 39) { words.push(chunk); chunk = '' }
    chunk += char
  }
  words.push(chunk)
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
    && normalizedSubject(item.subject) === normalizedSubject(record.subject)
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
