#!/usr/bin/env bash
# TC-SETUP: поднимает стенд и готовит данные, от которых зависят остальные скрипты.
#
# Что делает:
#   1. docker compose up -d postgres и ждёт, пока база ответит
#   2. npm run db:migrate  (все миграции, включая 4 фазы 002)
#   3. npm run db:seed     (ShopSettings, услуга на 60 мин, товар, часы Пн–Пт 09:00–18:00, обед 13:00–14:00)
#   4. POST /api/admin/items — вторая услуга на 30 мин (для корзины 60+30 = 90)
#   5. PUT  /api/admin/settings — чат мастера, список допущенных Telegram ID, шаг сетки 30 мин
#
# Требует запущенный `npm run dev` (шаги 4 и 5 ходят в http://localhost:3000).
# Запускать из любой директории: bash specs/002-.../checklists/scripts/00-preflight.sh
source "$(dirname "$0")/_lib.sh"
cd "$REPO_ROOT"

echo "== 1/5 Postgres =="
docker compose up -d postgres
for _ in $(seq 1 30); do
  docker exec undreseller_db pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-undreseller}" \
    >/dev/null 2>&1 && break
  sleep 2
done

echo "== 2/5 Миграции =="
npm run db:migrate

echo "== 3/5 Сид =="
npm run db:seed

echo "== 4/5 Вторая услуга (30 мин) =="
RESP="$(admin_api POST /api/admin/items "$(cat <<'JSON'
{
  "slug": "express-code-review",
  "title": "Express Code & Security Review",
  "description": "30-minute live review of your repository and database locks.",
  "priceMinor": 15000,
  "starsPrice": 7500,
  "currency": "USD",
  "itemType": "SERVICE",
  "stock": null,
  "durationMin": 30,
  "isActive": true
}
JSON
)")"
STATUS="$(printf '%s' "$RESP" | http_status)"
if [[ "$STATUS" == "201" ]]; then
  echo "  [OK]   услуга создана"
elif printf '%s' "$RESP" | grep -q 'P2002'; then
  echo "  [OK]   услуга уже была (повторный прогон) — беру id из каталога"
else
  echo "$RESP" >&2
  expect_status 201 "$STATUS" "POST /api/admin/items"
fi

# id обеих услуг кладём в .state — их читают 01, 02, 03, 04.
CATALOG="$(api GET /api/catalog)"
printf '%s' "$CATALOG" | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const items = JSON.parse(raw).items;
    const by = (slug) => { const i = items.find((x) => x.slug === slug); if (!i) process.exit(3); return i.id; };
    require("fs").writeFileSync(process.argv[1], by("sovereign-architecture-audit"));
    require("fs").writeFileSync(process.argv[2], by("express-code-review"));
  });
' "$STATE_DIR/service_60_id" "$STATE_DIR/service_30_id"
echo "  услуга 60 мин: $(cat "$STATE_DIR/service_60_id")"
echo "  услуга 30 мин: $(cat "$STATE_DIR/service_30_id")"

echo "== 5/5 Настройки staff-бота =="
RESP="$(admin_api PUT /api/admin/settings "$(cat <<JSON
{
  "slotGridStepMin": 30,
  "confirmationNoticeHours": 24,
  "autoCancelDeadlineHours": 6,
  "autoCancelForNewClients": true,
  "allowPayOnSite": true,
  "prepaymentTiming": "IMMEDIATE",
  "staffDestinationChatId": "$STAFF_CHAT_ID",
  "authorizedStaffUserIds": ["$AUTHORIZED_STAFF_USER_ID"]
}
JSON
)")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "PUT /api/admin/settings"

echo
echo "Стенд готов. Дальше по порядку: 01-web-cart.sh, 02-web-slots.sh, ..."
echo "ВНИМАНИЕ: TELEGRAM_BOT_TOKEN и STAFF_BOT_TOKEN из .env.example — заглушки."
echo "Живые токены нужны только для 09-initdata.sh (HMAC) и 16-refund-stars.sh (реальный возврат звёзд)."
