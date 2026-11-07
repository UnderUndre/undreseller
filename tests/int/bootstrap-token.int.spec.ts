import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { bootstrapTokenMatches } from '@/access/bootstrapToken'
import { createUserAccess, Users } from '@/collections/Users'

const fakeReq = (headers: Record<string, string>) => ({
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  payload: {
    count: async () => ({ totalDocs: 0 }),
  },
})

describe('bootstrapTokenMatches (FR-201, канон 007 timing-safe)', () => {
  it('fail-closed when env token is unset', () => {
    const saved = process.env.OWNER_BOOTSTRAP_TOKEN
    delete process.env.OWNER_BOOTSTRAP_TOKEN
    try {
      expect(bootstrapTokenMatches('anything')).toBe(false)
      expect(bootstrapTokenMatches(null)).toBe(false)
    } finally {
      if (saved !== undefined) process.env.OWNER_BOOTSTRAP_TOKEN = saved
    }
  })

  it('matches exactly, rejects wrong and length-differing tokens', () => {
    process.env.OWNER_BOOTSTRAP_TOKEN = 'secret-bootstrap-token'
    try {
      expect(bootstrapTokenMatches('secret-bootstrap-token')).toBe(true)
      expect(bootstrapTokenMatches('wrong')).toBe(false)
      expect(bootstrapTokenMatches('secret-bootstrap-token-x')).toBe(false)
      expect(bootstrapTokenMatches(null)).toBe(false)
    } finally {
      delete process.env.OWNER_BOOTSTRAP_TOKEN
    }
  })
})

describe('createUserAccess — fail-closed bootstrap matrix (TC-002-001..003)', () => {
  const saved = process.env.OWNER_BOOTSTRAP_TOKEN

  beforeEach(() => {
    process.env.OWNER_BOOTSTRAP_TOKEN = 'secret-bootstrap-token'
  })
  afterAll(() => {
    if (saved !== undefined) process.env.OWNER_BOOTSTRAP_TOKEN = saved
    else delete process.env.OWNER_BOOTSTRAP_TOKEN
  })

  it('empty instance: valid token → allow (OWNER granted by hook)', async () => {
    const access = createUserAccess as (args: unknown) => Promise<boolean>
    expect(
      await access({ req: fakeReq({ 'x-bootstrap-token': 'secret-bootstrap-token' }) }),
    ).toBe(true)
  })

  it('empty instance: no token → deny (TC-002-002 fail-closed 403, takeover=0)', async () => {
    const access = createUserAccess as (args: unknown) => Promise<boolean>
    expect(await access({ req: fakeReq({}) })).toBe(false)
  })

  it('roles field stays OWNER-editable only (field-level guard unchanged)', () => {
    const rolesField = Users.fields.find((f) => 'name' in f && f.name === 'roles') as {
      access?: { create?: (args: { req: { user: unknown } }) => boolean }
    }
    const create = rolesField.access!.create!
    expect(create({ req: { user: { roles: ['OWNER'] } } })).toBe(true)
    expect(create({ req: { user: { roles: ['customer'] } } })).toBe(false)
  })
})
