/**
 * Pure PII sanitizer & XML-tag escaper for Local AI Triage (spec 013 FR-1303, Risk 20).
 *
 * Pass order (antigravity F4): EMAIL → IBAN → PHONE → ID (8..30 digits / 4×4 groups).
 * Preserves short amounts (e.g. "1500 AED"), 7-digit codes, dates ("2026-11-18"),
 * and price ranges ("1000 - 1500 AED"). Escapes '<' / '>' to prevent breaking out
 * of the <customer_note> prompt container (antigravity F6).
 */

export type RedactedPiiType = 'PHONE' | 'EMAIL' | 'ID'

export interface SanitizeResult {
  sanitized: string
  redactedCount: number
  types: RedactedPiiType[]
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const IBAN_RE = /\b[A-Za-z]{2}\d{2}(?:[ -]?[A-Za-z0-9]){11,30}\b/g
const CARD_4X4_RE = /\b(?:\d{4}[ -]){3}\d{4}\b/g
const LONG_DIGITS_RE = /\b[A-Za-z]{0,3}\d{8,30}\b/g

// Matches international (+...) and local dashed/spaced phone formats without capturing
// ISO dates (2026-11-18), DMY dates (18.11.2026), 4x4 card groups, or price ranges (1000 - 1500).
const INTL_PHONE_RE = /(?<!\w)\+\d(?:[ \t()-]*\d){7,14}\b/g
const LOCAL_PHONE_RE = /\b(?:0\d{1,3}|8|\(\d{3,4}\))(?:[ -]\d{2,4}){2,4}\b/g

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_DMY_RE = /^\d{2}[./-]\d{2}[./-]\d{4}$/

export function sanitizeForLlm(text: string): SanitizeResult {
  if (!text) {
    return { sanitized: '', redactedCount: 0, types: [] }
  }

  let redactedCount = 0
  const foundTypes = new Set<RedactedPiiType>()

  const mark = (type: RedactedPiiType, placeholder: string) => {
    redactedCount += 1
    foundTypes.add(type)
    return placeholder
  }

  // 1. EMAIL
  let out = text.replace(EMAIL_RE, () => mark('EMAIL', '[EMAIL]'))

  // 2. IBAN (e.g. UAE 23-char AE070331234567890123456)
  out = out.replace(IBAN_RE, () => mark('ID', '[ID]'))

  // 3. PHONE (international + local, skipping dates and 4x4 card numbers)
  out = out.replace(INTL_PHONE_RE, (match) => {
    const digits = match.replace(/\D/g, '')
    if (digits.length < 8 || digits.length > 15) return match
    return mark('PHONE', '[PHONE]')
  })

  out = out.replace(LOCAL_PHONE_RE, (match) => {
    if (DATE_ISO_RE.test(match) || DATE_DMY_RE.test(match)) return match
    if (/^(?:\d{4}[ -]){3}\d{4}$/.test(match)) return match
    const digits = match.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) return match
    return mark('PHONE', '[PHONE]')
  })

  // 4. ID: 4×4 card-like groups, then contiguous 8..30 digit identifiers
  out = out.replace(CARD_4X4_RE, () => mark('ID', '[ID]'))
  out = out.replace(LONG_DIGITS_RE, () => mark('ID', '[ID]'))

  // 5. Escape XML angle brackets so client text cannot close </customer_note>
  out = out.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return {
    sanitized: out,
    redactedCount,
    types: Array.from(foundTypes),
  }
}
