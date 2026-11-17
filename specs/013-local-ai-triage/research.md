# Research & Decisions: 013-local-ai-triage

**Date**: 2026-11-18 · **Feature**: `013-local-ai-triage`

---

## Decision 1: Интеграция с LM Studio через внешний OpenAI-compatible HTTP endpoint (без контейнера в `docker-compose.yml`)

- **Decision**: Использовать уже запущенную на хост-машине **LM Studio** (GPU inference) по стандартному OpenAI-compatible endpoint `POST ${LOCAL_LLM_BASE_URL}/chat/completions` (`http://127.0.0.1:1234/v1` при локальном запуске Node/Next или `http://host.docker.internal:1234/v1` из Docker-контейнера `app`).
- **Rationale**:
  1. Сохраняет строгий инвариант `app ≤ 500 MB RAM` (бизнес-план v2.7.2 §2.5, NFR-103) и не дублирует многогигабайтные веса в `docker-compose.yml`.
  2. Позволяет использовать аппаратное ускорение GPU хоста (топологически оправдано по Conway's Law / heterogeneous hardware: CPU app-монолит vs GPU inference runtime).
  3. Обеспечивает полную автономность (Data Sovereignty): при выключенной или не заданной LM Studio система деградирует gracefully в `skipped`/`failed`.
- **Alternatives considered**:
  - Поднять `ollama` / `llama.cpp` сервис внутри `docker-compose.yml` → **отклонено** пользователем и конфликтует с лёгкостью шаблонного compose.
  - Встроить `node-llama-cpp` внутрь Next.js → **отклонено** (ломает `≤ 500 MB RAM`, добавляет нативные C++ бинарники, нарушает NFR-1302/1304).
  - Облачный OpenAI/Anthropic API → **отклонено** (утечка NDA/клиентских адресов/заметок в стороннее облако).

## Decision 2: Чистый `fetch` + `AbortSignal.timeout` вместо AI SDK

- **Decision**: Реализовать `src/lib/ai/localLlmClient.ts` поверх стандартного `fetch` (канон `src/lib/email/resendAdapter.ts`) с инъекцией `fetchImpl` для тестов.
- **Rationale**: 0 новых runtime-зависимостей (NFR-1302), предсказуемый таймаут (`8000 ms` по умолчанию), нулевой риск supply-chain CVE от тяжёлых SDK.
- **Alternatives considered**: `openai` npm package, `langchain`, `@ai-sdk/openai` → **отклонены** как избыточные для одного `POST /chat/completions`.

## Decision 3: Structured Output (`json_schema` с fallback-конфигом) + чистый парсер

- **Decision**: По умолчанию отправлять `response_format: { type: 'json_schema', json_schema: { name: 'booking_triage', strict: true, schema: ... } }` (поддерживается LM Studio / llama.cpp structured outputs). Предусмотреть `LOCAL_LLM_RESPONSE_FORMAT=json_schema|json_object|text` для старых моделей/шаблонов. В парсере `parseTriageExtraction` зачищать `<think>...</think>` блоки и markdown-оградки перед `JSON.parse`, с не более чем `1` retry при `temperature: 0`.
- **Rationale**: Убирает хрупкий regex-парсинг свободного текста и гарантирует стабильную типизацию под матрицу делегирования.
- **Alternatives considered**: Свободный текст или tool calling → **отклонено** (tool calling нестабилен на малых 3B–7B квантованных моделях, а `json_schema` поддерживается на уровне GBNF-семплера).

## Decision 4: SSRF / Data-Exfiltration Guard на `LOCAL_LLM_BASE_URL`

- **Decision**: Перед каждым HTTP-вызовом `validateLocalLlmUrl` проверяет схему (`http:` / `https:`), отсутствие `username`/`password`, снимает квадратные скобки IPv6 с `url.hostname` (`[::1]` → `::1`), **безусловно** блокирует link-local и cloud metadata адреса (`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`, `0.0.0.0`, `::ffff:...`) даже при `LOCAL_LLM_ALLOW_REMOTE=true`, а по умолчанию разрешает только `localhost`, `127.0.0.0/8`, `::1`, `host.docker.internal` и частные RFC1918 IPv4 (`10.*`, `172.16-31.*`, `192.168.*`). Вызов `fetch` выполняется с `redirect: 'error'`, исключая обход через HTTP `301/302/307/308` редиректы (review F2).
- **Rationale**: Защита от случайного или вредоносного перенаправления PII-чувствительных заметок в публичное облако или на cloud metadata сервис.

## Decision 5: Асинхронный Payload Job + отдельное follow-up сообщение в `telegram_outbox`

- **Decision**: Вынести LLM-инференс в Payload Job `ai-triage` (`src/jobs/aiTriage.ts`, `retries: 0`, `deleteJobOnComplete: true`) с постановкой строго после успешного `createPaymentIntent` и атомарным SQL claim (`pending -> processing` при `status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')`). После завершения отправлять отдельное follow-up `sendMessage` (`priority: 40`) в `telegram_outbox`, только если бронь не перешла в `'RELEASED'` за время инференса (защита от гонки с `redactBookingCards` — review F3).
- **Rationale**: Нулевое влияние на latency `POST /api/booking` (`NFR-1303`), отсутствие гонки с доставкой базовой staff-карты (`editMessageText` мог бы промахнуться до фактической отправки карточки воркером `outboxDispatch`), встроенный retry и idempotency.

---

## Spike Governance (Constitution Principle XI / ISO/IEC/IEEE 12207)

- **Timebox**: `0` дней — отдельный throwaway spike не требуется, так как LM Studio реализует стандартный OpenAI `/v1/chat/completions` и паттерн `fetch`-адаптера + Payload Jobs уже доказан в `resendAdapter.ts` и `bookingEmail.ts`.
- **Quantitative Verification Metrics**:
  - `POST /api/booking` overhead `< 5 ms`;
  - `LOCAL_LLM_TIMEOUT_MS` default `8000 ms` (cap `30000 ms`);
  - `pnpm eval:ai`: Schema Compliance `>= 90%`, PII Leak Count `= 0`, измерение `p50/p95` latency на живой LM Studio.
- **Spike Disposal Path**: Прототипного/чернового кода в ветке нет; вся реализация пишется clean-room по контрактам `contracts/local-ai-triage.md` с покрытием в `tests/int/local-ai-triage.int.spec.ts`.
