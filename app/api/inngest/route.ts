import { serve } from 'inngest/next';
import {
  inngest,
  inboxSweep,
  documentReindex,
  holdSweep,
  nightlyPurge,
  appointmentReminderJob,
  autoCancelUnconfirmedJob,
  invoiceExpiryJob,
  gcalPushJob,
  gcalSyncSweepJob,
  gcalReconcileJob,
} from '@/lib/jobs/inngest';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    inboxSweep,
    documentReindex,
    holdSweep,
    nightlyPurge,
    appointmentReminderJob,
    autoCancelUnconfirmedJob,
    invoiceExpiryJob,
    gcalPushJob,
    gcalSyncSweepJob,
    gcalReconcileJob,
  ],
});
