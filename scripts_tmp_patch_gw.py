import io

p = 'src/lib/booking/bookingService.ts'
s = io.open(p, encoding='utf-8', newline='').read()

# applyGatewayEvent: capture result + released slot, notify after tx
old = (
    "  const now = input.now ?? new Date()\n"
    "  const db: any = payload.db\n"
    "  return await db.drizzle.transaction(async (trx: any) => {"
)
new = (
    "  const now = input.now ?? new Date()\n"
    "  const db: any = payload.db\n"
    "  let releasedSlot: { resourceId: string; productId: string | null; slotStart: Date; slotEnd: Date } | undefined\n"
    "  const outcome = await db.drizzle.transaction(async (trx: any) => {"
)
assert old in s, 'applyGatewayEvent tx opening not found'
s = s.replace(old, new, 1)

# payment_failed release branch: capture slot coords
old_fail = (
    "    // payment_failed: release only an unpaid hold (FSM GATEWAY_FAILED).\n"
    "    if (row.res_status === 'HELD' || row.res_status === 'PAYMENT_PENDING') {\n"
    "      await trx.execute(sql`\n"
    "        UPDATE slot_reservations\n"
    "        SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()\n"
    "        WHERE id = ${row.reservation_id} AND schedule_version = ${row.schedule_version}`)\n"
    "      await trx.execute(\n"
    "        sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${row.order_id}`,\n"
    "      )\n"
    "      await ledger('PROCESSED')\n"
    "      await audit(trx, 'payment.failed-release', 'BOOKING', String(row.reservation_id), { providerRef: input.providerRef })\n"
    "      return { deduped: false, outcome: 'released' as const }\n"
    "    }"
)
new_fail = (
    "    // payment_failed: release only an unpaid hold (FSM GATEWAY_FAILED).\n"
    "    if (row.res_status === 'HELD' || row.res_status === 'PAYMENT_PENDING') {\n"
    "      await trx.execute(sql`\n"
    "        UPDATE slot_reservations\n"
    "        SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()\n"
    "        WHERE id = ${row.reservation_id} AND schedule_version = ${row.schedule_version}`)\n"
    "      await trx.execute(\n"
    "        sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${row.order_id}`,\n"
    "      )\n"
    "      await ledger('PROCESSED')\n"
    "      await audit(trx, 'payment.failed-release', 'BOOKING', String(row.reservation_id), { providerRef: input.providerRef })\n"
    "      releasedSlot = { resourceId: String(row.resource_id), productId: row.item_id, slotStart: new Date(row.start_time), slotEnd: new Date(row.end_time) }\n"
    "      return { deduped: false, outcome: 'released' as const }\n"
    "    }"
)
assert old_fail in s, 'payment_failed branch not found'
s = s.replace(old_fail, new_fail, 1)

# close of the transaction — the function currently ends with the tx return;
# find the closing of applyGatewayEvent: the last `  })\n}` before audit helper
# Instead: patch the SELECT to include item_id
s = s.replace(
    "      SELECT o.id AS order_id, o.amount, o.currency, o.status AS order_status,\n"
    "             sr.id AS reservation_id, sr.status AS res_status, sr.schedule_version,\n"
    "             sr.resource_id, sr.start_time, sr.end_time",
    "      SELECT o.id AS order_id, o.amount, o.currency, o.status AS order_status,\n"
    "             sr.id AS reservation_id, sr.status AS res_status, sr.schedule_version,\n"
    "             sr.resource_id, sr.item_id, sr.start_time, sr.end_time",
    1,
)
# extend row type
s = s.replace(
    "          reservation_id: number\n          res_status: string\n          schedule_version: number\n          resource_id: string\n          start_time: string\n          end_time: string\n        }",
    "          reservation_id: number\n          res_status: string\n          schedule_version: number\n          resource_id: string\n          item_id: string | null\n          start_time: string\n          end_time: string\n        }",
    1,
)

# after the transaction: notify + return outcome. The function's last return is
# `    return { deduped: false, outcome: 'ignored' as const }\n  })\n}` at the end of applyGatewayEvent.
tail_old = "    await ledger('PROCESSED')\n    return { deduped: false, outcome: 'ignored' as const }\n  })\n}"
tail_new = (
    "    await ledger('PROCESSED')\n"
    "    return { deduped: false, outcome: 'ignored' as const }\n"
    "  })\n"
    "  // Waitlist: a payment-failed release frees the slot (best-effort, spec 006 FR-602).\n"
    "  if (outcome.outcome === 'released' && releasedSlot) {\n"
    "    try {\n"
    "      await notifySlotFreed(payload, releasedSlot)\n"
    "    } catch (wlErr: unknown) {\n"
    "      payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (gateway release)' })\n"
    "    }\n"
    "  }\n"
    "  return outcome\n"
    "}"
)
assert tail_old in s, 'applyGatewayEvent tail not found'
s = s.replace(tail_old, tail_new, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('applyGatewayEvent done')
