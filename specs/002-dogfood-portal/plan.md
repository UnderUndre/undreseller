# Implementation Plan: UnderUndre Dogfooded Agency & Live Portfolio Portal

**Branch**: `002-dogfood-portal` | **Date**: 2026-10-06 | **Spec**: [`spec.md`](spec.md)  
**Input**: Feature specification from `specs/002-dogfood-portal/spec.md` (Post-Audit Hardening per `reviews/gemini-3.8-flash.md`)

---

## Summary

Разработка и запуск официального портала международного инженерного бюро **UnderUndre** (`underundre.com`) на чистом Next.js 15 App Router с защищенной архитектурой догфудинга:
1. Конверсионный Hero-экран с верифицированным бейджем 3x Salesforce Developer (ссылка на Trailblazer.me / Credly) и калькулятором $30k FOSS-экономии (с честным учетом $9,500 расходов Года 1).
2. Интерактивная витрина сервисов (`Twenty CRM`, `Outline`, `Chatwoot`, `Cal.diy`, `DocuSeal`) через встраиваемые интерактивные туры (Arcade/Storylane) и живую телеметрию памяти, исключающая запуск параллельного демо-стека на 24GB RAM.
3. Автоматизированный легковесный интейк-конвейер (Cal.diy + Inngest Serverless / BullMQ + Twenty CRM API + Telegram Alerts без передачи сырых PII).
4. Шлюз контрактации через Upwork Project Catalog ($490) и прямые договоры DocuSeal со связкой на получение 40% аванса через Stripe/Paddle с проверкой `event_id`.
5. Серверный стек на Hetzner CPX42: лимит контейнеров **$\le 13.5\text{ GB RAM}$** при неснижаемом буфере хоста **$>2.5\text{ GB}$**, обязательный пулер **PgBouncer** (max 30), dual DSN для Prisma, автоматический оффсайт-бэкап каждые 6 часов и сетевой стандарт **Zero-Open-Ports через Cloudflare Tunnel (`cloudflared`)** — категорический запрет на проброс портов в бытовых роутерах (Keenetic).

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS  
**Primary Framework**: Next.js 15 (Pure App Router `/app`) + Tailwind CSS + shadcn/ui  
**Database & Storage**: PostgreSQL 16 + PgBouncer (Transaction Pooling max 30) + Dual Prisma DSNs (`DATABASE_URL` + `DIRECT_URL`)  
**Async Task Runner**: Inngest Serverless SDK / BullMQ (с поддержкой автоматических ретраев)  
**Security & Networking**: **Zero-Open-Ports via Cloudflare Tunnel (`cloudflared`)**, `nftables default drop`, bridge Docker networks  
**Disaster Recovery**: Automated 6h encrypted `pg_dump` + WAL offsite backups (Hetzner Storage Box / Backblaze B2, `[P0-05]`)  
**Integrations**: Cal.diy Embed API, Chatwoot Live Widget (отложенная загрузка `requestIdleCallback`), DocuSeal API, Upwork Project Catalog, Stripe / Paddle Invoicing  
**Testing**: Jest + React Testing Library (unit/component), Playwright (E2E flows)  
**Target Platform**: Vercel / Cloudflare Pages (Frontend) + Hetzner CPX42 VPS (Dogfooded FOSS Stack)  
**Performance Goals**: FCP $< 0.8\text{ s}$, LCP $< 1.5\text{ s}$, PageSpeed Score $\ge 95$  
**Security & Constraints**: Изоляция боевых данных за SSO, отсутствие PII в Telegram, NACE 62.01 compliance  

---

## Project Structure & Architecture

