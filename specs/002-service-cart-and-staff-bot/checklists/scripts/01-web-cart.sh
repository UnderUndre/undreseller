#!/usr/bin/env bash
# TC-WEB-01 (FR-001, FR-002): серверная сторона корзины.
# Сам CartDrawer проверяется глазами в браузере (см. manual-qa.md) — скрипт
# подтверждает цифры, которые UI должен показать: 60 + 30 = 90 мин, 350 + 150 = 500 USD.
#
# Берёт реальный свободный слот через /api/booking/slots, бронирует обе услуги
# и сверяет totalDurationMin/totalMinor в ответе и в базе.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
SERVICE_30="$(need_state service_30_id)"
DAY="$(next_workday 2)"

echo "== Ищем свободный слот на $DAY =="
SLOTS="$(api GET "/api/booking/slots?itemIds=$SERVICE_60,$SERVICE_30&date=$DAY")"
START="$(printf '%s' "$SLOTS" | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const slots = JSON.parse(raw).slots || [];
    if (!slots.length) process.exit(4);
    process.stdout.write(slots[0].startTime);
  });
')"
echo "  берём $START"

echo "== Бронируем обе услуги =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60", "$SERVICE_30"],
  "startTime": "$START",
  "customerName": "Иван Тестов",
  "customerPhone": "+79991112201",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "POST /api/booking/lock (2 услуги)"

BODY="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d')"
TOTAL="$(printf '%s' "$BODY" | json_get order.totalMinor)"
DURATION="$(printf '%s' "$BODY" | json_get reservation.totalDurationMin)"
ORDER_ID="$(printf '%s' "$BODY" | json_get order.id)"

[[ "$TOTAL" == "50000" ]] && echo "  [OK]   totalMinor = 50000 (\$500.00)" \
  || { echo "  [FAIL] totalMinor = $TOTAL, ждали 50000" >&2; exit 1; }
[[ "$DURATION" == "90" ]] && echo "  [OK]   totalDurationMin = 90" \
  || { echo "  [FAIL] totalDurationMin = $DURATION, ждали 90" >&2; exit 1; }

echo "== Сверка с базой =="
DB_TOTAL="$(psql_q "SELECT \"totalMinor\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
DB_DURATION="$(psql_q "SELECT \"totalDurationMin\" FROM \"SlotReservation\" WHERE \"orderId\" = '$ORDER_ID';")"
[[ "$DB_TOTAL" == "50000" && "$DB_DURATION" == "90" ]] \
  && echo "  [OK]   Order.totalMinor=$DB_TOTAL, SlotReservation.totalDurationMin=$DB_DURATION" \
  || { echo "  [FAIL] в базе totalMinor=$DB_TOTAL duration=$DB_DURATION" >&2; exit 1; }

echo "  заказ: $ORDER_ID (это проверочная бронь, на следующие кейсы не влияет)"
