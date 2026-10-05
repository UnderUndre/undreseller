# Tasks: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Input**: Design documents from `specs/002-dogfood-portal/` (`spec.md`, `plan.md`)  
**Prerequisites**: `spec.md`, `plan.md`  
**Status**: Ready for execution  

---

## Phase 1: Setup & Infrastructure Scaffolding

- [ ] `T-001` `[SETUP]` Install dependencies: Trigger.dev v3 SDK, Supabase JS client, Lucide icons, Framer Motion (`package.json`)
- [ ] `T-002` `[DB]` Add Prisma schema models for `Lead`, `IntakeSubmission`, `BookingEvent`, `Contract` (`prisma/schema.prisma`)
- [ ] `T-003` `[DB]` Generate Prisma client and run migration/push (`npm run build`)
- [ ] `T-004` `[OPS]` Create production `docker/docker-compose.hetzner.yml` with strict memory fencing for 6 FOSS services (Twenty CRM, Outline, Plane, Chatwoot, Cal.com, Authentik) on Hetzner CPX42

---

## Phase 2: User Story 1 - Hero & Live Savings Calculator (Priority: P1)

- [ ] `T-005` `[FE]` `[US1]` Create `components/landing/SavingsCalculator.tsx` with dynamic seat slider (1–50) and SaaS replacement checklist
- [ ] `T-006` `[FE]` `[US1]` Implement `components/landing/HeroSection.tsx` with 3x Certified Salesforce Developer hook, trust badges and CTA buttons
- [ ] `T-007` `[FE]` `[US1]` Build `components/landing/LiveStackDemo.tsx` showing status chips and direct links to the 6 dogfooded subdomains
- [ ] `T-008` `[FE]` `[US1]` Assemble main landing page layout in `pages/index.tsx`
- [ ] `T-009` `[BE]` `[US1]` Create `pages/api/calculator/log.ts` to asynchronously log anonymous calculator sessions to Supabase

---

## Phase 3: User Story 2 - Automated Scoping Intake & Cal.com Embed (Priority: P2)

- [ ] `T-010` `[FE]` `[US2]` Create 4-step progressive disclosure intake form in `components/booking/IntakeForm.tsx`
- [ ] `T-011` `[FE]` `[US2]` Embed responsive Cal.com scheduling widget in `components/booking/CalComEmbed.tsx`
- [ ] `T-012` `[FE]` `[US2]` Assemble `/book` page combining IntakeForm and CalComEmbed (`pages/book.tsx`)
- [ ] `T-013` `[BE]` `[US2]` Implement API route `pages/api/leads/submit.ts` with Zod validation for intake data
- [ ] `T-014` `[BE]` `[US2]` Set up Trigger.dev v3 background task `lib/trigger/leadEnrichment.ts` (Twenty CRM contact creation + Telegram founder alert + Outline brief creation)
- [ ] `T-015` `[BE]` `[US2]` Implement webhook handler `pages/api/webhooks/calcom.ts` to process booking confirmations

---

## Phase 4: User Story 3 - Product Ladder & Deal Closing Gateway (Priority: P3)

- [ ] `T-016` `[FE]` `[US3]` Build `components/landing/ProductLadder.tsx` with 3 tiered offerings: Tripwire $490, Sprint A $3.5k, Sprint B $4.9k
- [ ] `T-017` `[FE]` `[US3]` Build `components/landing/EscrowTrustGate.tsx` on `/hire` with Upwork Direct Contracts (5%) and DocuSeal 40/40/20 options
- [ ] `T-018` `[FE]` `[US3]` Create dedicated pricing & scope comparison page `pages/pricing.tsx`
- [ ] `T-019` `[BE]` `[US3]` Implement DocuSeal contract generation service `lib/integrations/docuseal.ts`
- [ ] `T-020` `[BE]` `[US3]` Implement DocuSeal webhook listener in `pages/api/webhooks/docuseal.ts`

---

## Phase 5: User Story 4 - Live Omnichannel Support & Integrations (Priority: P4)

- [ ] `T-021` `[FE]` `[US4]` Create `components/common/ChatwootWidget.tsx` for asynchronous loading of self-hosted `chat.underundre.com`
- [ ] `T-022` `[FE]` `[US4]` Inject Chatwoot widget in `pages/_app.tsx` across all public routes
- [ ] `T-023` `[FE]` `[US4]` Build interactive stack visualization page `pages/stacks.tsx` with Docker memory allocation graphs

---

## Phase 6: Quality Validation & Verification

- [ ] `T-024` `[FE]` Run TypeScript type check across the project (`npm run check-types`)
- [ ] `T-025` `[FE]` Run Prettier format and ESLint validation (`npm run check-format && npm run check-lint`)
- [ ] `T-026` `[E2E]` Write Playwright end-to-end test for the full intake $\to$ calculator $\to$ booking journey in `tests/e2e/landing-intake.spec.ts`
