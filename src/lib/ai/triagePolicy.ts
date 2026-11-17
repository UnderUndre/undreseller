/**
 * Pure structured extraction parser & deterministic delegation router (spec 013 FR-1305).
 *
 * The LLM NEVER makes authorization or FSM status decisions; it only extracts typed fields.
 * Routing (`DELEGATE_OPERATOR` vs `ESCALATE_OWNER`) is strictly deterministic in TypeScript.
 */

export const TRIAGE_CATEGORIES = [
  'maintenance',
  'out_call',
  'handover',
  'billing',
  'general',
  'unknown',
] as const
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number]

export const TRIAGE_CURRENCIES = ['AED', 'USD', 'RUB', 'EUR'] as const
export type TriageCurrency = (typeof TRIAGE_CURRENCIES)[number]

export const TRIAGE_URGENCIES = ['low', 'medium', 'high'] as const
export type TriageUrgency = (typeof TRIAGE_URGENCIES)[number]

export interface TriageExtraction {
  category: TriageCategory
  estimatedAmount: number | null
  currency: TriageCurrency | null
  urgency: TriageUrgency
  missingInfo: string[]
  summary: string
  confidence: number
}

export interface TriagePolicyConfig {
  delegationLimit: number
  delegationCurrency: TriageCurrency
  minConfidence: number
}

export interface TriageRouteDecision {
  route: 'DELEGATE_OPERATOR' | 'ESCALATE_OWNER'
  targetRole: 'OPERATOR' | 'OWNER'
  reasons: string[]
}

export type AiTriageRecord = TriageExtraction & TriageRouteDecision

const MAX_ESTIMATED_AMOUNT = 10_000_000

/**
 * Strips reasoning `<think>...</think>` blocks and markdown code fences, then validates
 * the JSON strictly against FR-1305 bounds. Returns `null` on ANY violation (no silent truncation).
 */
export function parseTriageExtraction(raw: string): TriageExtraction | null {
  if (typeof raw !== 'string') return null

  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const obj = parsed as Record<string, unknown>

  if (typeof obj.category !== 'string' || !(TRIAGE_CATEGORIES as readonly string[]).includes(obj.category)) {
    return null
  }

  let estimatedAmount: number | null
  if (obj.estimatedAmount === null) {
    estimatedAmount = null
  } else if (
    typeof obj.estimatedAmount === 'number' &&
    Number.isFinite(obj.estimatedAmount) &&
    obj.estimatedAmount >= 0 &&
    obj.estimatedAmount <= MAX_ESTIMATED_AMOUNT
  ) {
    estimatedAmount = obj.estimatedAmount
  } else {
    return null
  }

  let currency: TriageCurrency | null
  if (obj.currency === null) {
    currency = null
  } else if (typeof obj.currency === 'string' && (TRIAGE_CURRENCIES as readonly string[]).includes(obj.currency)) {
    currency = obj.currency as TriageCurrency
  } else {
    return null
  }

  if (typeof obj.urgency !== 'string' || !(TRIAGE_URGENCIES as readonly string[]).includes(obj.urgency)) {
    return null
  }

  if (!Array.isArray(obj.missingInfo) || obj.missingInfo.length > 5) {
    return null
  }
  const missingInfo: string[] = []
  for (const item of obj.missingInfo) {
    if (typeof item !== 'string') return null
    const trimmed = item.trim()
    if (trimmed.length === 0 || trimmed.length > 120) return null
    missingInfo.push(trimmed)
  }

  if (typeof obj.summary !== 'string') return null
  const summary = obj.summary.trim()
  if (summary.length === 0 || summary.length > 240) {
    return null
  }

  if (typeof obj.confidence !== 'number' || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 1) {
    return null
  }

  return {
    category: obj.category as TriageCategory,
    estimatedAmount,
    currency,
    urgency: obj.urgency as TriageUrgency,
    missingInfo,
    summary,
    confidence: obj.confidence,
  }
}

/**
 * Deterministic 5-condition delegation gate (spec 013 US3 / FR-1305):
 * DELEGATE_OPERATOR iff amount known & >= 0, currency strictly matches policy currency,
 * amount <= delegationLimit, urgency != 'high', and confidence >= minConfidence.
 */
export function routeTriageDecision(
  extraction: TriageExtraction,
  policy: TriagePolicyConfig,
): TriageRouteDecision {
  const reasons: string[] = []

  if (extraction.estimatedAmount === null) {
    reasons.push('amount_unknown')
  } else if (extraction.estimatedAmount > policy.delegationLimit) {
    reasons.push('amount_exceeds_limit')
  }

  if (extraction.currency === null || extraction.currency !== policy.delegationCurrency) {
    reasons.push('currency_mismatch')
  }

  if (extraction.urgency === 'high') {
    reasons.push('urgency_high')
  }

  if (extraction.confidence < policy.minConfidence) {
    reasons.push('low_confidence')
  }

  if (reasons.length === 0) {
    return {
      route: 'DELEGATE_OPERATOR',
      targetRole: 'OPERATOR',
      reasons: ['within_delegation_limit'],
    }
  }

  return {
    route: 'ESCALATE_OWNER',
    targetRole: 'OWNER',
    reasons,
  }
}
