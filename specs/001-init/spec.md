# Feature Specification: Undreseller Infrastructure, n8n Automation Engine & Dogfooding MVP

**Feature Directory**: `specs/001-init`  
**Repository**: `undreseller`  
**Created**: 2026-08-16  
**Status**: Draft (Clarified)  
**Input**: Business Plan v16.0 (`docs/undreseller-business-plan.md`), Dogfooding Architecture Guide (`specs/001-init/TODO.md`), n8n MCP Integration, UndeRoute Router, and Multi-Project Landing Engine (`undrllanding`).

---

## 1. Executive Context & Vision

**Undreseller** is a Productized Engineering Bureau delivering two core fixed-scope B2B SKUs:
1. **Sprint A: B2B Operations & Workflow Plumbing ($3,500 setup + $500/mo)** — 3 to 5 days delivery.
2. **Sprint B: 14-Day SaaS MVP Factory ($4,900 flat)** — 14 days timeboxed live delivery.

To validate sales at high velocity (via 100 DMs -> 15 Looms -> 1 Close / 2 wks), Undreseller requires a live **Dogfooding Infrastructure Stand** (`demo.undreseller.com` / `app.undreseller.com`) that proves full technical execution during 90-second client Loom teardowns.

---

## 2. System Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
## UNDRESELLER FULL SYSTEM INFRASTRUCTURE TOPOLOGY
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [ Marketing / Outbound ]                                                   │
│  • Landing Page: undrllanding (NEXT_PUBLIC_PROJECT_NAME=undreseller)        │
│  • Subdomain: video.undreseller.com (Loom Teardown Hosting)                 │
│                                                                             │
│  [ Dogfooding SaaS Stand ] (demo.undreseller.com)                           │
│  • Framework: Next.js 15 (App Router, SSR Cookies, Tailwind)                │
│  • Boilerplate: nextjs/saas-starter or boxyhq/saas-starter-kit             │
│  • Auth & DB: Supabase (Auth + RLS Policies + PostgreSQL)                   │
│  • Billing: Stripe Test / Lemon Squeezy MoR                                 │
│                                                                             │
│  [ AI & Operations Pipeline ]                                               │
│  • Router: UndeRoute (OmniRoute base, port 20128/20129, local build context) │
│  • Automation: n8n (Port 5678, NODE_FUNCTION_ALLOW_EXTERNAL=zod)            │
│  • Triage: Claude 3.7 AI via UndeRoute + Zod Dead-Letter Queue              │
│  • Channel: Telegram Bot (@telegram-auth/server + grammY/Novu)              │
│                                                                             │
│  [ Docker Deployment Anchor ]                                               │
│  • Repository: UndeRoute / local-ai-packaged (Compose Profiles)              │
│  • Light Profile: `docker compose --profile client-lite up -d`              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. User Scenarios & Testing

### User Story 1 - Dogfooding Loom Demo Showcase (Priority: P1)

As an Agency Founder recording a 90-second Loom for a LinkedIn lead,  
I want to demonstrate a live running SaaS dashboard (`demo.undreseller.com`) and its backing n8n workflow,  
So that the lead sees immediate proof of Next.js 15 auth, Supabase RLS isolation, Zod payload validation, and Stripe billing.

**Why this priority**: Core deal-closing asset for both $3.5k and $4.9k SKUs. Eliminates client skepticism during cold outreach.

**Independent Test**:  
Access `demo.undreseller.com`, log in via Telegram/Email, click "Trigger Pipeline", verify row appears instantly in Supabase and alert fires in Telegram/Slack.

**Acceptance Scenarios**:
1. **Given** a lead watching the Loom video,  
   **When** the founder triggers a test inbound lead in `demo.undreseller.com`,  
   **Then** n8n validates the payload via Zod, passes it to Claude 3.7 via UndeRoute, upserts to Supabase PostgreSQL, and triggers a Telegram notification with inline keyboard buttons.

---

### User Story 2 - Enterprise Inbound & Dead-Letter Queue (Priority: P2)

As an Operator,  
I want incoming Telegram bot messages and webhooks validated by TypeScript Zod schema nodes in n8n,  
So that malformed payloads route to a Dead-Letter Queue while valid items route to AI scoring and DB upsert.

**Why this priority**: Prevents silent integration crashes during live client executions and provides enterprise-grade error logging.

**Acceptance Scenarios**:
1. **Given** a malformed JSON payload sent to n8n Telegram webhook,  
   **When** processed by the Zod Code Node,  
   **Then** `deadLetterItems` captures the error details, logs timestamp & payload, and sends an admin Telegram alert without stopping the n8n execution engine.

---

### User Story 3 - Multi-Project Landing Engine in `undrllanding` (Priority: P3)

As a Founder,  
I want `undrllanding` to host the `undreseller` landing page under `projects/undreseller/`,  
So that setting `NEXT_PUBLIC_PROJECT_NAME=undreseller` displays the Productized Engineering landing page with 2-SKU pricing ($3.5k/$4.9k) and 14-day SLA guarantees.

**Acceptance Scenarios**:
1. **Given** `NEXT_PUBLIC_PROJECT_NAME=undreseller`,  
   **When** `undrllanding` is deployed or run locally,  
   **Then** it renders the Undreseller Hero, 90s Loom showcase, B2B Automation vs 14-Day SaaS pricing cards, and Upwork Escrow safety badges.

---

## 4. Requirements & Specifications

### Functional Requirements

- **FR-001**: `undreseller` MUST maintain `demo.undreseller.com` as a live Dogfooding SaaS stand built on Next.js 15, Supabase, and Stripe/Lemon Squeezy.
- **FR-002**: Telegram Auth MUST be supported via `@telegram-auth/server` using HMAC-SHA256 signature verification against `TELEGRAM_BOT_TOKEN`.
- **FR-003**: n8n container configuration MUST include `NODE_FUNCTION_ALLOW_EXTERNAL=zod` for pure data schema validation, running in non-root Docker container isolation.
- **FR-004**: n8n workflows MUST implement the dual-output Zod Code Node pattern returning `[validItems, deadLetterItems]`.
- **FR-005**: All AI requests in n8n MUST route through `UndeRoute` proxy (`http://host.docker.internal:20129/v1/chat/completions`) with Linux cross-compatibility (`extra_hosts: ["host.docker.internal:host-gateway"]`).
- **FR-006**: Docker deployment for client environments MUST run selectively via `docker compose --profile client-lite up -d` (running ONLY n8n + Supabase DB + UndeRoute proxy forwarding to Cloud API; heavy Ollama/Qdrant containers remain dormant), ensuring RAM usage < 1.5 GB.
- **FR-007**: `undrllanding` MUST render the Undreseller landing page when `NEXT_PUBLIC_PROJECT_NAME=undreseller` is set.
- **FR-008**: Contract and delivery artifacts MUST generate NACE 62.01 code packages (OpenAPI 3.0 specification, Supabase DDL SQL, Docker Compose Mock) in Git for 1% Georgian small business tax compliance (RS.ge / GAAR).

---

## 5. Success Criteria

- **SC-001**: Dogfooding SaaS stand (`demo.undreseller.com`) boots, authenticates, and triggers n8n pipeline in under 3 seconds.
- **SC-002**: Client lightweight Docker stack (`UndeRoute` + `n8n` + `Supabase`) consumes < 1.5 GB RAM total.
- **SC-003**: n8n Zod Dead-Letter Queue catches 100% of malformed input payloads with zero unhandled crash executions.
- **SC-004**: `undrllanding` builds without errors (`pnpm build`) for `NEXT_PUBLIC_PROJECT_NAME=undreseller`.
