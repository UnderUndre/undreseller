import { describe, expect, it, vi } from 'vitest'

import { adminOnly } from '@/access/adminOnly'
import { adminOrCustomerOwner } from '@/access/adminOrCustomerOwner'
import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { adminOrSelf } from '@/access/adminOrSelf'
import { hasMinimumRole, ROLE_RANK } from '@/access/roles'
import { isDocumentOwner } from '@/access/isDocumentOwner'
import { SlotReservations } from '@/collections/SlotReservations'
import { Users } from '@/collections/Users'

/** PayloadRequest-shaped fake: access functions only read `req.user`. */
const reqWith = (roles: string[] | null) =>
  ({ req: { user: roles === null ? null : { id: 'u-1', roles } } }) as never

describe('hasMinimumRole — max-hierarchy over role set (TC-001-012)', () => {
  it('ranks roles per ROLE_RANK', () => {
    expect(ROLE_RANK).toEqual({ OWNER: 3, OPERATOR: 2, PERFORMER: 1, customer: 0 })
  })

  it('combined sets resolve to the max rank', () => {
    expect(hasMinimumRole(['PERFORMER', 'customer'], 'PERFORMER')).toBe(true)
    expect(hasMinimumRole(['PERFORMER', 'customer'], 'OPERATOR')).toBe(false)
    expect(hasMinimumRole(['OPERATOR', 'PERFORMER'], 'OPERATOR')).toBe(true)
    expect(hasMinimumRole(['OWNER', 'customer'], 'OWNER')).toBe(true)
  })

  it('guests and stale legacy strings never satisfy any minimum', () => {
    expect(hasMinimumRole(null, 'PERFORMER')).toBe(false)
    expect(hasMinimumRole(undefined, 'PERFORMER')).toBe(false)
    expect(hasMinimumRole([], 'PERFORMER')).toBe(false)
    // Legacy 'admin' rows rank -1 (dev-DB migration concern, spec research D1)
    expect(hasMinimumRole(['admin'], 'PERFORMER')).toBe(false)
    expect(hasMinimumRole(['customer'], 'PERFORMER')).toBe(false)
  })
})

describe('adminOnly — OWNER-only admin-panel access (TC-001-007/008/009)', () => {
  it('OWNER passes; OPERATOR/PERFORMER/customer/guest fail', () => {
    expect(adminOnly(reqWith(['OWNER']))).toBe(true)
    expect(adminOnly(reqWith(['OPERATOR']))).toBe(false)
    expect(adminOnly(reqWith(['PERFORMER']))).toBe(false)
    expect(adminOnly(reqWith(['customer']))).toBe(false)
    expect(adminOnly(reqWith(null))).toBe(false)
  })
})

describe('Users collection admin-root guard (TC-001-007/008)', () => {
  it('access.admin resolves OWNER-only', () => {
    const adminAccess = Users.access!.admin as (args: { req: { user: unknown } }) => boolean
    expect(adminAccess(reqWith(['OWNER']))).toBe(true)
    expect(adminAccess(reqWith(['PERFORMER']))).toBe(false)
    expect(adminAccess(reqWith(null))).toBe(false)
  })

  it('roles field is hidden from customers (TC-001-010 regression gate)', () => {
    const rolesField = Users.fields.find((f) => 'name' in f && f.name === 'roles') as {
      access?: { read?: (args: { req: { user: unknown } }) => boolean }
    }
    const read = rolesField.access!.read!
    expect(read(reqWith(['OWNER']))).toBe(true)
    expect(read(reqWith(['customer']))).toBe(false)
  })
})

describe('composed helpers keep template semantics under OWNER (TC-001-010)', () => {
  it('adminOrSelf: OWNER full access, customer scoped to self', () => {
    expect(adminOrSelf(reqWith(['OWNER']))).toBe(true)
    expect(adminOrSelf(reqWith(['customer']))).toEqual({ id: { equals: 'u-1' } })
    expect(adminOrSelf(reqWith(null))).toBe(false)
  })

  it('adminOrPublishedStatus: OWNER true, guest sees published only', () => {
    expect(adminOrPublishedStatus(reqWith(['OWNER']))).toBe(true)
    expect(adminOrPublishedStatus(reqWith(null))).toEqual({ _status: { equals: 'published' } })
  })

  it('adminOrCustomerOwner: OWNER true, customer scoped to own docs', () => {
    expect(adminOrCustomerOwner(reqWith(['OWNER']))).toBe(true)
    expect(adminOrCustomerOwner(reqWith(['customer']))).toEqual({
      customer: { equals: 'u-1' },
    })
  })

  it('isDocumentOwner: OWNER true, customer filtered, guest denied', () => {
    expect(isDocumentOwner(reqWith(['OWNER']))).toBe(true)
    expect(isDocumentOwner(reqWith(['customer']))).toEqual({
      customer: { equals: 'u-1' },
    })
    expect(isDocumentOwner(reqWith(null))).toBe(false)
  })
})

describe('SlotReservations.status — airtight FSM guard (code F-01/SEC-2 fix-review)', () => {
  it('client cannot create or update status via API field access (Local API overrideAccess still works for 002+ domain service)', () => {
    const statusField = SlotReservations.fields.find(
      (f) => 'name' in f && f.name === 'status'
    ) as { access?: { create?: () => boolean; update?: () => boolean } }
    expect(statusField.access!.create!()).toBe(false)
    expect(statusField.access!.update!()).toBe(false)
  })
})

describe('payload config fail-closed secret (code F-03/SEC-3 fix-review)', () => {
  it('boot config throws without PAYLOAD_SECRET instead of falling back to empty string', async () => {
    const saved = process.env.PAYLOAD_SECRET
    vi.resetModules()
    delete process.env.PAYLOAD_SECRET
    try {
      await expect(import('@/payload.config')).rejects.toThrow('PAYLOAD_SECRET')
    } finally {
      if (saved !== undefined) process.env.PAYLOAD_SECRET = saved
    }
  })
})
