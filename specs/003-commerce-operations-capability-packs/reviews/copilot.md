Валера-ревьюер говорит прямо: теперь уже могу дать другой вердикт.

После чтения полных файлов моя предыдущая находка про Sprint B scope оказалась частично ложноположительной.

В спеке уже есть защитный механизм:

Tier 1 = US1-US5
Tier 2 = US6-US10
Tier 3 = US11
Capability Packs вынесены за 003.1
План прямо отделяет MVP от последующих фаз.

Поэтому главный риск теперь не scope.

Что я бы реально встроил в merged v2

Из моего аудита остаются только 4 действительно сильные правки.

1. INV-014 Dual Write Divergence

Сейчас есть:

dual write
backfill
cutover
contract

Но нет divergence framework.

Я бы добавил в spec:

### INV-014
Dual-write divergence MUST be detected, auditable, and reconciled.

- Every dual-write operation records:
  - legacyWriteSuccess
  - newWriteSuccess

- Any mismatch creates:
  OperatorAction(DUAL_WRITE_DIVERGENCE)

- Cutover is prohibited while unresolved divergence exists.

- A reconciliation process MUST compare:
  - Item ↔ Offering
  - MessengerContact ↔ Party
  - OrderItem ↔ OrderLine

2. FR-325d Authorization Matrix

Сейчас RBAC размазан между:

spec
contracts
tasks

но отдельного артефакта нет.

Добавить:

FR-325d Authorization Matrix

Every command, endpoint, callback and mutation
MUST have an explicit RBAC matrix.

The matrix is version-controlled.

Changes require review.

3. OperatorAction SLA

Сейчас есть очередь.

Но нет бизнес-SLA.

Добавил бы:

Critical:
  acknowledge <= 15m

High:
  acknowledge <= 4h

Medium:
  acknowledge <= 24h

Low:
  acknowledge <= 72h


И отдельный success criterion.

4. GDPR / Retention

RetentionProfile упоминается.

Но нет минимального жизненного цикла данных.

Добавил бы:

RetentionProfile:

CompletionEvidence:
  configurable

PartyNote:
  configurable

Message projections:
  configurable

AuditEvent:
  immutable

GDPR erase:
  anonymization workflow required

А что я бы НЕ менял

Вот тут важный момент.

После чтения полных документов я бы НЕ принимал свои предыдущие рекомендации про:

НЕ менять

Multi-resource booking.

У тебя уже есть:

Resource.kind
STAFF
ROOM
EQUIPMENT


и CapacityPort абстракция.

Это не баг.

Это Phase-C проблема.

НЕ менять

PaymentPlan.

Он выглядит оправданным.

Потому что бизнес-план продаёт:

депозиты
milestone payments
MVP factory
services

Убирать PaymentPlan сейчас было бы деградацией.

НЕ менять

OperatorAction.

Наоборот.

После полного чтения я считаю это одной из самых сильных частей дизайна.

Новый вердикт

После просмотра полного:

spec.md
plan.md
tasks.md
data_model.md
contracts.md

мой пересмотренный итог:

old_verdict: HIGH

new_verdict: MEDIUM

critical: 0
high: 1
medium: 3
low: 4

main_issue:
  dual_write_reconciliation_missing


Если встроить:

INV-014
FR-325d
OperatorAction SLA
Retention lifecycle

то я бы уже поставил:

verdict: PASS_WITH_MINOR_IMPROVEMENTS
confidence: 0.88


По-простому:

Трубу сейчас рвёт не доменная модель, не PostgreSQL и не бизнес-план. Самый опасный засор остался в миграции 002→003 и отсутствии формального reconciliation слоя для dual-write. Всё остальное выглядит уже как нормальная инженерная полировка, а не архитектурная авария.