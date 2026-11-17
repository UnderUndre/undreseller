# Regression & Execution Plan: 013-local-ai-triage

---

## 1. Smoke Suite (P0 — ≤ 15 минут, блокирует merge/deploy)

Обязателен на каждом PR/коммите в ветке реализации (работает оффлайн на mock `fetchImpl`):
- `TC-013-003`: Границы длины `customerNotes` (`0 / 1 / 2000 / 2001`).
- `TC-013-006`: Базовая карточка `hasNotes` и UI-форма.
- `TC-013-007`: `sanitizeForLlm` маскирует телефоны/email/ID, сохраняет суммы.
- `TC-013-011`: SSRF-guard `REMOTE_LLM_FORBIDDEN`.
- `TC-013-014`: Fail-open при таймауте / `ECONNREFUSED`.
- `TC-013-015`: BVA порога делегирования (`1499 / 1500 / 1501`).
- `TC-013-019`: Атомарный claim джобы `ai-triage`.
- `TC-013-020`: Маршрутизация `ownerChatIds` / `staffChatTargets` / пустой список.
- `TC-013-021`: Выключенный контур → `skipped`.
- Гейты: `pnpm validate && pnpm lint && pnpm test:int && pnpm build`.

## 2. Sanity Suite (P1 — ≤ 30 минут, перед финализацией фичи)

- `TC-013-001`, `TC-013-002`: Миграция up/down и field-access контроль.
- `TC-013-004`, `TC-013-012`, `TC-013-013`: Невалидные типы и retry парсера JSON.
- `TC-013-016`, `TC-013-017`, `TC-013-018`: Границы `confidence`, кросс-валюты, лимиты `missingInfo`/`summary`.
- `TC-013-022`: `GET /api/approvals` RBAC и приватность `/api/booking/[id]`.

## 3. Full Regression & Live GPU Eval (P1/P2 — перед приёмкой)

- `TC-013-005`, `TC-013-008`, `TC-013-009`, `TC-013-010`: 007 F5 защита фазы 2, обфусцированные карты, prompt injection.
- `TC-013-023`: GDPR 90d purge.
- `TC-013-024`: Живой прогон `pnpm eval:ai` против LM Studio на GPU хоста (`UAT-001`, `UAT-002`).
