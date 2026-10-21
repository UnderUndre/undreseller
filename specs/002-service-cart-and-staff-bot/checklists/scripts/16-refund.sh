#!/usr/bin/env bash
# TC-PAY-01 (FR-019, FR-022): возвраты идут отдельной таблицей RefundOperation
# и не оставляют синтетических отрицательных строк в неизменяемом PaymentEvent.
#
# Два сценария:
#   A. CRYPTO_REIMBURSEMENT — проходит целиком без внешних сервисов.
#      Первый вызов -> 201, Order.refundStatus = REFUNDED.
#      Повтор с тем же idempotencyKey -> 200 и "deduplicated": true.
#   B. TELEGRAM_STARS_REFUND — реальный вызов bot.api.refundStarPayment, для него
#      нужен ЖИВОЙ TELEGRAM_BOT_TOKEN и настоящие telegramUserId + charge id.
#      Без них скрипт шаг B пропускает (заглушка из .env.example только создаст
#      строку RefundOperation со статусом FAILED — это не проверка).
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)" # заказ из 03-web-checkout.sh
PE_BEFORE="$(psql_q "SELECT count(*) FROM \"PaymentEvent\" WHERE \"orderId\" = '$ORDER_ID';")"

echo "== A. Крипто-возмещение =="
RESP="$(admin_api POST "/api/admin/orders/$ORDER_ID/refund" "$(cat <<'JSON'
{
  "kind": "CRYPTO_REIMBURSEMENT",
  "idempotencyKey": "refund_manual_qa_crypto_001",
  "amountMinor": 17500,
  "currency": "USD",
  "actor": "admin_valera",
  "reason": "Overbooked slot resolution",
  "asset": "USDT",
  "network": "TRC20",
  "destination": "TQ1a2b3c4d5e6f7g8h9i0jklmnopqr",
  "networkFeeMinor": 100
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "первый возврат"

REFUND_STATUS="$(psql_q "SELECT \"refundStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
OP_STATUS="$(psql_q "SELECT status FROM \"RefundOperation\" WHERE \"idempotencyKey\" = 'refund_manual_qa_crypto_001';")"
[[ "$REFUND_STATUS" == "REFUNDED" && "$OP_STATUS" == "CONFIRMED" ]] \
  && echo "  [OK]   Order.refundStatus=REFUNDED, RefundOperation.status=CONFIRMED" \
  || { echo "  [FAIL] refundStatus=$REFUND_STATUS, op=$OP_STATUS" >&2; exit 1; }

echo "== Повтор с тем же idempotencyKey =="
RESP="$(admin_api POST "/api/admin/orders/$ORDER_ID/refund" "$(cat <<'JSON'
{
  "kind": "CRYPTO_REIMBURSEMENT",
  "idempotencyKey": "refund_manual_qa_crypto_001",
  "amountMinor": 17500,
  "currency": "USD",
  "actor": "admin_valera",
  "reason": "Overbooked slot resolution",
  "asset": "USDT",
  "network": "TRC20",
  "destination": "TQ1a2b3c4d5e6f7g8h9i0jklmnopqr",
  "networkFeeMinor": 100
}
JSON
)")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "повторный возврат"
printf '%s' "$RESP" | grep -q '"deduplicated":true' \
  && echo "  [OK]   deduplicated=true, второго списания нет" \
  || { echo "  [FAIL] флага deduplicated нет" >&2; exit 1; }

PE_AFTER="$(psql_q "SELECT count(*) FROM \"PaymentEvent\" WHERE \"orderId\" = '$ORDER_ID';")"
[[ "$PE_BEFORE" == "$PE_AFTER" ]] && echo "  [OK]   PaymentEvent не изменился ($PE_AFTER строк)" \
  || { echo "  [FAIL] PaymentEvent вырос с $PE_BEFORE до $PE_AFTER" >&2; exit 1; }

echo "== B. Возврат Telegram Stars =="
: "${TELEGRAM_USER_ID:=}"
: "${TELEGRAM_PAYMENT_CHARGE_ID:=}"
if [[ -z "$TELEGRAM_BOT_TOKEN" || "$TELEGRAM_BOT_TOKEN" == 123456:* || -z "$TELEGRAM_USER_ID" || -z "$TELEGRAM_PAYMENT_CHARGE_ID" ]]; then
  cat <<'NOTE'
  [SKIP] Для реального возврата звёзд нужно четыре вещи (заглушки не годятся):
         1. TELEGRAM_BOT_TOKEN — живой токен от @BotFather, прописан в .env ДО запуска `npm run dev`
         2. TELEGRAM_USER_ID — числовой id клиента, который платил звёздами
         3. TELEGRAM_PAYMENT_CHARGE_ID — telegram_payment_charge_id из успешного платежа
            (приходит в successful_payment, лежит в Order.paymentRef)
         4. перезапущенный dev-сервер, чтобы он перечитал .env
         Затем: TELEGRAM_USER_ID=... TELEGRAM_PAYMENT_CHARGE_ID=... bash 16-refund.sh
NOTE
  exit 0
fi

RESP="$(admin_api POST "/api/admin/orders/$ORDER_ID/refund" "$(cat <<JSON
{
  "kind": "TELEGRAM_STARS_REFUND",
  "idempotencyKey": "refund_manual_qa_stars_001",
  "amountMinor": 17500,
  "currency": "XTR",
  "actor": "admin_valera",
  "reason": "Overbooked slot resolution",
  "telegramUserId": "$TELEGRAM_USER_ID",
  "telegramPaymentChargeId": "$TELEGRAM_PAYMENT_CHARGE_ID"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "возврат звёзд"
OP_STATUS="$(psql_q "SELECT status FROM \"RefundOperation\" WHERE \"idempotencyKey\" = 'refund_manual_qa_stars_001';")"
[[ "$OP_STATUS" == "CONFIRMED" ]] && echo "  [OK]   Telegram вернул звёзды, RefundOperation=CONFIRMED" \
  || { echo "  [FAIL] RefundOperation.status=$OP_STATUS (FAILED значит, Telegram отклонил вызов — смотри errorMessage)" >&2; exit 1; }
