# Tracer Bullet Quickstart: 013-local-ai-triage

**Purpose**: Проверить сквозной локальный контур от `/api/booking` до LM Studio на GPU хоста и `telegram_outbox`.

---

## 1. Pre-flight (LM Studio на хосте)

1. Открой **LM Studio** на хосте, загрузи инструкционную модель (например `Qwen2.5-3B-Instruct` или `Qwen2.5-7B-Instruct` в Q4_K_M).
2. Включи **Local Server** на порту `1234` (`http://127.0.0.1:1234/v1/models` отвечает `200 OK`).
3. В `.env` приложения (или тестовой сессии) задай:
   ```env
   LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
   LOCAL_LLM_MODEL=qwen2.5-7b-instruct
   LOCAL_LLM_TIMEOUT_MS=8000
   LOCAL_LLM_RESPONSE_FORMAT=json_schema
   ```
   *(Если `app` запускается внутри Docker-контейнера, а LM Studio на хосте — используй `http://host.docker.internal:1234/v1`.)*

## 2. Offline Verification (без GPU)

```bash
pnpm validate
pnpm lint
pnpm test:int
```
Все 202+ интеграционных тестов проходят детерминированно через `fetchImpl` mock.

## 3. Live Eval против LM Studio

```bash
pnpm eval:ai
```
Ожидаемый вывод: таблица по ≥ 25 кейсам с `PII Leaks: 0`, `Schema Compliance >= 90%`, `p50/p95 Latency`.

## 4. End-to-End Tracer Bullet (`POST /api/booking` → `ai-triage`)

1. Отправить `POST /api/booking` с `customerNotes: "Протечка под мойкой, ориентир 600 AED, звонить +971 50 123 4567"`.
2. Убедиться, что HTTP-ответ `202`/`201` вернулся немедленно (`≤ 200 ms`).
3. Воркер Payload Jobs запускает `ai-triage`:
   - в LM Studio приходит текст с `[PHONE]` вместо номера;
   - в `slot_reservations` появляется `ai_triage_status = 'done'` и `ai_triage_json.route = 'DELEGATE_OPERATOR'`;
   - в `telegram_outbox` появляется строка `🟢 AI Triage · OPERATOR` с `priority = 40`.
4. Выключить сервер LM Studio, повторить шаг 1 → бронь создаётся успешно, `ai_triage_status = 'failed'`, в `telegram_outbox` попадает fallback `⚠️ AI Triage unavailable`.
