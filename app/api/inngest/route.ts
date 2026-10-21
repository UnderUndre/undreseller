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
  ],
});
