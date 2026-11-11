import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  IndentFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { AvailabilityExceptions } from '@/collections/AvailabilityExceptions'
import { AuditEvents } from '@/collections/AuditEvents'
import { Blacklist } from '@/collections/Blacklist'
import { BookingIntents } from '@/collections/BookingIntents'
import { Categories } from '@/collections/Categories'
import { EmailDeliveryLog } from '@/collections/EmailDeliveryLog'
import { InboxEvent } from '@/collections/InboxEvent'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { PaymentEvents } from '@/collections/PaymentEvents'
import { WaitlistEntries } from '@/collections/WaitlistEntries'
import { TelegramOutbox } from '@/collections/TelegramOutbox'
import { TgLink } from '@/collections/TgLink'
import { Resources } from '@/collections/Resources'
import { SlotReservations } from '@/collections/SlotReservations'
import { Users } from '@/collections/Users'
import { WeeklyHours } from '@/collections/WeeklyHours'
import { Footer } from '@/globals/Footer'
import { Header } from '@/globals/Header'
import { ShopSettings } from '@/globals/ShopSettings'
import { bookingEmailTask, reminderSweepTask } from '@/jobs/bookingEmail'
import { gdprPurgeTask } from '@/jobs/gdprPurge'
import { holdSweepTask } from '@/jobs/holdSweep'
import { intentSweepTask } from '@/jobs/intentSweep'
import { waitlistMatchTask, waitlistSweepTask } from '@/jobs/waitlistJobs'
import { outboxDispatchTask } from '@/jobs/outboxDispatch'
import { plugins } from './plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeLogin` statement on line 15.
      beforeLogin: ['@/components/BeforeLogin#BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below and the import `BeforeDashboard` statement on line 15.
      beforeDashboard: ['@/components/BeforeDashboard#BeforeDashboard'],
    },
    user: Users.slug,
  },
  collections: [
    Users,
    Pages,
    Categories,
    Media,
    SlotReservations,
    Resources,
    WeeklyHours,
    AvailabilityExceptions,
    AuditEvents,
    // 003 money-path contours (review F3: explicit registration)
    InboxEvent,
    PaymentEvents,
    EmailDeliveryLog,
    // 004 telegram contours
    TelegramOutbox,
    TgLink,
    Blacklist,
    // 006 waitlist (review F7: registered, slug waitlist-entries)
    WaitlistEntries,
    // 007 trust gate (slug booking-intents — F2 naming canon, adminOnly)
    BookingIntents,
  ],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  editor: lexicalEditor({
    features: () => {
      return [
        UnderlineFeature(),
        BoldFeature(),
        ItalicFeature(),
        OrderedListFeature(),
        UnorderedListFeature(),
        LinkFeature({
          enabledCollections: ['pages'],
          fields: ({ defaultFields }) => {
            const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
              if ('name' in field && field.name === 'url') return false
              return true
            })

            return [
              ...defaultFieldsWithoutUrl,
              {
                name: 'url',
                type: 'text',
                admin: {
                  condition: ({ linkType }) => linkType !== 'internal',
                },
                label: ({ t }) => t('fields:enterURL'),
                required: true,
              },
            ]
          },
        }),
        IndentFeature(),
        EXPERIMENTAL_TableFeature(),
      ]
    },
  }),
  //email: nodemailerAdapter(),
  endpoints: [],
  globals: [Header, Footer, ShopSettings],
  // 008 T841 (SEC-B-03): Disable public GraphQL introspection / playground in production
  graphQL: {
    disable: process.env.NODE_ENV === 'production',
    disablePlaygroundInProduction: true,
  },
  // Payload Jobs (spec 003 research D1, review F1): task declaration alone is
  // NOT enough — the background worker only starts with jobs.autoRun registered.
  jobs: {
    tasks: [holdSweepTask, bookingEmailTask, reminderSweepTask, outboxDispatchTask, gdprPurgeTask, waitlistMatchTask, waitlistSweepTask, intentSweepTask],
    // 004 review F6: outbox dispatch needs the 30s cadence (default 60s/limit 10
    // would sleep through the queue SLA); limit 25 matches the batch size.
    autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }],
  },
  plugins,
  // Fail-closed canon (code-review F-03): an empty/missing signing secret must
  // abort the boot with an explicit diagnostic, never fall back to ''.
  secret:
    process.env.PAYLOAD_SECRET ||
    (() => {
      throw new Error('PAYLOAD_SECRET is required (fail-closed): set it in .env before booting')
    })(),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Sharp is now an optional dependency -
  // if you want to resize images, crop, set focal point, etc.
  // make sure to install it and pass it to the config.
  // sharp,
})
