# Implementation Plan: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Branch**: `002-dogfood-portal` | **Date**: 2026-10-05 | **Spec**: [`spec.md`](spec.md)  
**Input**: Feature specification from `specs/002-dogfood-portal/spec.md`

---

## Summary

Разработка и запуск официального портала международного инженерного бюро **UnderUndre** (`underundre.com`) на Next.js 15 с архитектурой полного догфудинга:
1. Конверсионный Hero-экран с доказанной экспертизой 3x Salesforce Certified Developer и калькулятором $30k FOSS-экономии.
2. Интерактивная витрина 6 живых рабочих сервисов (`crm`, `docs`, `plane`, `chat`, `cal`, `auth`) на Hetzner CPX42 с Docker Memory Fencing.
3. Автоматизированный интейк-конвейер бронирования созвонов (Cal.com + Trigger.dev v3 + Twenty CRM + Telegram Alerts).
4. Шлюз безопасной контрактации (Upwork Direct Contracts 5% fee vs DocuSeal 40/40/20).

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS  
**Primary Framework**: Next.js 15 (App Router / Pages Router hybrid) + Tailwind CSS + shadcn/ui  
**Database & Storage**: PostgreSQL + Prisma ORM + Supabase RLS  
**Async Task Runner**: Trigger.dev v3 / Inngest SDK  
**Integrations**: Cal.com Embed API, Chatwoot Live Widget, DocuSeal API, Upwork Direct Contracts, Paddle MoR  
**Testing**: Jest + React Testing Library (unit/component), Playwright (E2E flows)  
**Target Platform**: Vercel / Cloudflare Pages (Frontend) + Hetzner CPX42 VPS (Dogfooded FOSS Stack)  
**Performance Goals**: FCP $< 0.8\text{ s}$, LCP $< 1.5\text{ s}$, PageSpeed Score $\ge 95$  
**Security & Constraints**: 100% RLS policies on Supabase, zero secrets in client bundles, NACE 62.01 compliance  

---

## Project Structure & Architecture

```text
undreseller/
├── components/
│   ├── landing/
│   │   ├── HeroSection.tsx            # 3x Salesforce hook, CTA, trust badges
│   │   ├── SavingsCalculator.tsx      # Interactive $30k SaaS savings engine
│   │   ├── LiveStackDemo.tsx          # 6 dogfooded service cards + memory telemetry
│   │   ├── ProductLadder.tsx          # Tripwire $490, Sprint A $3.5k, Sprint B $4.9k
│   │   └── EscrowTrustGate.tsx        # Upwork Direct vs DocuSeal 40/40/20 selector
│   ├── booking/
│   │   ├── IntakeForm.tsx             # 4-step qualifying questionnaire
│   │   └── CalComEmbed.tsx            # Inline Cal.com 20-min scheduler
│   └── common/
│       └── ChatwootWidget.tsx         # Embedded self-hosted live chat loader
├── lib/
│   ├── trigger/
│   │   └── leadEnrichment.ts          # Trigger.dev v3 task for CRM + Telegram alert
│   ├── integrations/
│   │   ├── twentyCrm.ts               # Twenty CRM GraphQL/REST client
│   │   ├── docuseal.ts                # DocuSeal contract generator
│   │   └── calcom.ts                  # Cal.com webhook signature validator
│   └── supabase.ts                    # Supabase client with typed RLS queries
├── pages/
│   ├── index.tsx                      # Main landing page
│   ├── book.tsx                       # Intake & call scheduling page
│   ├── pricing.tsx                    # Interactive scope calculator & product ladder
│   ├── stacks.tsx                     # Interactive topology & Docker memory specs
│   └── api/
│       ├── webhooks/
│       │   ├── calcom.ts              # Booking created/rescheduled webhook
│       │   └── docuseal.ts            # Contract signed webhook
│       └── leads/
│           └── submit.ts              # Lead intake ingestion endpoint
└── docker/
    └── docker-compose.hetzner.yml     # Production CPX42 compose with memory limits
```

---

## Phase 1: Data Model & Contracts

### 1. Database Schema (`prisma/schema.prisma` / Supabase)
* `Lead`: `id`, `email`, `name`, `company`, `teamSize`, `currentStack` (JSON), `estimatedSavings`, `status` (NEW, QUALIFIED, CALLED, WON, LOST), `crmLeadId`, `createdAt`.
* `IntakeSubmission`: `id`, `leadId`, `projectType` (TRIPWIRE, SPRINT_A, SPRINT_B), `budgetRange`, `timelineDays`, `hostingPreference` (HETZNER, AWS, DIGITALOCEAN), `notes`, `submittedAt`.
* `BookingEvent`: `id`, `leadId`, `calBookingUid`, `startTime`, `endTime`, `meetingUrl`, `status`.
* `Contract`: `id`, `leadId`, `contractType` (UPWORK_DIRECT, DOCUSEAL_DIRECT), `status` (PENDING, SIGNED, ESCROW_FUNDED, COMPLETED), `amount`, `contractUrl`.

### 2. Integration Webhook Endpoints
* `POST /api/webhooks/calcom` — validates `X-Cal-Signature-256`, creates/updates `BookingEvent`, triggers `leadEnrichment` task.
* `POST /api/webhooks/docuseal` — validates DocuSeal webhook payload, updates `Contract.status = SIGNED`, notifies founder.

---

## Phase 2: Implementation Sequence

1. **Step 1:** Develop `SavingsCalculator.tsx` and mathematical engine for SaaS seat vs FOSS cost calculations.
2. **Step 2:** Build `HeroSection.tsx`, `ProductLadder.tsx`, and `LiveStackDemo.tsx` with live status indicators for the 6 subdomains.
3. **Step 3:** Implement `/book` intake form with progressive disclosure and embedded Cal.com scheduling.
4. **Step 4:** Set up Trigger.dev v3 background job `lead-enrichment-task` (Twenty CRM API lead creation + Telegram notification bot).
5. **Step 5:** Integrate Chatwoot live chat widget loading asynchronously.
6. **Step 6:** Configure `docker-compose.hetzner.yml` with strict memory fencing (`limits.memory` 1.5–2.5GB per container) and Traefik v3 reverse proxy.
7. **Step 7:** Run full E2E validation with Playwright and verify typecheck (`npm run check-types`).
