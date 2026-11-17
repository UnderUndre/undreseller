# SpecKit Review: 013-local-ai-triage

**Reviewer**: antigravity
**Reviewed at**: 2026-11-18T12:15:00Z (Round 2 — Post-Remediation Verification)
**Commit**: `e688c75c715a0794715e2c68a5cd6242f963d691`
**Artifacts reviewed**: `spec.md` (rev 1.1), `plan.md` (rev 1.1), `tasks.md`, `data-model.md`, `contracts/local-ai-triage.md`, `quickstart.md`, `research.md`, `business-plan-waiver.md`, `requirements-audit.md`, `qa/{preliminary-rtm,rtm-matrix,test-cases,uat-scenarios,regression-suite}.md`, `.specify/memory/constitution.md`

## Summary

В первом раунде ревью (2026-11-18T12:00:00Z) сверка `013-local-ai-triage` с кодовой базой выявила 8 находок (`1 CRITICAL / 3 HIGH / 3 MEDIUM / 1 LOW`): отсутствие `'ai-triage'` в PG enum `enum_payload_jobs_task_slug` и конфликт `select` vs `varchar` (F1), обход SSRF-гарда через HTTP-редиректы и скобки IPv6 `[::1]` (F2), гонку `ai-triage` с `createPaymentIntent` и `redactBookingCards` при отмене брони (F3), коллизию PII-регулярки `8..19` цифр с диапазонами цен/датами и 21-значным UAE IBAN (F4), ловушку сдвига `updated_at = now()` в `gdprPurge.ts` (F5), отсутствие экранирования `</customer_note>` (F6), схему `AiTriageRecord` и `retries: 0` (F7), а также мелкие неточности в `TC-013-018` и эпиграфе `plan.md` (F8).

Во втором раунде проверена интеграция всех правок в `spec.md` (rev 1.1), `plan.md` (rev 1.1), `data-model.md`, `contracts/local-ai-triage.md`, `research.md`, `tasks.md`, `requirements-audit.md` и `qa/test-cases.md`: **все 8 находок (`F1–F8`) полностью устранены (`RESOLVED`), открытых блокеров `0`, вердикт переведён в `PASS`**.

## Findings & Resolution Round

