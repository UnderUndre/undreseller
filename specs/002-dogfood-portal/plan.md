# Implementation Plan: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Branch**: `002-dogfood-portal` | **Date**: 2026-10-06 | **Spec**: [`spec.md`](spec.md)  
**Input**: Feature specification from `specs/002-dogfood-portal/spec.md` (Post-Audit Hardening per `reviews/gemini-3.8-flash.md`)

---

## Summary

Разработка и запуск официального портала международного инженерного бюро **UnderUndre** (`underundre.com`) на чистом Next.js 15 App Router с защищенной архитектурой догфудинга:
1. Конверсионный Hero-экран с верифицированным бейджем 3x Salesforce Developer (ссылка на Trailblazer.me / Credly) и калькулятором $30k FOSS-экономии.
2. Интерактивная витрина сервисов (`Twenty CRM`, `Outline`, `Chatwoot`, `Cal.com`, `DocuSeal`) через встраиваемые интерактивные туры (Arcade/Storylane) и живую телеметрию памяти, исключающая запуск параллельного демо-стека на 24GB RAM.
3. Автоматизированный легковесный интейк-конвейер (Cal.com + Inngest Serverless / BullMQ + Twenty CRM API + Telegram Alerts).
4. Шлюз контрактации через Upwork Project Catalog ($490) и прямые договоры DocuSeal со связкой на получение 40% аванса через Stripe/Paddle.
5. Серверный стек на Hetzner CPX42 с обязательным пулером **PgBouncer** ($\le 14.1\text{ GB RAM}$) и сетевым стандартом **Zero-Open-Ports через Cloudflare Tunnel (`cloudflared`)** — категорический запрет на проброс портов в бытовых роутерах (Keenetic).

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS  
**Primary Framework**: Next.js 15 (Pure App Router `/app`) + Tailwind CSS + shadcn/ui  
**Database & Storage**: PostgreSQL 16 + PgBouncer (Connection Pooler max 30) + Prisma ORM  
**Async Task Runner**: Inngest Serverless SDK / BullMQ (с поддержкой автоматических ретраев)  
**Security & Networking**: **Zero-Open-Ports via Cloudflare Tunnel (`cloudflared`)**, strict bridge Docker networks, disabled sleep states  
**Integrations**: Cal.com Embed API, Chatwoot Live Widget, DocuSeal API, Upwork Project Catalog, Stripe / Paddle Invoicing  
**Testing**: Jest + React Testing Library (unit/component), Playwright (E2E flows)  
**Target Platform**: Vercel / Cloudflare Pages (Frontend) + Hetzner CPX42 VPS (Dogfooded FOSS Stack)  
**Performance Goals**: FCP $< 0.8\text{ s}$, LCP $< 1.5\text{ s}$, PageSpeed Score $\ge 95$  
**Security & Constraints**: Изоляция боевых данных за SSO, отсутствие открытых портов в WAN, NACE 62.01 compliance  

---

## Project Structure & Architecture

