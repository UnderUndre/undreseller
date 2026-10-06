Кореш, на бумаге гладко, а овраг уже в арифметике. Направление верное: двойное демо снято, Keenetic в WAN не торчит, пулер стоит. К продакшену это не готово. «Без бумажки ты какашка» — здесь бумажка есть, сырых замеров `docker stats` под этот композ нет.

## Step 1. Границы

CPX42 — 8 shared AMD EPYC vCPU, 16 GiB, 320 GB local NVMe, без RAID. Это не «16 GB под приложения». Ядро, page cache, dockerd и cgroup-учёт съедают запас до того, как первый контейнер стартовал.

Лимит `mem_limit` — потолок, не резерв. OOM-killer смотрит на сумму анонимной памяти, не на сумму цифр в YAML. Если сумма потолков больше доступной RAM, одновременный упор в лимит валит хост, а не «вежливо» один контейнер.

PgBouncer в transaction mode не хранит session state. `LISTEN/NOTIFY`, advisory locks, `SET`, temp tables, Prisma Migrate через пул — ломаются. Прямой DSN для миграций обязателен.

Cloudflare Tunnel — исходящий коннект. Входящих портов нет, только если firewall это принудительно закрыл и origin IP никогда не светился в DNS. Туннель не прячет датацентр Hetzner и не шифрует трафик от Cloudflare: TLS терминируется на edge.

## Step 2–3. Что не сошлось

Сложение бюджета из спеки:

\[
2.5+3.5+2.0+1.5+1.5+2.5+0.8+0.3 = 14.6\ \text{GB}
\]

В тексте написано \(\le 14.1\) и буфер \(> 1.9\). На 16 GiB после 14.6 остаётся 1.4 GiB, и это до ядра. Арифметика спецификации опровергнута собственной же таблицей.

В бюджет не вошли: `cloudflared`, DocuSeal (официальный пол для мелких PDF — 1 GB), worker-процессы (Chatwoot = Rails + Sidekiq, Twenty = server + worker, Authentik = server + worker), Plane из FR-04. Authentik сам пишет минимум 2 GB на хост под маленькую установку, не «2.0G на всё».

Cal.com с 15 апреля 2026 увёл production-код в приватный репозиторий. Self-host — Cal.diy (MIT), без teams, routing forms и workflows. Спека продолжает писать `Cal.com` как FOSS-контур. Это не косметика: либо Cal.diy и честный scope, либо облачный Cal.com и дырка в тезисе «$0 за место».

Маркеры скама на архитектуре не горят (нет FOMO-таймера). Горят на калькуляторе: FR-03 вычитает \(\$6000\), а Sprint A — \(\$3500 + \$500/\text{мес}\). Год 1 = \(\$9500\), не \(\$6000\). Acceptance-сценарий «\$22,800 экономии» — непроверенная арифметика посадочного места, не замер.

## Step 4. База

Один VPS, один локальный NVMe, один Postgres, один фаундер, нет PITR в tasks. Базовая вероятность «проживёт год без потери лидов» у такого контура низкая не из-за кода, а из-за диска. Hetzner local NVMe не реплицируется сам.

## Forensic table

| Claim | Предел | Статус | Уровень | Идентификатор |
|---|---|---|---|---|
| CPX42 = 16 GB / 8 vCPU / 320 GB NVMe | Shared vCPU, local disk, no RAID | Verified | Level 2 (vendor spec, cross-checked) | sparecores cpx42, 16 GiB / 8 vCPU / 320 GB |
| Бюджет \(\le 14.1\) GB, буфер \(> 1.9\) | Сумма строк = 14.6; ядро не в таблице | Refuted | Level 1 (арифметика спеки) | spec NFR-03 |
| PgBouncer `max_connections=30` спасает от OOM | Пул \(\ne\) `max_connections`; transaction mode ломает session state; Prisma Migrate требует прямой DSN | Partially refuted | Level 1 (Prisma docs) | prisma.io/docs pgbouncer: transaction mode + `pgbouncer=true`, migrate не через пул |
| 150 коннектов = \(>1.2\) GB только на процессы | RSS Postgres двойным счётом включает `shared_buffers`; реальный overhead коннекта ~1.3–7.6 MiB | Inflated | Level 2 | Andres Freund, 2020-10-07, measuring connection overhead |
| Chatwoot 3.5G / Twenty 2.5G хватит на server+worker | Независимых замеров этого композа нет. Сторонний idle Twenty+Chatwoot ~2.1 GB, peak ~3.8 GB без Authentik/Outline/Cal/DocuSeal | Unproven | Level 3 [UNRELIABLE] | use-apify 2026-05-01, не ваш `docker stats` |
| DocuSeal в продукте и не в RAM-заборе | Пол 1 GB RAM на мелкие документы | Refuted (дыра) | Level 2 | docuseal.com/docs/on-premises-server-requirements |
| Tunnel полностью прячет локацию и сканы | Прячет inbound, если нет публичного A и inbound drop. Не прячет AS Hetzner. CF видит plaintext | Partially verified | Level 1 | developers.cloudflare.com tunnel: outbound-only; TLS terminate на edge |
| Authentik + Arcade = GDPR/CCPA закрыты | SSO закрывает UI. Arcade/Storylane — отдельные US-процессоры. Telegram с PII лида — трансфер без DPA в спеке | Refuted | Level 2 (архитектура потоков) | spec US2: Telegram + Outline + Twenty; витрина = Arcade |
| Cal.com self-host как FOSS | Production закрыт 2026-04-15; self-host = Cal.diy без teams/workflows | Refuted | Level 1 (репозиторий + анонс вендора) | github.com/calcom/cal.diy PR #28903; cal.com/blog 2026-04-15 [vendor] |
| PageSpeed \(\ge 95\) при Chatwoot + Cal embed + Arcade + Framer | Сторонние iframe и виджет бьют LCP, если не отложены | Unproven, конфликт NFR-01 с US4 | — | spec NFR-01 vs T-008/T-021 |
| Бэкап / PITR / restore drill | Не существует в spec/plan/tasks | Absent | — | [IDENTIFIER NOT FOUND] |

