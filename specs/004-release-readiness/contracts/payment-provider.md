# Contract: PaymentProvider (FR-401, FR-435)

Provider-neutral payment contract. HTTP handlers, bots, and future API/MCP surfaces are thin controllers over this; adapters translate provider wire formats at the boundary.

## Interface (TypeScript, `lib/payments/providerContract.ts`)

```ts
export type CallbackStatus = 'waiting' | 'confirming' | 'finished' | 'partially_paid' | 'failed' | 'expired';

export interface PaymentProvider {
  readonly id: 'NOWPAYMENTS' | 'TELEGRAM_STARS' | (string & {});
  readonly capabilities: { fiat: boolean; crypto: boolean; refunds: 'automatic' | 'manual' };

  createInvoice(input: {
    orderId: string;
    amountMinor: number;          // registry minor units — never ×100 here
    currency: string;             // ISO from CurrencyMetadata
    callbackBaseUrl: string;
  }): Promise<{ providerPaymentId: string; paymentUrl: string }>;  // paymentUrl from PROVIDER API — hand-built URLs prohibited

  verifyCallback(rawBody: string, signature: string | null): boolean;  // HMAC, timing-safe
  parseCallback(rawBody: string): {
    providerPaymentId: string; orderId: string; status: CallbackStatus;
    paidMinor: number; quotedMinor: number;
  };
}
```

## Registry & selection

Enabled providers resolved from deployment configuration at startup; zero providers configured = booking flow fully functional on free-track semantics (FR-401/FR-404 lineage).

## Consumer-driven contract tests (stubbed gateway)

| Scenario | Expected |
|---|---|
| waiting → confirming | holdFrozenAt set; slot NOT released at TTL sweep |
| confirming → finished within MAX_CONFIRMING_FREEZE (24 h) | reservation CONFIRMED; PaymentAllocationLink written; idempotent on replay (×100 replays → one effect) |
| confirming stuck > 24 h (MAX_CONFIRMING_FREEZE) | hold expires, slot released, order → FR-432 resolution path, staff notified |
| finished, paid < 99% of quoted | UNDERPAID; staff notified (SLA ≤ 12 h); customer top-up message; no auto-confirm |
| finished after slot released, slot FREE (FR-444) | booking atomically re-confirmed (BOOKED/PAID), no refund path |
| finished after slot released and RE-BOOKED | order PAID_REQUIRES_RESOLUTION; RefundOperation(SLA 24 h); second booking untouched |
| invalid signature | 401, zero processing, security log |
| JPY (0) / KWD (3) amounts | stored/displayed at registry scale; adapter translates wire scale only |

## STRIDE note

Tampering: amounts validated against registry minor units; Spoofing: HMAC + timing-safe compare; Repudiation: PaymentAllocationLink + immutable PaymentEvent.
