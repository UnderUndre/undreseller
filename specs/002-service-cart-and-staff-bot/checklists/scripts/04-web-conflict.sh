#!/usr/bin/env bash
# TC-WEB-04 (FR-005): защита от двойного бронирования.
# PostgreSQL exclusion constraint slot_resource_no_overlap (SQLSTATE 23P01)
# должен превратиться в HTTP 409, а вторая строка SlotReservation — не создаться.
#
# Сначала занимает 10:00–11:30, потом пытается занять 10:30 — интервалы пересекаются.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 5)"

echo "== Занимаем ${DAY}T10:00:00Z =="
FIRST="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T10:00:00.000Z",
  "customerName": "Первый Клиент",
  "customerPhone": "+79990000010",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$FIRST" | http_status)" "первая бронь"

echo "== Пытаемся занять пересекающееся ${DAY}T10:30:00Z =="
SECOND="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T10:30:00.000Z",
  "customerName": "Конкурент",
  "customerPhone": "+79990000001",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 409 "$(printf '%s' "$SECOND" | http_status)" "пересекающаяся бронь"
printf '%s' "$SECOND" | grep -q "Selected slot has just been taken" \
  && echo "  [OK]   текст ошибки про занятый слот на месте" \
  || { echo "  [FAIL] в ответе нет ожидаемого текста" >&2; exit 1; }

COUNT="$(psql_q "SELECT count(*) FROM \"SlotReservation\" WHERE \"startTime\" = '${DAY}T10:30:00Z';")"
[[ "$COUNT" == "0" ]] && echo "  [OK]   вторая резервация в базе не создана" \
  || { echo "  [FAIL] в базе $COUNT резерваций на 10:30" >&2; exit 1; }