## Ответы на четыре вопроса

**1. Буфер 1.9 GB и связка Traefik + cloudflared + PgBouncer.** Буфера 1.9 нет, есть ошибка сложения. 30 backend-коннектов сами по себе OOM не делают: это сотни мегабайт, не 1.2 GB. Узкое место другое. Один Postgres на local NVMe под шесть приложений с разным профилем (Rails, Nest, Next, Go-Authentik) — I/O-конкуренция, не «нехватка коннектов». Traefik лишний, если он публикует 80/443: это снова открытый порт. Правильная схема: `cloudflared` → внутренний Traefik, publish пустой, `nftables` drop inbound. Два коннектора `cloudflared`, не один. Миграции — отдельный session/direct DSN, не через transaction pool.

**2. Изоляция и Zero-Open-Ports.** Боевой UI за Authentik — да, PII лидов от анонимного посетителя лендинга так не утечёт, двойное демо правильно убито. GDPR этим не закрыт. Лид идёт в Postgres, Twenty, Outline, Telegram, Cal, Stripe, Inngest (US). Telegram для EU-лида — дыра, не алерт. Arcade/Storylane — новый процессор и куки, не «нулевая утечка». Туннель закрывает Shodan по origin IP только вместе с отсутствием A-записи, ротацией IP если он уже светился, и запретом исходящих прямых коннектов с баннером. Физическую локацию (FSN/NBG/HEL) он не скрывает. Писать «полное сокрытие локации» — обувать пизду в лапти.

**3. Воронка.** Для холодного US/CA B2B четыре шага интейка до календаря — лишнее трение. Низкое трение уже есть: Upwork Project Catalog на \$490. Его надо первым CTA, интейк — после клика или после оплаты tripwire. 40% через вебхук как гейт `ACTIVE` — правильно, если есть идемпотентность и проверка подписи. Калькулятор врёт на retainer: год 1 не \(\$6000\). Бейдж Salesforce без конкретного Trailblazer URL в спеке — неверифицированный крючок. Ссылку в репозиторий, не в маркетинг.

**4. Вердикт.** Не REJECT: Keenetic, двойное демо и голый Postgres без пула убраны правильно. Не PRODUCTION READY.

**[NEEDS MINOR TWEAKS] — только как ярлык из твоего списка. По факту Day-0 блокеры, не полировка.**

Expert Status: TECHNICALLY FLAWED (направление жизнеспособно, выкладка нет).  
Bayesian confidence: 80% на перечисленные дыры, 40% что этот композ уложится в 16 GiB без свопа — замера нет.  
Critical failure mode: один local NVMe без PITR плюс несошедшийся RAM-забор. Диск умер — лиды умерли. Одновременный упор в лимиты — OOM, потому что сумма потолков уже 14.6 до DocuSeal и ядра.

## Day-1, без этого не стартовать

1. Пересчитать забор от `docker stats` на пустом боевом композе, не от желаемых цифр. DocuSeal либо в забор (+1 GB), либо на второй маленький CX/CPX. Cal.com в тексте заменить на Cal.diy и вычеркнуть teams/workflows, либо сознательно взять Cal.com Cloud и убрать его из «\$0 seat». `shared_buffers` 2–4 GB внутри лимита Postgres, не сверху. Swap 4 GB как предохранитель, `memswap_limit` = `mem_limit`, чтобы контейнер умирал сам.
2. `nftables` default drop inbound. Никакого `ports:` у Traefik. Два `cloudflared` connector. Prisma: pooled URL с `pgbouncer=true` и прямой URL только для migrate. Бэкап: `pg_dump` + WAL в Hetzner Storage Box / B2, restore drill до первого лида. Иначе «в системе нет багов, есть только аномалии», и аномалия называется потерянный NVMe.
3. Секреты вебхуков, идемпотентный `event_id`, Telegram без сырого email EU-лида (внутренний id + ссылка в CRM). Регион VPS зафиксировать DE/FI. PageSpeed-цель резать: виджеты `defer` / по клику, иначе NFR-01 против US4, и победит виджет.

«Работает — не трогай» тут не применимо. Оно ещё не работает. Сначала забор и бэкап, потом банкет.