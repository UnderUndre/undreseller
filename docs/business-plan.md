# Business Plan — Canonical Pointer

> Pointer stub for SpecKit pass-H detection (analyze). This repository intentionally keeps the
> living business plan in the external `undreplans` knowledge repo; this file records the canonical
> location and the hard constraints every spec must honor.

**Canonical**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.5, 2026-10-24)

## v18.5 update — verbatim from canonical (undreplans commit `fe41d57`, 2026-10-24)

> Reproduced here so reviewers scoped to this repository see the actual plan update, not just the pointer.

| Версия | Дата | Изменения | Причина / Источник |
| :--- | :--- | :--- | :--- |
| **v18.5** | 24.10.2026 | **Релиз 004-release-readiness (post-Sprint-B):** онлайн-платежи возвращаются в скоуп продукта — унифицированный провайдер-нейтральный контракт (NOWPayments + Telegram Stars за одним интерфейсом), депозитная политика «без депозита по умолчанию / полная предоплата per-service», FSM брони под крипто-подтверждения. Изменения платёжных рельсов не меняют ICP/SKU/цены: Sprint B остаётся $4,900; платежи — capability уже поставляемого шаблона, а не новый SKU. Также зафиксировано: бренд-иерархия (UnderUndre — публичный бренд, undreseller — внутреннее имя шаблона), флагман-инстанс на shop.underundre.com, лендинг на underundre.com (undrllanding §6.3). | SpecKit Principle VII-B (payment-rails delta) + внешнее ревью Copilot F6; спека `undreseller/specs/004-release-readiness` |

Canonical header: `**Версия:** 18.5 (Release Readiness 004: payments capability, post-Sprint-B)`

## Hard constraints extracted (read as binding for specs 003/004+)

- **Product ladder**: Tripwire $350–$490 → Sprint A $3,500+$500/mo → Sprint B $4,900 (hero, 14-day fixed scope).
- **Sprint B boundary**: booking-first template; 3 roles; ≤1 external API integration; products/sales/online payments deferred to subsequent releases (004 is that subsequent release for payments — unified per FR-401).
- **Operating ceiling**: ≤500 MB RSS per instance; single VPS (Hetzner CPX42); no paid seat licenses; Production Blacklist (no self-hosted mail, no PostHog self-host, no Matrix, no plugin-heavy Nextcloud).
- **White-label isolation**: one instance per business; separate DB/secrets/backups per installation.
- **Demand gate**: 10 paid Tripwires before public sprints (recorded as passed 2026-10-22 in docs/whitelabel-quickstart.md).
- **Brand**: `UnderUndre` is the public brand; `undreseller` is the internal template repo name (see undrllanding spec §6).

Specs must not reopen frozen SKUs, price floors, or the focus gates. Conflicts → `/speckit.business-plan` UPDATE with explicit approval, never silent drift.
