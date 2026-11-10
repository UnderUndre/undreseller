import io

p = 'tests/int/waitlist.int.spec.ts'
s = io.open(p, encoding='utf-8', newline='').read()

# joinViaService: optional serviceId param
old = ("const joinViaService = async (phone: string, email: string, name = 'WL User'): Promise<number> => {\n"
       "  const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')\n"
       "  const res = await joinWaitlist(payload, {\n"
       "    customerName: name,\n"
       "    customerPhone: phone,\n"
       "    customerEmail: email,\n"
       "    serviceId: svcId,\n"
       "    resourceId: '1',\n"
       "  })\n"
       "  return res.entryId\n"
       "}")
new = ("const joinViaService = async (phone: string, email: string, name = 'WL User', serviceId?: string): Promise<number> => {\n"
       "  const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')\n"
       "  const res = await joinWaitlist(payload, {\n"
       "    customerName: name,\n"
       "    customerPhone: phone,\n"
       "    customerEmail: email,\n"
       "    serviceId: serviceId ?? svcId,\n"
       "    resourceId: '1',\n"
       "  })\n"
       "  return res.entryId\n"
       "}")
assert old in s, 'joinViaService not found'
s = s.replace(old, new, 1)

# FIFO test: dedicated service
old_fifo = ("      // 7 candidates on the BASE service; first 5 by FIFO get notified\n"
            "      for (let i = 1; i <= 7; i++) {\n"
            "        await joinViaService(`+7000000910${i}`, `fifo${i}@example.com`, `FIFO${i}`)\n"
            "      }")
new_fifo = ("      // Dedicated service: matching must only see THIS test's entries.\n"
            "      const own = await seedBookableService()\n"
            "      // 7 candidates: first 5 by FIFO get notified\n"
            "      for (let i = 1; i <= 7; i++) {\n"
            "        await joinViaService(`+7000000910${i}`, `fifo${i}@example.com`, `FIFO${i}`, own)\n"
            "      }")
assert old_fifo in s, 'fifo joins not found'
s = s.replace(old_fifo, new_fifo, 1)
s = s.replace(
    "      await notifySlotFreed(payload, {\n        resourceId: '1',\n        productId: svcId,",
    "      await notifySlotFreed(payload, {\n        resourceId: '1',\n        productId: own,",
    1,
)
s = s.replace(
    "      const out = await matchFreedSlot(payload, {\n        resourceId: '1',\n        productId: svcId,",
    "      const out = await matchFreedSlot(payload, {\n        resourceId: '1',\n        productId: own,",
    1,
)
s = s.replace(
    "      const past = await matchFreedSlot(payload, {\n        resourceId: '1',\n        productId: svcId,",
    "      const past = await matchFreedSlot(payload, {\n        resourceId: '1',\n        productId: own,",
    1,
)

# Race test: dedicated service
old_race = ("  it('STM claim race ×100 → 1 CONFIRMED, 99 re-armed, 0 double-booking (TC-006-007)', async () => {\n"
            "    // 100 waitlist entries on the base service + one freed slot\n"
            "    const entryIds: number[] = []\n"
            "    for (let i = 1; i <= 100; i++) {\n"
            "      entryIds.push(await joinViaService(`+7000000930${String(i).padStart(2, '0')}`, `race${i}@example.com`, `Racer${i}`))\n"
            "    }")
new_race = ("  it('STM claim race ×100 → 1 CONFIRMED, 99 re-armed, 0 double-booking (TC-006-007)', async () => {\n"
            "    // Dedicated service: matching sees only this test's entries.\n"
            "    const own = await seedBookableService()\n"
            "    const entryIds: number[] = []\n"
            "    for (let i = 1; i <= 100; i++) {\n"
            "      entryIds.push(await joinViaService(`+7000000930${String(i).padStart(2, '0')}`, `race${i}@example.com`, `Racer${i}`, own))\n"
            "    }")
assert old_race in s, 'race test not found'
s = s.replace(old_race, new_race, 1)
s = s.replace(
    "    const matched = await matchFreedSlot(payload, { resourceId: '1', productId: svcId, slotStart, slotEnd })",
    "    const matched = await matchFreedSlot(payload, { resourceId: '1', productId: own, slotStart, slotEnd })",
    1,
)

