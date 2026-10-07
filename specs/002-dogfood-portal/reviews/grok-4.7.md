Прошлый овраг с сложением засыпан. Новый овраг — в том, где крутится API. Цифры 13.5 сходятся. Контур «Vercel снаружи, Postgres внутри drop» — нет.

\[
2.5+3.0+2.0+1.2+1.0+1.0+2.0+0.5+0.3 = 13.5
\]

На 16 GiB CPX42 буфер хоста 2.5 GiB. Это уже не враньё таблицы. Это ещё не замер `docker stats`.

## Что закрыто

| Прошлый пробой | Сейчас |
|---|---|
| Сумма 14.6 при подписи 14.1 | Закрыто, сумма ровно 13.5 |
| DocuSeal и `cloudflared` мимо забора | В заборе: 1.0 и 0.3 |
| Cal.com как FOSS после 2026-04-15 | В clarifications — Cal.diy MIT; Cloud только на team routing |
| Prisma Migrate через transaction pool | `DATABASE_URL:6432` + `DIRECT_URL:5432` |
| Нет бэкапа | Скрипт 6h + T-027 restore |
| Email лида в Telegram | Lead ID + компания + ссылка в SSO |
| Год 1 как −$6,000 | −$9,500 / год 2+ −$6,000 |
| Виджеты против LCP | `requestIdleCallback` / скролл |
| Keenetic forward | `nftables default drop` + tunnel |

Это уже не «гладко на бумаге». Это частичный фикс. До выкладки далеко.

## Что спека опровергает сама себя

Шапка и US2 живут в прошлой версии. Executive summary и Input всё ещё тащат Plane, Cal.com, Supabase RLS, Trigger.dev. US2 называется «Cal.com Embed», independent test пишет слот в Cal.com, FR-08 — «Cal.com Webhook Handler», роут остался `webhooks/calcom`. Clarifications говорят Cal.diy. Кто это будет кодить, соберёт не то. Пока тело спеки не переписано, clarification — комментарий, не контракт.

`plan.md` отправляет `app/api/leads/submit/route.ts` через `DIRECT_URL`. Это мимо пулера. `DIRECT_URL` нужен миграциям и `pg_dump`, не каждому лиду. Иначе 30 backend-слотов снова жрёт прикладной трафик, ради которого PgBouncer и ставили.

NFR-04 пишет «PITR» и тут же «дамп каждые 6 часов». Это не PITR. Point-in-time — непрерывный `archive_command` / `wal_level=replica`, RPO минуты. Дамп раз в 6 часов — RPO 6 часов. Стандарт `[P0-05: 3-2-1-1-0]` спекой не выполнен: одна оффсайт-копия («Storage Box / B2», не «и»), онлайн, не immutable, ноль ошибок не доказан, пока T-027 не прогнан. Ярлык стандарта на скрипт `pg_dump` — снова бумажка.

## Новый критический разрыв

Technical Context: фронт на Vercel / Cloudflare Pages, база на CPX42, входящие закрыты `nftables`. Serverless-функция на Vercel не откроет TCP на `10.x:5432` и не откроет `:6432`. Туннель по умолчанию тащит HTTP к origin, не сырой Postgres в приватную сеть функции.

Рабочих схемы три, в документах нет ни одной:

- Next.js API и Inngest-хендлер живут на том же CPX42, Vercel — только статика.
- Либо весь App Router на VPS за `cloudflared`, без Vercel-функций.
- Либо отдельный HTTPS API на туннеле, а Vercel ходит только в него. Проброс 5432 в туннель — не вариант.

Пока это не выбрано, dual DSN — строка в `.env`, не архитектура. Inngest Cloud упирается в ту же стену: воркер должен дергать достижимый URL, а код воркера должен видеть базу.