```text
undreseller/
├── app/                               # Pure Next.js 15 App Router
│   ├── layout.tsx                     # Root layout with Chatwoot widget
│   ├── page.tsx                       # Main landing page (Hero, Calculator, Demo, Ladder)
│   ├── book/
│   │   └── page.tsx                   # Intake form & Cal.com scheduling
│   ├── pricing/
│   │   └── page.tsx                   # Interactive scope calculator & product ladder
│   ├── stacks/
│   │   └── page.tsx                   # Interactive topology & Docker memory specs
│   └── api/
│       ├── leads/
│       │   └── submit/route.ts        # Lead intake ingestion endpoint
│       ├── inngest/route.ts           # Inngest background task handler
│       └── webhooks/
│           ├── calcom/route.ts        # Cal.com booking webhook handler
│           ├── docuseal/route.ts      # DocuSeal contract signed handler
│           └── payment/route.ts       # Stripe/Paddle 40% deposit handler
├── components/
│   ├── landing/
│   │   ├── HeroSection.tsx            # 3x Salesforce verified hook, CTA, badges
│   │   ├── SavingsCalculator.tsx      # Interactive $30k SaaS savings engine
│   │   ├── LiveStackDemo.tsx          # Demo sandbox cards + memory telemetry
│   │   ├── ProductLadder.tsx          # Tripwire $490 (Upwork), Sprint A $3.5k, Sprint B $4.9k
│   │   └── EscrowTrustGate.tsx        # Upwork Project Catalog vs DocuSeal + Stripe
│   ├── booking/
│   │   ├── IntakeForm.tsx             # 4-step qualifying questionnaire
│   │   └── CalComEmbed.tsx            # Inline Cal.com 20-min scheduler
│   └── common/
│       └── ChatwootWidget.tsx         # Embedded self-hosted live chat loader
├── lib/
│   ├── inngest/
│   │   └── client.ts                  # Inngest client and lead-enrichment task
│   ├── integrations/
│   │   ├── twentyCrm.ts               # Twenty CRM GraphQL API client
│   │   ├── docuseal.ts                # DocuSeal contract generator
│   │   ├── telegram.ts                # Telegram Bot alert dispatcher
│   │   └── outline.ts                 # Outline API client for brief generation
│   └── db/
│       └── prisma.ts                  # Prisma Client with PgBouncer connection string
└── docker/
    ├── docker-compose.hetzner.yml     # Production CPX42 compose with PgBouncer & memory limits
    └── seed-reset.sh                  # Nightly demo sandbox reset script (04:00 UTC)
```

---

## Phase 1: Data Model & Contracts

### 1. Database Schema (`prisma/schema.prisma`)
* `Lead`: `id`, `email`, `name`, `company`, `teamSize`, `currentStack` (JSON), `estimatedSavings`, `status` (NEW, QUALIFIED, CALLED, WON, LOST), `crmLeadId`, `createdAt`.
* `IntakeSubmission`: `id`, `leadId`, `projectType` (TRIPWIRE, SPRINT_A, SPRINT_B), `budgetRange`, `timelineDays`, `hostingPreference` (HETZNER, AWS, DIGITALOCEAN), `notes`, `submittedAt`.
* `BookingEvent`: `id`, `leadId`, `calBookingUid`, `startTime`, `endTime`, `meetingUrl`, `status`.
* `Contract`: `id`, `leadId`, `contractType` (UPWORK_CATALOG, DOCUSEAL_DIRECT), `status` (PENDING, SIGNED, DEPOSIT_PAID, COMPLETED), `amount`, `contractUrl`, `depositPaidAt`.

### 2. Integration Webhook Endpoints
* `POST /app/api/webhooks/calcom` — валидация сигнатуры, обновление `BookingEvent`, триггер Inngest события `lead.booked`.
* `POST /app/api/webhooks/docuseal` — валидация подписи, обновление `Contract.status = SIGNED`.
* `POST /app/api/webhooks/payment` — вебхук Stripe/Paddle: перевод `Contract.status = DEPOSIT_PAID`, уведомление фаундера о старте спринта.

---

## Phase 2: Implementation Sequence

1. **Step 1 (App Router Setup):** Инициализация чистой структуры `app/` (Next.js 15) с `layout.tsx` и базовыми стилями Tailwind.
2. **Step 2 (Prisma & PgBouncer):** Определение моделей Prisma и настройка пула соединений PgBouncer.
3. **Step 3 (Landing Components):** Разработка `SavingsCalculator.tsx`, `HeroSection.tsx` с верификацией Credly/Trailblazer и `LiveStackDemo.tsx` с ссылками на изолированные демо-песочницы.
4. **Step 4 (Intake & Booking):** Создание `/app/book/page.tsx` с интейк-формой и виджетом Cal.com.
5. **Step 5 (Inngest Pipeline):** Настройка легковесного воркера Inngest (`lead.created` $\to$ Twenty CRM $\to$ Telegram $\to$ Outline).
6. **Step 6 (Contract & Escrow Gateway):** Подключение прямых ссылок Upwork Project Catalog ($490) и DocuSeal + Stripe вебхуков.
7. **Step 7 (Docker Compose & Memory Fencing):** Сборка `docker-compose.hetzner.yml` с контейнером `pgbouncer` и ночным скриптом сброса демо-баз `seed-reset.sh`.
8. **Step 8 (E2E Verification):** Прогон Playwright тестов и верификация типов (`npm run check-types`).
