import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

const payload = await getPayload({ config })

const resource = await payload.create({
  collection: 'resources',
  data: { name: 'Кабинет мастер-1', active: true },
  overrideAccess: true,
})

const svc1 = await payload.create({
  collection: 'products',
  data: {
    title: 'Стрижка (60 мин)',
    slug: 'haircut-60',
    bookable: true,
    durationMin: 60,
    priceInUSD: 30,
    layout: [],
  },
  overrideAccess: true,
})

const svc2 = await payload.create({
  collection: 'products',
  data: {
    title: 'Маникюр (90 мин)',
    slug: 'manicure-90',
    bookable: true,
    durationMin: 90,
    priceInUSD: 50,
    layout: [],
  },
  overrideAccess: true,
})

for (let weekday = 1; weekday <= 7; weekday++) {
  await payload.create({
    collection: 'weekly-hours',
    data: { resourceId: Number(resource.id), weekday, startMin: 0, endMin: 1440 },
    overrideAccess: true,
  })
}

await payload.create({
  collection: 'users',
  data: { email: 'owner@qa.local', password: 'Qa-owner-2026!', name: 'QA Owner', roles: ['OWNER'] },
  overrideAccess: true,
})

console.log('SEED_OK', JSON.stringify({
  resourceId: resource.id,
  svc1: { id: svc1.id, slug: svc1.slug },
  svc2: { id: svc2.id, slug: svc2.slug },
}))
process.exit(0)