`shared_buffers = 1.5 GB` внутри контейнера 2.0 GB — вторая тесная дыра. На cgroup остаётся ~0.5 GB на `work_mem`, WAL, autovacuum, `maintenance_work_mem`. Сортировка на 30 клиентах валит контейнер Postgres при живом буфере хоста. Для лимита 2 GB разумный потолок `shared_buffers` — 512 MB, кэш отдать хосту через `effective_cache_size`. Сборку образа Cal.diy на этой же коробке не делать: heap сборки просил до 6 GB, рантайм 1.0 GB и так оптимистичен.

Один Redis 0.5 GB на Chatwoot Sidekiq, Twenty, Cal.diy, Outline и Authentik — общий SPOF. Вытеснение ключей Sidekiq выглядит как «пропали письма», не как OOM.

## Forensic table

| Claim | Предел | Статус | Уровень |
|---|---|---|---|
| Лимит контейнеров 13.5 GB, буфер >2.5 | Сумма строк = 13.5 на 16 GiB | Verified как арифметика, Unproven как runtime | Level 1 (сложение) / нет `docker stats` |
| Cal.diy вместо закрытого Cal.com | Вендор закрыл production 2026-04-15, self-host = Cal.diy | Частично: clarifications да, US2/FR-08 нет | Level 1, PR cal.diy #28903 |
| Dual DSN чинит PgBouncer | Migrate — да; submit через `DIRECT_URL` — нет | Частично опровергнуто своим же plan | plan.md, submit route |
| API на Vercel + Postgres за drop | Нет маршрута TCP | Refuted, схемы нет | spec Technical Context vs NFR-02 |
| NFR-04 = PITR и 3-2-1-1-0 | Дамп/6h = RPO 6h, одна онлайн-копия | Refuted | NFR-04 vs T-005 |
| Telegram без PII | Email нет; имя компании всё ещё идентификатор B2B-контакта | Улучшено, не ноль | clarifications |
| PageSpeed ≥ 95 при Arcade на лендинге | Lazy widget не лечит iframe в первом вьюпорте | Unproven, замера в tasks нет | NFR-01 vs T-008 |
| Бейдж Salesforce верифицирован | URL Trailblazer в спеке нет | Unproven | [IDENTIFIER NOT FOUND] |
| Регион VPS DE/FI зафиксирован | Нет | Absent | — |

Arcade/Storylane как US-процессор посетителя лендинга так и не разобран. SSO боевой CRM это не закрывает.

Воронка не тронута. Четыре шага до слота для холодного US/CA — лишнее трение. Upwork $490 по-прежнему не первый CTA.

## Вердикт

Не REJECT: двойное демо, Keenetic, голая арифметика 14.1 и сырой email в Telegram убраны по делу. Не PRODUCTION READY.

**[NEEDS MINOR TWEAKS]** — снова только как ярлык из списка. Дыра с хостингом API не мелочь.

Expert Status: TECHNICALLY FLAWED, направление живое.  
Bayesian confidence: 85% на разрыв Vercel↔private Postgres, 50% что 13.5 GB переживут одновременный старт без свопа — замера нет.  
Critical failure mode: лид пишется функцией, у которой нет маршрута до базы. Бэкап раз в 6 часов на мёртвом NVMe не спасает то, что не записалось.

Day-0, три штуки:

1. Вычеркнуть Vercel-функции из пути лида, либо перенести App Router на CPX42 за туннель. `DATABASE_URL` только для runtime, `DIRECT_URL` только для migrate, Postgres без `ports:` на хост.
2. Переименовать US2/FR-08/роут в Cal.diy. `shared_buffers` 512 MB. Redis не общий для Sidekiq и сессий, либо жёсткий `maxmemory` + `noeviction` на очередях. Сборку Cal.diy делать не на этой коробке.
3. Назвать бэкап честно: RPO 6h, не PITR. Вторая копия и object-lock, алерт если дамп не приехал, T-027 до первого лида. В бейдж — конкретный Trailblazer URL, иначе крючок пустой.

«Обновил» — обновил таблицу. Контракт ещё в двух временах сразу. Пока шапка и US2 спорят с clarifications, это не исполняемая спека, это черновик после ревью.