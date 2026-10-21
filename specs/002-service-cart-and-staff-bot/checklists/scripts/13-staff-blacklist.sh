#!/usr/bin/env bash
# TC-BOT-STAFF-05 (FR-017): бан клиента за выпрашивание скидки и разбан.
#
# Заводит ОТДЕЛЬНУЮ бронь на телефон +79998887766 (заказ из 03 не трогаем),
# затем:
#   1. staff:blacklist -> заказ CANCELLED с причиной CLIENT_BLOCKED,
#      confirmationStatus НЕ становится STAFF_APPROVED, слот RELEASED,
#      в очередь уходит задача затереть карточку в Telegram.
#   2. новая бронь с тем же телефоном в другом форматировании (+7 (999) 888-77-66)
#      мгновенно даёт 403 {"error":"Access restricted"} — сверка идёт по E.164.
#   3. POST /api/admin/users/unblock снимает блок, и бронь снова проходит.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 9)"
PHONE_RAW="+7 (999) 888-77-66"

echo "== Бронь жертвы бана =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T10:00:00.000Z",
  "customerName": "Скидочник",
  "customerPhone": "+79998887766",
  "customerNotes": "Сделайте скидку 50%, у меня аллергия",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "бронь жертвы"
BAN_ORDER="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | json_get order.id)"

echo "== [В чёрный список] =="
RESP="$(webhook_api "$STAFF_WEBHOOK_SECRET" /api/bot/staff/webhook "$(cat <<JSON
{
  "update_id": $((50000 + RANDOM)),
  "callback_query": {
    "id": "cbq_ban_$RANDOM",
    "from": {"id": $AUTHORIZED_STAFF_USER_ID},
    "message": {"message_id": 52, "chat": {"id": $STAFF_CHAT_ID}},
    "data": "staff:blacklist:$BAN_ORDER"
  }
}
JSON
)")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "blacklist"

ROW="$(psql_q "SELECT o.status || '|' || COALESCE(o.\"cancellationReason\", '') || '|' || o.\"confirmationStatus\" || '|' || r.status FROM \"Order\" o JOIN \"SlotReservation\" r ON r.\"orderId\" = o.id WHERE o.id = '$BAN_ORDER';")"
[[ "$ROW" == "CANCELLED|CLIENT_BLOCKED|PENDING_STAFF_REVIEW|RELEASED" ]] \
  && echo "  [OK]   $ROW (слот освобождён, статус подтверждения не тронут)" \
  || { echo "  [FAIL] ждали CANCELLED|CLIENT_BLOCKED|PENDING_STAFF_REVIEW|RELEASED, получили $ROW" >&2; exit 1; }

echo "== Повторная запись с тем же телефоном в другом формате =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T14:00:00.000Z",
  "customerName": "Скидочник",
  "customerPhone": "$PHONE_RAW",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 403 "$(printf '%s' "$RESP" | http_status)" "повторная запись забаненного"
printf '%s' "$RESP" | grep -q "Access restricted" \
  && echo "  [OK]   Access restricted" || { echo "  [FAIL] текст отказа не тот" >&2; exit 1; }

echo "== Разбан через админку =="
RESP="$(admin_api POST /api/admin/users/unblock "$(cat <<'JSON'
{
  "phone": "+79998887766",
  "actor": "admin_valera",
  "reason": "Клиент извинился и согласился на фиксированный прайс"
}
JSON
)")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "unblock"

echo "== Запись после разбана =="
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T14:00:00.000Z",
  "customerName": "Скидочник",
  "customerPhone": "$PHONE_RAW",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "запись после разбана"
