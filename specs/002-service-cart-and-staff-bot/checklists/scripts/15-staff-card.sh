#!/usr/bin/env bash
# TC-BOT-STAFF-01 (FR-008): карточка заказа для мастера — что в ней можно писать.
#
# formatStaffOrderCard (lib/bot/staffBot.ts) — чистая функция, поэтому гоняем её
# напрямую через ts-node, без живого Telegram. Контракт:
#   - телефон маскируется: +7 (999) 123-45-67 -> "+7 *** *** 4567"
#   - текст customerNotes в сообщение НЕ попадает, вместо него пометка
#     "Есть примечания — доступно в защищённой админ-панели"
#   - под карточкой кнопки staff:approve/reject/reschedule/blacklist/fulfill:<orderId>
source "$(dirname "$0")/_lib.sh"
cd "$REPO_ROOT"

npx ts-node --compiler-options '{"module":"commonjs"}' -e '
const { formatStaffOrderCard, buildStaffActionKeyboard } = require("./lib/bot/staffBot");

const SECRET_NOTE = "Сделайте скидку 50%, у меня аллергия";
const card = formatStaffOrderCard({
  orderId: "order_manual_qa",
  orderNumber: "ORD-MANUAL",
  serviceTitles: ["Sovereign Architecture Audit"],
  totalDurationMin: 60,
  startTimeIso: "2026-10-22T10:00:00.000Z",
  endTimeIso: "2026-10-22T11:00:00.000Z",
  totalMinor: 35000,
  currency: "USD",
  paymentType: "PAY_ON_SITE",
  customerName: "Иван Тестов",
  customerPhone: "+7 (999) 123-45-67",
  hasCustomerNotes: true,
  isNewClient: true,
});

let failed = 0;
const check = (ok, label) => {
  console.log((ok ? "  [OK]   " : "  [FAIL] ") + label);
  if (!ok) failed++;
};

check(card.includes("+7 *** *** 4567"), "телефон замаскирован: +7 *** *** 4567");
check(!card.includes("123-45-67") && !card.includes("1234567"), "полный номер в карточку не попал");
check(!card.includes(SECRET_NOTE), "текст customerNotes в карточку не попал");
check(card.includes("защищ"), "вместо текста — пометка про защищённую админку");

const callbacks = buildStaffActionKeyboard("order_manual_qa")
  .inline_keyboard.flat().map((b) => b.callback_data);
for (const action of ["approve", "reject", "reschedule", "blacklist", "fulfill"]) {
  check(callbacks.includes("staff:" + action + ":order_manual_qa"), "кнопка staff:" + action);
}

console.log("\n--- карточка, как её увидит мастер ---\n" + card);
process.exit(failed ? 1 : 0);
'
