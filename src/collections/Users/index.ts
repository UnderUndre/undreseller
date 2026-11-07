import type { CollectionConfig } from 'payload'

import { bootstrapTokenMatches } from '@/access/bootstrapToken'
import { adminOnly } from '@/access/adminOnly'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { publicAccess } from '@/access/publicAccess'
import { adminOrSelf } from '@/access/adminOrSelf'
import { hasMinimumRole } from '@/access/roles'

import { ensureFirstUserIsOwner } from './hooks/ensureFirstUserIsAdmin'

/**
 * Fail-closed bootstrap policy (spec 002-booking-domain US1, research D5):
 * - empty instance (no OWNER): public create is BLOCKED (403) unless the request
 *   carries a valid `X-Bootstrap-Token` — takeover window is exactly zero;
 * - after the OWNER exists: public create is open (customer signup), and the
 *   roles field stays OWNER-editable only.
 */
export const createUserAccess = (async ({ req }) => {
  const owners = await req.payload.count({
    collection: 'users',
    where: { roles: { contains: 'OWNER' } },
  })
  if (owners.totalDocs > 0) return true
  const token = req.headers?.get?.('x-bootstrap-token') ?? null
  return bootstrapTokenMatches(token)
}) as NonNullable<CollectionConfig['access']>['create']

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req: { user } }) => hasMinimumRole(user?.roles, 'OWNER'),
    create: createUserAccess,
    delete: adminOnly,
    read: adminOrSelf,
    unlock: adminOnly,
    update: adminOrSelf,
  },
  admin: {
    group: 'Users',
    defaultColumns: ['name', 'email', 'roles'],
    useAsTitle: 'name',
  },
  auth: {
    tokenExpiration: 1209600,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'select',
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      defaultValue: ['customer'],
      hasMany: true,
      hooks: {
        beforeChange: [ensureFirstUserIsOwner],
      },
      options: [
        {
          label: 'Owner',
          value: 'OWNER',
        },
        {
          label: 'Operator',
          value: 'OPERATOR',
        },
        {
          label: 'Performer',
          value: 'PERFORMER',
        },
        {
          label: 'Customer',
          value: 'customer',
        },
      ],
    },
    {
      name: 'orders',
      type: 'join',
      collection: 'orders',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id', 'createdAt', 'total', 'currency', 'items'],
      },
    },
    {
      name: 'cart',
      type: 'join',
      collection: 'carts',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id', 'createdAt', 'total', 'currency', 'items'],
      },
    },
    {
      name: 'addresses',
      type: 'join',
      collection: 'addresses',
      on: 'customer',
      admin: {
        allowCreate: false,
        defaultColumns: ['id'],
      },
    },
  ],
}
