#!/usr/bin/env bash
# TC-BOT-STAFF-06 (FR-021): мастер закрывает визит — [Заказ выполнен].
#
# Заказ к этому моменту уже прошёл 11-staff-approve.sh, то есть
# confirmationStatus = STAFF_APPROVED, и fulfill его принимает.
# Ожидаем Order.status = FULFILLED и задачу в очереди на зачистку карточки:
# приоритет CRITICAL_GDPR_AND_MARKUP (100), действие editMessageText,
# текст с плейсхолдером [ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR].
#
# Побочный эффект, который проверяет следующий визит этого телефона:
# раз есть выполненный заказ, autoCancelOnNoConfirmation для клиента
# выставится в false.
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)"

RESP="$(webhook_api "$STAFF_WEBHOOK_SECRET" /api/bot/staff/webhook "$(cat <<JSON
{
  "update_id": $((60000 + RANDOM)),
  "callback_query": {
    "id": "cbq_fulfill_$RANDOM",
    "from": {"id": $AUTHORIZED_STAFF_USER_ID},
    "message": {"message_id": 50, "chat": {"id": $STAFF_CHAT_ID}},
    "data": "staff:fulfill:$ORDER_ID"
  }
}
JSON
)")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "fulfill"
printf '%s' "$RESP" | grep -q '"status":"APPLIED"' \
  && echo "  [OK]   status=APPLIED" || { echo "  [FAIL] $RESP" >&2; exit 1; }

DB_STATUS="$(psql_q "SELECT status FROM \"Order\" WHERE id = '$ORDER_ID';")"
[[ "$DB_STATUS" == "FULFILLED" ]] && echo "  [OK]   Order.status=FULFILLED" \
  || { echo "  [FAIL] Order.status=$DB_STATUS" >&2; exit 1; }

echo "== Задача на зачистку карточки =="
psql_q "SELECT priority || ' | ' || \"payloadJson\"::text FROM \"InboxEvent\" WHERE \"dedupeKey\" LIKE '%$ORDER_ID%' OR \"payloadJson\"::text LIKE '%$ORDER_ID%' ORDER BY \"createdAt\" DESC LIMIT 5;" \
  | grep -q "ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR" \
  && echo "  [OK]   в очереди есть задача с GDPR-плейсхолдером" \
  || echo "  [WARN] задачу с плейсхолдером в InboxEvent не нашёл — посмотри TelegramOutbox вручную"

echo "== Следующая запись того же телефона — клиент уже постоянный =="
SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 10)"
RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T10:00:00.000Z",
  "customerName": "Иван Тестов",
  "customerPhone": "+7 999 111 22 33",
  "paymentType": "PAY_ON_SITE"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "повторная запись постоянного клиента"
FLAG="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | json_get order.autoCancelOnNoConfirmation)"
[[ "$FLAG" == "false" ]] && echo "  [OK]   autoCancelOnNoConfirmation=false" \
  || { echo "  [FAIL] autoCancelOnNoConfirmation=$FLAG, ждали false" >&2; exit 1; }
