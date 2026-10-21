# Job Engine Continuity & Self-Hosted Inngest Migration Runbook (`T-110c` / `NFR-007`)

## 1. Architecture Overview

- **Primary Scheduler**: Inngest Cloud (`appointmentReminderJob`, `autoCancelUnconfirmedJob`, `invoiceExpiryJob`, `holdSweep`, `inboxSweep`, `nightlyPurge`).
- **Authoritative Source of Truth**: PostgreSQL (`Order.scheduleVersion`, `Order.invoiceExpiresAt`, `Order.reminderSentAt`, `SlotReservation.startTime`, `SlotReservation.holdExpiresAt`).
- **Independent Deadline Reconciliation Sweeper**: `lib/jobs/deadlineSweeper.ts` (`runPostgresDeadlineReconciliationSweeper` / `runDeadlineSweeperInMemory`) scans PostgreSQL for overdue reminders, confirmation deadlines, and 15-minute invoice expiries and executes the exact same transactional Compare-And-Set (`scheduleVersion`) transitions.

## 2. Outage Recovery & Lag Alerting

1. **Lag Detection**: If any unreconciled deadline is overdue by more than `120,000 ms` (`DEADLINE_LAG_ALERT_THRESHOLD_MS`), the sweeper emits a structured `[DEADLINE_SWEEPER_LAG_ALERT]` warning with `oldestOverdueLagMs`.
2. **Inngest Cloud Outage Drain**: During an Inngest Cloud outage, running `runPostgresDeadlineReconciliationSweeper()` (via cron or CLI) drains all overdue reminders, new-client auto-cancellations, and expired invoices directly from PostgreSQL with zero double-execution upon Inngest recovery (protected by `scheduleVersion` CAS and `reminderSentAt` null checks).

## 3. Self-Hosted Inngest Migration Option (Not Hot Standby)

- Self-hosted Inngest (`inngest/inngest` Docker image) is a **documented and tested migration option**, NOT an automatic hot standby.
- **Migration Procedure**:
  1. Provision self-hosted Inngest container on a dedicated host (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_BASE_URL`).
  2. Drain all pending deadlines via `runPostgresDeadlineReconciliationSweeper()`.
  3. Point application `INNGEST_BASE_URL` and keys to the self-hosted endpoint and redeploy container.
- **Limitations**: In-flight `step.sleepUntil` timers stored in Inngest Cloud do not transfer automatically; PostgreSQL deadline reconciliation sweeper bridges 100% of in-flight timers across the cutover window.
