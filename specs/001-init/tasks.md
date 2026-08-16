# Tasks: Undreseller Infrastructure, n8n Automation Engine & Dogfooding MVP

**Repository**: `undreseller` | **Directory**: `specs/001-init`  
**Created**: 2026-08-16 | **Spec**: [`spec.md`](./spec.md) | **Plan**: [`plan.md`](./plan.md)

---

## Task Breakdown

### Phase 1: Infrastructure & Docker Composition (Priority: P1) [US1]

- [ ] **TASK-101** `[OPS]` `[US1]`: Configure `UndeRoute/docker-compose.yml` to build local source and include `local-ai-packaged` compose sidecars (`client-lite` profile).
- [ ] **TASK-102** `[OPS]` `[US1]`: Configure `n8n` in `local-ai-packaged` with `NODE_FUNCTION_ALLOW_EXTERNAL=zod`.
- [ ] **TASK-103** `[OPS]` `[US1]`: Add `extra_hosts: ["host.docker.internal:host-gateway"]` to `n8n` and `underoute` in compose files for Linux cross-compatibility.
- [ ] **TASK-104** `[E2E]` `[US1]`: Test lightweight deployment `docker compose --profile client-lite up -d` (< 1.5 GB RAM).

---

### Phase 2: Dogfooding SaaS Stand & n8n TG Bot Pipeline (Priority: P1) [US2]

- [ ] **TASK-201** `[FE]` `[US2]`: Fork/setup `demo.undreseller.com` using Next.js 15 + Supabase Auth + Stripe Test Mode.
- [ ] **TASK-202** `[BE]` `[US2]`: Add Telegram Auth (`@telegram-auth/server`) to Next.js auth options with HMAC-SHA256 signature validation.
- [ ] **TASK-203** `[BE]` `[US2]`: Import `tg-lead-triage-workflow.json` into n8n with Zod validation node and Dead-Letter Queue branch.
- [ ] **TASK-204** `[DOC]` `[US2]`: Record 90-second Loom demonstration showing live trigger from SaaS dashboard to n8n, Claude 3.7 scoring, and Supabase upsert.

---

### Phase 3: Undreseller Landing Page & NACE 62.01 Artifacts (Priority: P2) [US3]

- [ ] **TASK-301** `[FE]` `[US3]`: Create `projects/undreseller/` in `undrllanding` with 2 Core SKUs ($3.5k/$4.9k) pricing table and Loom demo player.
- [ ] **TASK-302** `[FE]` `[US3]`: Create `lib/project-config.ts` inspecting `process.env.NEXT_PUBLIC_PROJECT_NAME`.
- [ ] **TASK-303** `[FE]` `[US3]`: Update `app/(default)/page.tsx` to dynamically render Undreseller lander when `NEXT_PUBLIC_PROJECT_NAME=undreseller`.
- [ ] **TASK-304** `[DOC]` `[US3]`: Create Product 0 (SPECIFICATION) Git export templates (OpenAPI 3.0, Supabase DDL SQL, Docker Compose Mock) for NACE 62.01 GAAR compliance.
- [ ] **TASK-305** `[E2E]` `[US3]`: Verify build (`pnpm build`) and deploy to Vercel under `undreseller.com`.

---

## Dependency Graph

```text
TASK-101 → TASK-102 → TASK-103 → TASK-104
TASK-201 → TASK-202 → TASK-203 → TASK-204
TASK-301 → TASK-302 → TASK-303 → TASK-304 → TASK-305
```

---

## Parallel Lanes

| Lane | Assigned Tasks | Agent Domain |
|---|---|---|
| Lane 1 (Docker Infra) | TASK-101, TASK-102, TASK-103, TASK-104 | DevOps (`[OPS]`) |
| Lane 2 (SaaS & n8n) | TASK-201, TASK-202, TASK-203, TASK-204 | Backend (`[BE]`) & Frontend (`[FE]`) |
| Lane 3 (Lander & NACE) | TASK-301, TASK-302, TASK-303, TASK-304, TASK-305 | Frontend (`[FE]`) & Docs (`[DOC]`) |

---

## Agent Summary

| Tag | Count | Description |
|---|---|---|
| `[OPS]` | 3 | Docker Compose, `extra_hosts`, Container configuration |
| `[BE]` | 2 | Next.js HMAC Telegram Auth & n8n Zod Workflow nodes |
| `[FE]` | 4 | Next.js UI components & project config resolver |
| `[E2E]` | 2 | Build verification & integration testing |
| `[DOC]` | 2 | Loom video documentation asset & NACE 62.01 code artifacts |

---

## Definition of Done

- `specs/001-init/spec.md`, `plan.md`, `tasks.md`, and `TODO.md` fully aligned.
- Dogfooding SaaS stand (`demo.undreseller.com`) live and functional.
- NACE 62.01 Git code export templates present for 1% Georgian tax compliance.
- Single Loom video (90s) recorded and embedded on `undreseller.com`.
