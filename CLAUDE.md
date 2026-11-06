# Claude Code

This project uses the Payload CMS skill at `.claude/skills/payload/`.
Start with `.claude/skills/payload/SKILL.md` for a quick reference, then see `.claude/skills/payload/reference/` for detailed docs.

## Project: undreseller (Payload reinit, 2026-11-06)

White-label commerce/booking engine on the official Payload Ecommerce Template;
legacy Next15+Prisma line preserved read-only in `../undreseller-legacy`.

## SpecKit pipeline

Feature work runs through the SpecKit contour:

- Constitution: `.specify/memory/constitution.md` (v1.10.1, app-repo adaptation).
- Commands: `.claude/commands/speckit.*` — canon: `/speckit.specify → .clarify → .requirements-audit → .plan → .tasks → .test-design → .analyze → .review (×2 external) → .implement → .qa-signoff`.
- Stage tags: `.specify/scripts/{bash,powershell}/snapshot-stage.{sh,ps1}` (`<stage>/<slug>/v<N>`).
- Governance gates: Principle VI (Cross-AI review, ≥2 external PASS) and XII (QA contour) are NON-NEGOTIABLE.

## Project docs

- Architecture (as-built): `specs/main/architecture.md`
- Requirements map: `specs/main/requirements.md`
- Active feature: `specs/001-reinit-from-payload-ecommerce-template/`

## Commands

```bash
pnpm ii            # install (--ignore-workspace — the only supported install path)
pnpm build         # production build
pnpm lint          # eslint
pnpm validate      # tsc --noEmit
pnpm test:int      # vitest (isolated undreseller_test DB via test.env override)
pnpm test:e2e      # playwright (needs Stripe test keys + `pnpm stripe-webhooks`)
pnpm generate:types  # regenerates src/payload-types.ts (hand edits prohibited)
```

Docker: `docker compose up -d` → Postgres 16 (`undreseller_db` on :5432).
Test DB bootstrap: see `test.env` header.
