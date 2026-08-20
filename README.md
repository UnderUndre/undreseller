# 🌐 Undreseller — Productized Engineering & Turnkey B2B Systems

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-emerald)](https://supabase.com)
[![n8n](https://img.shields.io/badge/n8n-Automation-red)](https://n8n.io)
[![Escrow](https://img.shields.io/badge/Upwork-Direct_Contracts_Escrow-00a82d)](https://www.upwork.com/direct-contracts)

**Undreseller** is an international **Productized Engineering Bureau** supplying production-grade B2B systems and SaaS MVPs within fixed 3–14 day timeboxes at fixed transparent pricing.

---

## ⚡ Core Offers (2 Primary SKUs)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    UNDRESELLER PRODUCTIZED CONVEYOR v16.0                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. SPRINT A: B2B Workflow Plumbing ($3,500 setup + $500/mo)                  │
│    • Delivery: 3 to 5 Business Days                                          │
│    • Stack: n8n Docker + TypeScript Zod Code Nodes + Claude 3.7 + Supabase  │
│                                                                              │
│ 2. SPRINT B (HERO): 14-Day SaaS MVP Factory ($4,900 flat fee)                │
│    • Delivery: 14 Calendar Days Guaranteed                                  │
│    • Stack: Next.js 15 + Supabase Auth & RLS + Stripe / Lemon Squeezy        │
│                                                                              │
│ PAYMENT & CAPITAL RAILS:                                                     │
│    • 100% Capital Protection: Upwork Direct Contracts Escrow (0% fee)        │
│    • Live Onboarding Protocol: Day 14 60-min handover & $1 live transaction │
│    • Legal Handover: NACE 62.01 Standard Code Deliverable (Git + DDL SQL)    │
│    • Warranty: 7-Day Free P1/P2 Bugfix SLA Knife                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

- **Frontend & Auth**: Next.js 15 (App Router, Server Actions), Tailwind CSS, Supabase Auth (SSR Cookies) & Telegram Auth (`@telegram-auth/server`)
- **Backend & Database**: Supabase PostgreSQL + Row Level Security (RLS) + Storage
- **Automation Pipeline**: n8n (`NODE_FUNCTION_ALLOW_EXTERNAL=zod`) + TypeScript Zod Schema Validation + Dead-Letter Queue (DLQ)
- **AI Routing & Orchestration**: Claude 3.7 API via `UndeRoute` (`http://host.docker.internal:20129/v1/chat/completions`)
- **Billing & Escrow**: Stripe / Lemon Squeezy + Upwork Direct Contracts Escrow
- **Testing & E2E**: Playwright end-to-end integration tests

---

## 🚀 Quickstart & Development

### 1. Prerequisites

- **Node.js**: `>=18.x`
- **PostgreSQL / Supabase**
- **Docker Compose**: `v2.20+`

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/undreseller/undreseller.git
cd undreseller

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Running the Dogfooding SaaS Stand

```bash
# Spin up lightweight client profile (n8n + Supabase + UndeRoute proxy)
docker compose --profile client-lite up -d

# Apply database migrations
npx prisma db push

# Start Next.js development server
npm run dev
```

The Dogfooding SaaS Stand will be live at `http://localhost:3000`.

---

## 🔒 OpSec & Financial Safety Protocol

1. **Escrow Deposit (Day 1)**: Client deposits 50% or 100% of sprint budget into Upwork Direct Contracts Escrow (0% fee with Freelancer Plus). Funds remain frozen on neutral ground.
2. **Conveyor Build (Days 1–13)**: Code built on Next.js 15 + Supabase + n8n modules with daily Git commits to client repository.
3. **Live Onboarding Protocol (Day 14)**: 60-minute live session where client inputs production API keys and executes a live $1 billing test run before releasing escrow.
4. **NACE 62.01 Compliance**: Handover includes complete Git source code, OpenAPI 3.0 specification, Supabase DDL SQL migrations, and Docker Compose environment.

---

## 🧪 Testing

```bash
# Update Playwright binaries
npm run playwright:update

# Execute E2E integration tests
npm run test:e2e
```

---

## 🛡️ License

Distributed under the **Apache 2.0 License**. See [`LICENSE`](LICENSE) for more information.
