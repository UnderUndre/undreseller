# SpecKit Code Review Report — undreseller (full codebase)

**Reviewer**: `zcode`
**Reviewed at**: 2026-10-31T15:30:00Z
**Mode**: `Full-codebase audit (not a diff)` — 48 API routes + lib/ domain слои
**Inspected Files**: ~120 (grep-driven sampling по всем доменам + ground-truth чтение ключевых путей)
**Pass Status**: `BLOCKER: 0 | CRITICAL: 0 | HIGH: 1 | WARNING: 3 | SUGGESTION: 2`

> **⚠️ Gate note (Pass 1)**: `specs/006-integrations/qa/signoff-report.md` отсутствует (QA-signoff Gate 8.5 ещё не прогонялся). По регламенту команды это основание REJECT для feature-scoped ревью; ревью выполнено как full-codebase по явному запросу владельца — гейт фиксируется, не обходится молча.

## Что проверено и чисто (Pass 2–5 summary)

- **Webhook-верификация**: Stripe `constructEvent` (SDK timing-safe), NOWPayments HMAC-SHA512 с sorted-keys + length-guard + `timingSafeEqual`, Staff-бот webhook — secret-header + timing-safe (`staffActions.ts:59`). Всё fail-closed при не сконфигурированных секретах.
- **AuthN/AuthZ**: все admin-роуты покрыты `authenticateStaff`/`authenticateAdmin`; foundation-настройки серверно OWNER-only (`settings/route.ts:143`); OAuth 006 — OWNER-gate; refund/purge — ADMIN_TOKEN bearer (fail-closed при отсутствии).
- **SQL**: ноль `$queryRawUnsafe`/`$executeRawUnsafe`; все raw-вызовы — параметризованные tagged templates.
- **Slot-гонки**: транзакции с `pg_advisory_xact_lock` по ресурсу+item + GiST EXCLUDE constraint (003-миграция) — двойная бронь упирается в два барьера.
- **Payments idempotency**: `PaymentEvent` UNIQUE `(provider, providerRef)` + P2002 dedupe на inbox; NOWPayments underpaid-гейт (99% rule) → FSM UNDERPAID, без авто-подтверждения.
- **XSS**: JSON-LD экранирует `<` → `</script>`-инъекция закрыта; email-шаблоны — escape() на всех пользовательских полях; дени-лист логгера покрывает токены/секреты/ПДн.
- **Миграции 006**: аддитивные, `NULLS NOT DISTINCT`, down дропает только новое (guard-тест в lineage).

---

### 1. 🚨 Critical Findings ([BLOCKER] / [CRITICAL])

Не найдено.

---

### 2. ⚠️ High / Performance & Reliability ([HIGH] / [WARNING])

#### [F-01] [HIGH] (Confidence: 88/100) Magic-reschedule HMAC подписывается дефолтным секретом из кода

- **Location:** `lib/bot/magicReschedule.ts:10-15`
- **Failure Scenario:** При отсутствии `STAFF_WEBHOOK_SECRET` **и** `ADMIN_TOKEN` в env подпись magic-ссылок считается ключом `'default-sovereign-reschedule-secret'` — публично известной строкой из репозитория. Злоумышленник, зная `orderId` + `scheduleVersion` (перебираемы по шаблону `ORD-*`), может forge'ить валидно подписанные reschedule-токены для чужих брони. Сегодня consumer токена не существует (время брони не мутируется — консолидация ≤007), так что окно ограничено, но как только reschedule-путь оживёт, это станет рабочим вектором. Соседние проверки (`verifyStaffWebhookSecret`, `authenticateAdmin`) fail-closed — эта единственная fail-open.
- **Proposed Fix:**

```diff
 function getRescheduleSecret(): string {
-  return (
-    process.env.STAFF_WEBHOOK_SECRET ||
-    process.env.ADMIN_TOKEN ||
-    'default-sovereign-reschedule-secret'
-  );
+  const secret = process.env.STAFF_WEBHOOK_SECRET || process.env.ADMIN_TOKEN;
+  if (!secret) {
+    // Fail-closed (canon adminAuth.ts): без секрета подпись невозможна
+    throw new Error('STAFF_WEBHOOK_SECRET or ADMIN_TOKEN required for reschedule links');
+  }
+  return secret;
 }
```

#### [F-02] [WARNING] (Confidence: 85/100) `fulfillPayment` не сверяет сумму платежа с суммой заказа

- **Location:** `lib/payments/fulfillment.ts:55-135`
- **Failure Scenario:** `amountMinor` из webhook записывается в `PaymentEvent`, но нигде не сравнивается с `order.totalMinor`. Для крипты есть 99%-правило, для Stripe/Stars суммы приходят из server-side созданных инвойсов — поэтому эксплуатация требует внутренней рассинхронизации (баг создания инвойса, ручная правка цены после создания сессии, переиспользование orderId). Но инвариант «webhook-верифицированная сумма == total» — канон money-path, и его отсутствие превращает любой такой баг в тихое недополучение денег со статусом PAID.
- **Proposed Fix:**

