# Business Plan Waiver — 013-local-ai-triage

**Дата**: 2026-11-18 · **Спека**: `specs/013-local-ai-triage/spec.md` · **Прецедент**: 002/003/004/008 (тот же паттерн)

**Reason**: Спека вводит строго опциональный, env-gated внутренний ассистент триажа текстовых заметок клиента через локально запущенную LM Studio на GPU хоста (`skipped` по умолчанию при отсутствии `LOCAL_LLM_BASE_URL`). Ноль коммерческой дельты: ICP, SKU ($4,900 / $6,800 / $8,900 / $349), ценовая лестница, payment rails, Scope Knife (3 роли, 1 сквозной процесс, app ≤ 500 MB RAM, 0 новых контейнеров и 0 новых npm-зависимостей) и brand isolation не меняются.

**Source of truth по бизнесу**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.7.2 — остаётся без изменений; Via Negativa в `spec.md` §1.3 прямо запрещает выход за рамки Scope Knife (паспорта, бухгалтерия, AML, auto-approve).

**Verification**: при ревью убедиться, что все изменения аддитивны, fail-open при отсутствии `LOCAL_LLM_BASE_URL`, не меняют `bookingFsm.ts` и не добавляют сервисов в `docker-compose.yml`.
