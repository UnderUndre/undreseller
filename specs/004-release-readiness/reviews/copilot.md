Валера на связи. Прочитал все 5 артефактов и делаю именно критический ревью-аудит, а не "мне нравится". Сразу спойлер: это уже сильно лучше большинства твоих прошлых спеках, но до PASS я бы не пустил в implement.

Вердикт
verdict: HIGH
reviewer: copilot
critical_count: 0
high_count: 7
medium_count: 11
low_count: 4


Причина: критических блокеров уровня "данные гарантированно потеряются" я не увидел, но есть несколько серьёзных архитектурных и продуктовых дыр, которые почти наверняка всплывут во время реализации или первого продового запуска.

Top Findings
F1 — HIGH — Notification fallback не определён для Telegram-only пользователей
Где
FR-409
US2
T032
Проблема

Спека требует:

Telegram failed → email fallback

Но значительная часть клиентов приходит через Telegram и может вообще не иметь email.

Не описано:

email обязателен?
когда собирается?
что делать если email отсутствует?

Сейчас спецификация предполагает существование email, но модель данных этого не гарантирует.

Рекомендация

Добавить явное правило:

If email missing:
- log failure
- mark notification as undeliverable
- surface warning to staff


Или сделать email обязательным для определённых сценариев.

F2 — HIGH — Waitlist может превратиться в спам-машину
Где
FR-420
FR-419
WaitlistEntry
WaitlistOffer
Проблема

Есть ограничение batch <= 10.

Но нет ограничения:

на количество подписок пользователя
на количество уведомлений в день
cooldown между офферами

Сценарий:

1 клиент
50 waitlist entries
20 отмен
200 telegram notifications


Очень быстро получишь muted/banned пользователей.

Рекомендация

Добавить:

max active waitlist entries per user
offer cooldown
daily cap

F3 — HIGH — Any Available Staff конфликтует с персональными предпочтениями клиента
Где
FR-421
US5
Проблема

Алгоритм оптимизирует календарь бизнеса.

Но спецификация не определяет:

если клиент ранее ходил к мастеру A
и A свободен через 2 дня
а мастер B через 1 час
что важнее?


Текущая формулировка:

minimizing fragmentation

Оптимизирует бизнес, но не обязательно конверсию.

Рекомендация

Явно прописать правило ранжирования:

customer preference
>
same performer history
>
soonest slot
>
calendar packing


или официально заявить, что история игнорируется.

F4 — HIGH — Не определён предел hold freeze
Где
FR-404
Проблема

Указано:

e.g. 24h

То есть значение не специфицировано.

Для FSM это опасно.

Если разные разработчики поймут по-разному:

24h
48h
12h


получишь разные реализации.

Рекомендация

Зафиксировать число.

Например:

MAX_CONFIRMING_FREEZE = 24h

F5 — HIGH — Нет стратегии деградации R2
Где
FR-441
US9
Проблема

Контент-админ полностью зависит от:

Cloudflare R2
Presigned upload


Но не описано:

что происходит при недоступности R2
что видит пользователь
можно ли сохранять карточку без фото

Сейчас сценарий:

R2 down
↓
создание услуги потенциально блокируется

Рекомендация

Добавить graceful degradation.

Например:

image optional
retry later
draft save without image

F6 — HIGH — Business Plan Drift
Где

Business Plan v18.4

Проблема

План v18.4 говорит:

онлайн-платежи и сложные платежные сценарии перенесены в следующие релизы

Спека аргументирует что:

004 = post-Sprint-B release

Это разумно.

Но отсутствует обновлённый бизнес-плановый артефакт, где явно зафиксировано появление платежей.

Сейчас есть лёгкий конфликт источников истины.

Рекомендация

Либо:

business-plan-v19


либо отдельный waiver/update документ.

F7 — HIGH — Нет явного SLA для ручных операций
Где
UNDERPAID
RefundOperation
PAID_REQUIRES_RESOLUTION
Проблема

Появилось несколько ручных процессов:

refund
underpaid
late payment


Но нигде не определено:

staff must respond within ?


В одном месте упоминается SLA, но не значение.

Рекомендация

Задать конкретные цифры.

Например:

RefundOperation SLA <= 24h
Underpaid SLA <= 12h

Medium Findings
M1

FR-444 появился в требованиях, но слабо отражён в задачах.

Я не вижу отдельного теста именно для:

expired hold
slot still free
late payment arrives
auto-confirm


Нужен отдельный E2E кейс.

M2

В Key Entities указан:

NotificationDeliveryLog
sent/delivered/failed


Но FR-409 говорит:

accepted/failed


Есть терминологическое расхождение.

M3

US3 говорит:

uk post-launch without code changes


Но tasks содержат только ru/en.

Нужен тест доказательства data-only добавления.

M4

Нет лимита общего количества WaitlistEntry на одного клиента.

M5

Не вижу явно описанной очистки:

WaitlistOffer
EXPIRED
TAKEN


старых записей.

M6

Не определена политика хранения NotificationDeliveryLog после удаления пользователя по GDPR-запросу.

M7

Presigned URL защита описана хорошо, но нет упоминания антивирусной проверки изображений.

M8

Не определены метрики успеха Content Admin:

кроме "10 минут" отсутствуют:

task completion rate
error rate

M9

T059 появился без отражения в spec как отдельное требование.

План содержит новую функциональность аутентификации.

M10

Нет явно описанного поведения при смене дефолтного языка инстанса после создания пользователей.

M11

Не описано как локализуются audit logs и staff notifications.

Constitution / Expand-Contract Audit

Тут наоборот хороший результат.

✅ Additive migration only
 ✅ Expand/Contract присутствует
 ✅ Backfill описан
 ✅ Rollback описан
 ✅ No destructive DDL in 004
 ✅ Prototype disposal прописан
 ✅ Микросервисного безумия нет

С этой стороны засоров почти нет, труба выглядит чистой.

Commercial / GTM Notes

Блять, тут интересный момент.

Платежи действительно конфликтуют с текстом Sprint B в бизнес-плане, но сама спека это честно признаёт и обосновывает как:

post-Sprint-B release


Поэтому я не ставлю CRITICAL.

Но я бы обновил бизнес-план отдельной версией, чтобы не было двух источников истины.

Альтернативы, которые стоило хотя бы рассмотреть
1. Waitlist через reservation window

Сейчас:

notification priority only


Альтернатива:

2-minute reservation window


Отклонена неявно, но её стоило зафиксировать в research.

2. Email-first fallback queue

Сейчас:

TG -> email


Можно было рассмотреть:

TG
SMS/email
staff escalation


для дорогих бронирований.

3. Upload abstraction

Сейчас:

R2 specific


Лучше формально закрепить:

ObjectStorageProvider


чтобы MinIO/S3/R2 были interchangeable.

Финальный вывод

Если как сантехник архитектуры: труба уже не течёт как раньше. Самые опасные протечки из 003 действительно закрыты.

Но до PASS я бы потребовал:

Зафиксировать SLA ручных резолюций.
Уточнить email-fallback без email.
Закрыть waitlist abuse/spam модель.
Зафиксировать точный freeze timeout.
Описать деградацию при отказе R2.
Синхронизировать бизнес-план с платежами.

После этого мой вердикт, вероятно, опустился бы с HIGH до MEDIUM, а затем уже можно добивать остаток до PASS.