```text
undreseller/
├── app/                               # Pure Next.js 15 App Router
│   ├── layout.tsx                     # Root layout with lazy-loaded Chatwoot widget
│   ├── page.tsx                       # Main landing page (Hero, Calculator, Demo, Ladder)
│   ├── book/
│   │   └── page.tsx                   # Intake form & Cal.diy scheduling
│   ├── pricing/
│   │   └── page.tsx                   # Interactive scope calculator & product ladder
│   ├── stacks/
│   │   └── page.tsx                   # Interactive topology & Docker memory specs
│   └── api/
│       ├── leads/
│       │   └── submit/route.ts        # Lead intake ingestion endpoint (via DIRECT_URL)
│       ├── inngest/route.ts           # Inngest background task handler
│       └── webhooks/
│           ├── calcom/route.ts        # Cal.diy booking webhook handler
│           ├── docuseal/route.ts      # DocuSeal contract signed handler
│           └── payment/route.ts       # Stripe/Paddle 40% deposit handler (idempotent event_id)
├── components/
│   ├── landing/
│   │   ├── HeroSection.tsx            # 3x Salesforce verified hook (Trailblazer link), CTA
│   │   ├── SavingsCalculator.tsx      # Interactive $30k SaaS savings engine (Year 1: -$9.5k)
│   │   ├── LiveStackDemo.tsx          # Interactive tour embeds (Arcade/Storylane)
│   │   ├── ProductLadder.tsx          # Tripwire $490 (Upwork), Sprint A $3.5k, Sprint B $4.9k
│   │   └── EscrowTrustGate.tsx        # Upwork Project Catalog vs DocuSeal + Stripe
│   ├── booking/
│   │   ├── IntakeForm.tsx             # 4-step qualifying questionnaire
│   │   └── CalComEmbed.tsx            # Inline Cal.diy 20-min scheduler (deferred load)
│   └── common/
│       └── ChatwootWidget.tsx         # Lazy-loaded self-hosted live chat (requestIdleCallback)
├── lib/
│   ├── inngest/
│   │   └── client.ts                  # Inngest client and lead-enrichment task (sanitized Telegram)
│   ├── integrations/
│   │   ├── twentyCrm.ts               # Twenty CRM GraphQL API client
│   │   ├── docuseal.ts                # DocuSeal contract generator
│   │   ├── telegram.ts                # Telegram Bot alert dispatcher (no PII, Lead ID only)
│   │   └── outline.ts                 # Outline API client for brief generation
│   └── db/
│       └── prisma.ts                  # Prisma Client with dual DSNs (DATABASE_URL + DIRECT_URL)
└── docker/
    ├── docker-compose.hetzner.yml     # Production CPX42 compose with PgBouncer & 13.5GB cap
    ├── cloudflared.yml                # Cloudflare Tunnel zero-open-ports configuration
    └── backup-offsite.sh              # 6-hour automated offsite backup script to B2/Storage Box
```

---

## Phase 1: Data Model & Contracts

### 1. Database Schema (`prisma/schema.prisma`)
* `Lead`: `id`, `email`, `name`, `company`, `teamSize`, `currentStack` (JSON), `estimatedSavings`, `status` (NEW, QUALIFIED, CALLED, WON, LOST), `crmLeadId`, `createdAt`.
* `IntakeSubmission`: `id`, `leadId`, `projectType` (TRIPWIRE, SPRINT_A, SPRINT_B), `budgetRange`, `timelineDays`, `hostingPreference` (HETZNER, AWS, DIGITALOCEAN), `notes`, `submittedAt`.
* `BookingEvent`: `id`, `leadId`, `calBookingUid`, `startTime`, `endTime`, `meetingUrl`, `status`.
* `Contract`: `id`, `leadId`, `contractType` (UPWORK_CATALOG, DOCUSEAL_DIRECT), `status` (PENDING, SIGNED, DEPOSIT_PAID, COMPLETED), `amount`, `contractUrl`, `depositPaidAt`, `eventId`.

### 2. Integration Webhook Endpoints
* `POST /app/api/webhooks/calcom` — валидация сигнатуры, обновление `BookingEvent`, триггер Inngest события `lead.booked`.
* `POST /app/api/webhooks/docuseal` — валидация подписи, обновление `Contract.status = SIGNED`.
* `POST /app/api/webhooks/payment` — вебхук Stripe/Paddle: проверка идемпотентного `eventId`, перевод `Contract.status = DEPOSIT_PAID`, уведомление фаундера о старте спринта.

---

## Phase 2: Implementation Sequence

1. **Step 1 (App Router Setup):** Инициализация чистой структуры `app/` (Next.js 15) с `layout.tsx` и базовыми стилями Tailwind.
2. **Step 2 (Dual Prisma DSNs & PgBouncer):** Настройка `DATABASE_URL` (порт 6432) и `DIRECT_URL` (порт 5432 для миграций).
3. **Step 3 (Landing Components):** Разработка `SavingsCalculator.tsx` (честный расчет Года 1/2), `HeroSection.tsx` с верификацией Credly/Trailblazer и `LiveStackDemo.tsx` с встраиваемыми турами.
4. **Step 4 (Intake & Booking):** Создание `/app/book/page.tsx` с интейк-формой и отложенным виджетом Cal.diy.
5. **Step 5 (Inngest Pipeline):** Настройка воркера Inngest (`lead.created` $\to$ Twenty CRM $\to$ обезличенный Telegram-алерт $\to$ Outline бриф).
6. **Step 6 (Contract & Escrow Gateway):** Подключение прямых ссылок Upwork Project Catalog ($490) и DocuSeal + Stripe вебхуков с проверкой `event_id`.
7. **Step 7 (Docker Compose & Backup):** Сборка `docker-compose.hetzner.yml` с контейнером `pgbouncer`, `cloudflared` и 6-часовым оффсайт-бэкапом `backup-offsite.sh`.
8. **Step 8 (E2E Verification):** Прогон Playwright тестов, замер PageSpeed $\ge 95$ и верификация типов (`npm run check-types`).