```diff
+    const amountMatches = amountMinor === order.totalMinor && currency === order.currency;
     let requiresOperatorAction = false;
+    if (!amountMatches) {
+      // Расхождение суммы → ручное разрешение, не тихое PAID (canon UNDERPAID)
+      requiresOperatorAction = true;
+      operatorActionReason = 'AMOUNT_MISMATCH_MANUAL_RESOLUTION';
+      targetOrderStatus = 'PAID_REQUIRES_RESOLUTION';
+    }
```

#### [F-03] [WARNING] (Confidence: 85/100) RESCHEDULE в admin-роуте — принятый, но невыполнимый no-op

- **Location:** `app/api/admin/bookings/[id]/route.ts:10` (enum) — ветки обработки нет (tx покрывает только APPROVE/REJECT/COMPLETE/CANCEL)
- **Failure Scenario:** Оператор/владелец отправляет `action: 'RESCHEDULE'` → zod валиден, роль проходит, транзакция ничего не делает, API отвечает 200 с неизменённым букингом. Пользователь считает бронь перенесённой — она не перенесена (тихая потеря действия, UX/data-integrity дефект). Согласуется с планом 006: «`/api/booking/lock` → 410 уже запланирован отдельным решением ≤007» — до тех пор роут должен честно отвечать 501/422.
- **Proposed Fix:**

```diff
     } else if (action === 'CANCEL') {
       ...
     }
+    if (action === 'RESCHEDULE') {
+      return NextResponse.json(
+        { error: 'RESCHEDULE is not implemented yet (planned <=007 booking-API consolidation)' },
+        { status: 501 }
+      );
+    }
```

#### [F-04] [WARNING] (Confidence: 82/100) Исходящие fetch() без таймаута

- **Location:** `lib/email/emailProvider.ts:64` (Resend), `lib/payments/nowpayments.ts:90` (invoice creation), `lib/bot/whatsappClient.ts:38`
- **Failure Scenario:** Зависший upstream (TCP-connection без RST) → `await fetch` висит минутами: route-handler держит соединение, Inngest-шаг съедает timeout-бюджет, webhook-доставка (p95 ≤5 с, NFR-604) пробивается только ретраями.grammy/stripe SDK имеют свои таймауты — эти три вызова нет.
- **Proposed Fix:**

```diff
-      const res = await fetch(`${this.apiBaseUrl}/emails`, { method: 'POST', headers, body });
+      const res = await fetch(`${this.apiBaseUrl}/emails`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
```

---

### 3. 🧹 Architecture, Tests & Anti-Slop ([SUGGESTION])

#### [F-05] [SUGGESTION] (Confidence: 81/100) Дефолтная соль хеширования delivery-логов

- **Location:** `lib/notifications/deliveryLog.ts:17`
- **Failure Scenario:** `DELIVERY_LOG_SALT || ADMIN_TOKEN || 'undreseller-dl-salt'` — при незаданных env хеш-псевдонимизация контактов в delivery-логе становится тривиально обратимой (словарная атака по телефонам). PCI DSS Req 10 / ISO 27001 канон проекта требует fail-closed.
- **Proposed Fix:** при отсутствии соли — либо отказ логирования, либо `[UNHASHED]`-маркер и алерт при старте (как `ADMIN_TOKEN not configured; failing closed`).

#### [F-06] [SUGGESTION] (Confidence: 80/100) 006: reconcile-sweep пушит только последние 24 ч

- **Location:** `lib/jobs/inngest.ts` (gcal-reconcile), `where.updatedAt: { gte: since }`
- **Failure Scenario:** Бронь, изменённая при лежащем воркере >24 ч назад (долгий простой, NEEDS_REAUTH период), не само-вылечится sweep'ом — GC-событие останется устаревшим до следующего перехода FSM. Риск узкий (single-instance, Inngest-ретраи покрывают большинство), но граница окна произвольна.
- **Proposed Fix:** сравнивать по `updatedAt` последнего успешного пуша (поле на Order) вместо временного окна, либо поднять окно до 7 дней (горизонт слотов) при сохранении take: 50.

---

## VERDICT

```yaml
verdict: MEDIUM
reviewer: zcode
reviewed_at: 2026-10-31T15:30:00Z
critical_count: 0
high_count: 1
warning_count: 3
suggestion_count: 2
```

**REWORK RECOMMENDED (non-blocking)** — Resolve [F-01] (fail-closed секрет) и [F-03] (честный 501 на RESCHEDULE) до следующего релиза; [F-02]/[F-04] — в ближайший спринт. Гейт QA-signoff (Principle XII, Gate 8.5) для 006 всё ещё не пройден — `qa/signoff-report.md` отсутствует.