| ID | Initial Severity | Area | Finding (Round 1) | Resolution Verification (Round 2 — rev 1.1) | Status |
| --- | --- | --- | --- | --- | :---: |
| F1 | CRITICAL | Database / Migration (Lens A, K) | 1) Отсутствие `ALTER TYPE enum_payload_jobs_task_slug / enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'ai-triage'` (падение `22P02`). 2) Рассинхрон `type: 'select'` vs `varchar`. 3) Неполная схема `shop_settings_owner_chat_ids`. | В `spec.md` `FR-1301`, `data-model.md` §1.1/§1.3/§3, `plan.md` и `tasks.md` (`T1304`) зафиксированы: `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'ai-triage'` для обоих job-enum'ов, идемпотентные PG enum'ы `enum_slot_reservations_ai_triage_status` и `enum_shop_settings_ai_delegation_currency` под Payload `select`, а также все 4 системные колонки (`_order`, `_parent_id`, `id varchar PRIMARY KEY`, `chat_id`) и 2 индекса для `shop_settings_owner_chat_ids` с парным `down()`. | **RESOLVED** |
| F2 | HIGH | Security / SSRF (Lens E) | 1) `new URL('http://[::1]:1234/v1').hostname` возвращает `"[::1]"` со скобками. 2) `fetch()` по умолчанию идёт по `301/302` редиректам (`redirect: 'follow'`). 3) Отсутствие безусловного блока `169.254.0.0/16` при `LOCAL_LLM_ALLOW_REMOTE=true`. | В `spec.md` US4/`FR-1304`, `contracts/local-ai-triage.md` §3, `research.md` D4, `tasks.md` (`T1322`) и `TC-013-011` добавлены: снятие квадратных скобок IPv6 (`replace(/^\[|\]$/g, '')`), опция `redirect: 'error'` в `fetch()`, безусловная блокировка `169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`, `0.0.0.0`, `::ffff:...` и URL с `username`/`password` независимо от `LOCAL_LLM_ALLOW_REMOTE`. | **RESOLVED** |
| F3 | HIGH | Concurrency / Lifecycle / GDPR Redaction (Lens C, D, M) | 1) Риск постановки `ai-triage` до `createPaymentIntent` на `PREPAID`/`DEPOSIT`. 2) Гонка с `redactBookingCards`: отправка не-редактируемого follow-up в Telegram после отмены брони (`status = 'RELEASED'`). | В `spec.md` US2/`FR-1302`/`FR-1306`, `data-model.md` §2, `tasks.md` (`T1311`, `T1323`) и `TC-013-019` зафиксировано: постановка `ai-triage` строго после успешного `createPaymentIntent`; claim и финальный `UPDATE` проверяют `status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')`; если бронь перешла в `'RELEASED'`, статус ставится в `'skipped'` и сообщение в `telegram_outbox` не отправляется. | **RESOLVED** |
| F4 | HIGH | PII Sanitizer Accuracy & BVA (Lens A, C, E) | 1) Коллизия `[ID]` (`8..19` цифр через пробел/дефис) с диапазонами цен (`"1000 - 1500 AED"`) и датами (`"2026-11-18"`). 2) Лимит `19` цифр противоречит 23-значному UAE IBAN (`AE` + 21 цифра) в `TC-013-008`. | В `spec.md` `FR-1303`, `tasks.md` (`T1320`) и `TC-013-007`/`TC-013-008` зафиксирован порядок проходов `EMAIL` → `IBAN` (`\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b` → `[ID]`) → `PHONE` → `ID` (`\b\d{8,30}\b` и `4×4` группы карт) с защитой дат и диапазонов цен `1000 - 1500 AED`. | **RESOLVED** |
| F5 | MEDIUM | GDPR Retention (Lens A, M) | Второй отдельный `UPDATE slot_reservations` в `gdprPurge.ts` не сработает из-за `updated_at = now()` в первом `UPDATE` из 008. | В `spec.md` `FR-1307`, `data-model.md` §3 и `tasks.md` (`T1324`) предписано слить `customer_notes = NULL, ai_triage_json = NULL` в существующий оператор `UPDATE slot_reservations` (`src/jobs/gdprPurge.ts:80-87`) с расширенным `WHERE`. | **RESOLVED** |
| F6 | MEDIUM | Security / Prompt Injection (Lens E) | Не описано экранирование `</customer_note>` внутри заметки для `TC-013-010`. | В `spec.md` `FR-1303`, `contracts/local-ai-triage.md` §3 и `tasks.md` (`T1320`) добавлено экранирование `<` → `&lt;` и `>` → `&gt;` внутри `sanitizeForLlm`. | **RESOLVED** |
| F7 | MEDIUM | Contracts & Job Lifecycle (Lens A, D) | Не описан слитый тип `AiTriageRecord` для `ai_triage_json` и не заданы `retries: 0, deleteJobOnComplete: true` на `aiTriageTask`. | В `spec.md` `FR-1305`/`FR-1306`, `data-model.md` §1.1/§2, `contracts/local-ai-triage.md` §3 и `tasks.md` (`T1321`, `T1323`) зафиксированы `AiTriageRecord = TriageExtraction & TriageRouteDecision`, `retries: 0` и `deleteJobOnComplete: true`. | **RESOLVED** |
| F8 | LOW | QA & Documentation Polish (Lens H, I) | Неоднозначность «отклоняет/обрезает» в `TC-013-018` и неканонический эпиграф в `plan.md:3`. | В `FR-1305` и `TC-013-018` зафиксирован строгий `return null` без обрезки; эпиграф в `plan.md:3` заменён на дословную цитату из канонического пака (`Code Review Roasts`). | **RESOLVED** |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.7.2 + `specs/013-local-ai-triage/business-plan-waiver.md` + `UnderUndre/clients/ermak/workaround-audit.md` §6.
- Focus laws / SKU floors checked: Scope Knife (3 роли, 1 сквозной процесс, `app ≤ 500 MB RAM`, 0 новых контейнеров в `docker-compose.yml`, 0 новых npm-зависимостей), Via Negativa из `ermak/workaround-audit.md` §6 (нет AI-OCR паспортов, нет моста в 1С/Zoho/QuickBooks, нет AML, нет auto-approve в FSM).
- Drift: **none** (опциональный env-gated аддон, `skipped` по умолчанию при отсутствии `LOCAL_LLM_BASE_URL`).

## Alternative approaches considered

- **Прямой HTTP-вызов LM Studio без очереди с коротким таймаутом (`1500 ms`) внутри `POST /api/booking`**: отвергнут — деградирует UX бронирования и создаёт риск исчерпания пула соединений при холодном старте модели в VRAM.
- **Редактирование базовой staff-карточки (`editMessageText`) вместо отдельного follow-up сообщения (`priority: 40`)**: отвергнуто — поскольку `outbox-dispatch` работает по крону раз в 30 секунд, на быстрой GPU (`< 1s`) `ai-triage` завершится раньше, чем базовая карточка получит `sent_message_id` от Telegram.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-18T12:15:00Z
commit: e688c75c715a0794715e2c68a5cd6242f963d691
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```
