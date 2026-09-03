# Technical Plan: Undreseller Infrastructure, n8n Automation Engine & Dogfooding MVP

**Repository**: `undreseller` | **Branch**: `001-init` | **Date**: 2026-08-16  
**Spec**: [`spec.md`](./spec.md) | **Business Plan**: [`docs/undreseller-business-plan.md`](../../docs/undreseller-business-plan.md)

---

## 1. Summary & Technical Scope

This plan specifies the implementation steps for setting up Undreseller's complete technical stack:
1. **Dogfooding SaaS Stand (`demo.undreseller.com`)**: Next.js 15 + Supabase + Stripe Test Mode + Telegram Auth (`@telegram-auth/server`).
2. **n8n Automation Engine & TG Bot**: Zod Code Nodes (`NODE_FUNCTION_ALLOW_EXTERNAL=zod`) + Dead-Letter Queue + Claude 3.7 via `UndeRoute`.
3. **Modular Docker Composition**: `docker compose --profile client-lite up -d` anchoring in `UndeRoute` with sidecars in `local-ai-packaged`.
4. **Undreseller Landing Page**: Multi-project setup in `undrllanding` (`projects/undreseller`) configured via `NEXT_PUBLIC_PROJECT_NAME=undreseller`.

---

## 2. Technical Context

- **Frameworks**: Next.js 15 (App Router, Tailwind CSS), n8n (v1.x), UndeRoute (OmniRoute base)
- **Database & Auth**: Supabase PostgreSQL (RLS enabled), NextAuth.js / `@telegram-auth/server`
- **Orchestration**: Docker Compose v2.20+ with profiles (`client-lite`, `n8n`, `supabase`, `ai`)
- **Billing & Rails**: Stripe Test Mode / Lemon Squeezy, Upwork Direct Contracts (0% fee via Freelancer Plus), Payoneer Dual Cards

---

## 3. Implementation Phases

### Phase 1: Modular Docker Stack (`UndeRoute` + `local-ai-packaged`)
- Configure `UndeRoute/docker-compose.yml` to build locally (`build: context: .`) and include `local-ai-packaged` docker-compose.
- Set up `client-lite` profile launching `omniroute` + `n8n` + `supabase` in < 1.5 GB RAM.

### Phase 2: Dogfooding SaaS Stand & n8n TG Bot Pipeline
- Deploy `demo.undreseller.com` from `nextjs/saas-starter` / `undreseller/saas-starter-kit`.
- Implement `tg-lead-triage-workflow.json` in n8n with Zod TypeScript validation node and Dead-Letter queue alerts.
- Connect n8n to `UndeRoute` AI API (`http://host.docker.internal:20129/v1/chat/completions`).

### Phase 3: Undreseller Landing Page & NACE 62.01 / Tech-Barter Artifacts
- Create `projects/undreseller` in `undrllanding` with Hero, 2 Core SKUs ($3.5k/$4.9k) pricing, and 90s Loom demo section.
- Implement project resolver in `lib/project-config.ts` driven by `process.env.NEXT_PUBLIC_PROJECT_NAME`.
- Add Direct Booking Engine widget template and cold outreach pitch assets for local Phase 0 tech-barter bootstrapping (v17.1).
