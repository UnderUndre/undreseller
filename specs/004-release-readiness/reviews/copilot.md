Блять, вот это уже похоже на финальную прочистку труб.

Я пересмотрел обновлённые spec.md и tasks.md.

Новый вердикт
verdict: PASS
confidence: 0.90


Большинство замечаний прошлого раунда реально закрыты, а не замазаны текстом.

Что закрылось
✅ H2 waitlist-carousel

Раньше был риск бесконечного цикла:

claim
expire
re-fan-out

claim
expire
re-fan-out
...


Сейчас в FR-433 появился явный ограничитель:

<= 3 waves
или
<= 24h


после чего слот просто остаётся публичным.

Это именно тот предохранительный клапан, которого не хватало.

✅ Login hardening

Теперь есть:

5 failures
→ 15 min lockout


и это попало не только в задачи, но и в FR-427.

То есть защита больше не висит исключительно на таске.

✅ Magic link больше не "магия"

Теперь зафиксировано:

single-use
5 min TTL
newer-link invalidation
OWNER revocable


и в спецификации, и в T018.

✅ Any-available теперь полностью тестируется

Раньше в FR-421 была логика:

history
>
soonest
>
packing


но теста не было.

Теперь в T071 появился отдельный acceptance:

returning customer
beats
sooner stranger


что закрывает рассинхрон требования и реализации.

✅ Email outage теперь описан

Появилось явное поведение:

TG success
+
email failed


не ломает процесс.

Будут:

delivery log
retry
staff warning

✅ Language session edge-case закрыт

Теперь прямо описано:

next request render


без restart session.

✅ Delivery hash salt определён

Появилось:

per-instance salt
env configured


Для релиза этого достаточно.

Осталось ли что-то серьёзное?

Честно?

Из того, что вижу в текущем комплекте файлов:

critical: 0
high: 0
medium: 2-3


Но это уже не релиз-блокеры.

Medium 1

Странность с бизнес-планом.

В одном месте написано:

business-plan v18.4


в другом:

v18.5 changelog added


Теперь это не блокер, потому что remediation явно зафиксировано.

Но я бы перед merge всё равно синхронизировал версии во всех документах.

Medium 2

T017 использует:

scrypt
sessions
cookies


Но нет отдельного security acceptance для:

session fixation


Небольшой риск.

Не критичный.

Medium 3

У тебя уже очень много функционала в 004:

Payments
FSM
i18n
Hybrid TG
Content Admin
Waitlist
Custom fields
GDPR hardening
Design system


Это скорее delivery-риск, а не архитектурный риск.

То есть главный враг теперь не дизайн.

Главный враг:

объём реализации

Самый важный вывод

В прошлых версиях были вещи типа:

непонятно как работает
непонятно кто подтверждает
непонятно что делать при гонках
непонятно кто возвращает деньги


Сейчас практически на любой неприятный вопрос можно ткнуть пальцем в FR и получить конкретный ответ.

Это хороший индикатор зрелости спецификации.

Мой финальный аудит
Architecture: PASS
Data model: PASS
FSM: PASS
Payments: PASS
Migration strategy: PASS
Waitlist: PASS
Security: PASS
Content Admin: PASS
Release readiness: PASS

overall: PASS


Если бы это был мой /speckit.review, я бы уже не требовал новый раунд переписывания спеки. Я бы переводил её в стадию реализации и начинал искать баги уже в коде, а не в документах. 🚿🔧