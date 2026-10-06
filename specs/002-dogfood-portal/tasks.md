# Tasks: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Input**: Design documents from `specs/002-dogfood-portal/` (`spec.md`, `plan.md`)  
**Prerequisites**: `spec.md`, `plan.md`  
**Status**: Ready for execution (Post-Audit Hardening per `reviews/gemini-3.8-flash.md`)  

---

## Phase 1: Setup & Infrastructure Scaffolding

- [ ] `T-001` `[SETUP]` Install dependencies: Inngest SDK, Prisma client, Lucide icons, Framer Motion (`package.json`)
- [ ] `T-002` `[DB]` Add Prisma schema models for `Lead`, `IntakeSubmission`, `BookingEvent`, `Contract` (`prisma/schema.prisma`)
- [ ] `T-003` `[DB]` Configure Prisma Client with dual DSNs: `DATABASE_URL` (PgBouncer port 6432) and `DIRECT_URL` (direct port 5432 for migrations) in `lib/db/prisma.ts`
- [ ] `T-004` `[OPS]` Create production `docker/docker-compose.hetzner.yml` with `pgbouncer` container (max 30 pool) and strict memory limits for 6 FOSS services ($\le 13.5\text{ GB RAM}$)
- [ ] `T-005` `[OPS]` Create Cloudflare Tunnel config `docker/cloudflared.yml` (Zero-Open-Ports standard) and automated 6h offsite backup script `docker/backup-offsite.sh` (`[P0-05]`)

---

## Phase 2: User Story 1 - Hero & Live Savings Calculator (Priority: P1)

- [ ] `T-006` `[FE]` `[US1]` Create `components/landing/SavingsCalculator.tsx` with dynamic seat slider (1–50) and verified Year 1 (-$9,500) / Year 2+ (-$6,000) math
- [ ] `T-007` `[FE]` `[US1]` Implement `components/landing/HeroSection.tsx` with verified 3x Salesforce Developer hook (linking to Trailblazer.me/Credly) and CTA
- [ ] `T-008` `[FE]` `[US1]` Build `components/landing/LiveStackDemo.tsx` with interactive walk-through embeds (Arcade / Storylane) for the FOSS stack without parallel server memory load
- [ ] `T-009` `[FE]` `[US1]` Assemble main landing page layout in `app/page.tsx` (Pure App Router)

---

## Phase 3: User Story 2 - Automated Scoping Intake & Cal.com Embed (Priority: P2)

- [ ] `T-010` `[FE]` `[US2]` Create 4-step progressive disclosure intake form in `components/booking/IntakeForm.tsx`
- [ ] `T-011` `[FE]` `[US2]` Embed responsive Cal.diy scheduling widget in `components/booking/CalComEmbed.tsx` (deferred loading on interaction)
- [ ] `T-012` `[FE]` `[US2]` Assemble `/book` page combining IntakeForm and CalComEmbed (`app/book/page.tsx`)
- [ ] `T-013` `[BE]` `[US2]` Implement API Route Handler `app/api/leads/submit/route.ts` with Zod validation
- [ ] `T-014` `[BE]` `[US2]` Set up Inngest background task `lib/inngest/client.ts` (Twenty CRM lead creation via GraphQL API + sanitized Telegram alert without raw PII + Outline brief)
- [ ] `T-015` `[BE]` `[US2]` Implement webhook handler `app/api/webhooks/calcom/route.ts` to process booking confirmations

---

## Phase 4: User Story 3 - Product Ladder & Deal Closing Gateway (Priority: P3)

- [ ] `T-016` `[FE]` `[US3]` Build `components/landing/ProductLadder.tsx` with 3 tiered offerings: Tripwire $490 (Upwork Project Catalog link), Sprint A $3.5k, Sprint B $4.9k
- [ ] `T-017` `[FE]` `[US3]` Build `components/landing/EscrowTrustGate.tsx` with Upwork Project Catalog buy link and DocuSeal direct contract flow
- [ ] `T-018` `[FE]` `[US3]` Create dedicated pricing & scope comparison page `app/pricing/page.tsx`
- [ ] `T-019` `[BE]` `[US3]` Implement DocuSeal contract generator `lib/integrations/docuseal.ts`
- [ ] `T-020` `[BE]` `[US3]` Implement Stripe/Paddle payment webhook listener in `app/api/webhooks/payment/route.ts` to activate contracts upon 40% deposit (idempotent `event_id`)

---

## Phase 5: User Story 4 - Live Omnichannel Support & Integrations (Priority: P4)

- [ ] `T-021` `[FE]` `[US4]` Create `components/common/ChatwootWidget.tsx` for lazy-loaded self-hosted `chat.underundre.com` (`requestIdleCallback`)
- [ ] `T-022` `[FE]` `[US4]` Inject Chatwoot widget in `app/layout.tsx` across all public routes
- [ ] `T-023` `[FE]` `[US4]` Build interactive stack visualization page `app/stacks/page.tsx` with Docker memory allocation graphs

---

## Phase 6: Quality Validation & Verification

- [ ] `T-024` `[FE]` Run TypeScript type check across the project (`npm run check-types`)
- [ ] `T-025` `[FE]` Run Prettier format and ESLint validation (`npm run check-format && npm run check-lint`)
- [ ] `T-026` `[E2E]` Write Playwright end-to-end test for the full intake $\to$ calculator $\to$ booking journey in `tests/e2e/landing-intake.spec.ts`
- [ ] `T-027` `[OPS]` Run simulated disaster recovery restore test of `backup-offsite.sh` dump (`[P0-05]`)