# claim FREE test: dedicated service
old_free = ("  it('claim FREE → CONFIRMED; token matrix: replay → 403, wrong token → 403 (TC-006-009)', async () => {\n"
            "    const entryId = await joinViaService('+70000009401', 'claim1@example.com', 'Claimer')\n"
            "    const slotStart = futureStart(90)\n"
            "    const { matchFreedSlot, claimWaitlistEntry } = await import('@/lib/waitlist/waitlistService')\n"
            "    await matchFreedSlot(payload, {\n"
            "      resourceId: '1',\n"
            "      productId: svcId,")
new_free = ("  it('claim FREE → CONFIRMED; token matrix: replay → 403, wrong token → 403 (TC-006-009)', async () => {\n"
            "    const own = await seedBookableService()\n"
            "    const entryId = await joinViaService('+70000009401', 'claim1@example.com', 'Claimer', own)\n"
            "    const slotStart = futureStart(90)\n"
            "    const { matchFreedSlot, claimWaitlistEntry } = await import('@/lib/waitlist/waitlistService')\n"
            "    await matchFreedSlot(payload, {\n"
            "      resourceId: '1',\n"
            "      productId: own,")
assert old_free in s, 'claim free test not found'
s = s.replace(old_free, new_free, 1)
s = s.replace(
    "    const entry2 = await joinViaService('+70000009402', 'claim2@example.com', 'Claimer2')\n    await matchFreedSlot(payload, {\n      resourceId: '1',\n      productId: svcId,",
    "    const entry2 = await joinViaService('+70000009402', 'claim2@example.com', 'Claimer2', own)\n    await matchFreedSlot(payload, {\n      resourceId: '1',\n      productId: own,",
    1,
)

# sweep test: dedicated service
old_sweep = ("      const svc = await seedBookableService()\n"
             "      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')\n"
             "      // stale notified campaign on a still-free slot → auto-advance\n"
             "      const e1 = await joinViaService('+70000009501', 'adv1@example.com', 'Adv1')\n"
             "      const e2 = await joinViaService('+70000009502', 'adv2@example.com', 'Adv2')\n"
             "      const slot = futureStart(96)\n"
             "      await matchFreedSlot(payload, {\n"
             "        resourceId: '1',\n"
             "        productId: svc,")
new_sweep = ("      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')\n"
             "      // stale notified campaign on a still-free slot → auto-advance (own service)\n"
             "      const own = await seedBookableService()\n"
             "      const e1 = await joinViaService('+70000009501', 'adv1@example.com', 'Adv1', own)\n"
             "      const e2 = await joinViaService('+70000009502', 'adv2@example.com', 'Adv2', own)\n"
             "      const slot = futureStart(96)\n"
             "      await matchFreedSlot(payload, {\n"
             "        resourceId: '1',\n"
             "        productId: own,")
assert old_sweep in s, 'sweep test not found'
s = s.replace(old_sweep, new_sweep, 1)

# unsubscribe test: dedicated service
old_unsub = ("      const svc = await seedBookableService()\n"
             "      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')\n"
             "      const e1 = await joinViaService('+70000009601', 'unsub1@example.com', 'Unsub1')\n"
             "      const e2 = await joinViaService('+70000009602', 'unsub2@example.com', 'Unsub2')\n"
             "      const slot = futureStart(98)\n"
             "      await matchFreedSlot(payload, {\n"
             "        resourceId: '1',\n"
             "        productId: svc,")
new_unsub = ("      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')\n"
             "      const own = await seedBookableService()\n"
             "      const e1 = await joinViaService('+70000009601', 'unsub1@example.com', 'Unsub1', own)\n"
             "      const e2 = await joinViaService('+70000009602', 'unsub2@example.com', 'Unsub2', own)\n"
             "      const slot = futureStart(98)\n"
             "      await matchFreedSlot(payload, {\n"
             "        resourceId: '1',\n"
             "        productId: own,")
assert old_unsub in s, 'unsub test not found'
s = s.replace(old_unsub, new_unsub, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('service isolation done')
