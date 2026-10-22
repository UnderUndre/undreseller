export type ExternalIntegrationProfile =
  | 'NONE'
  | 'TELEGRAM_BUNDLE'
  | 'WHATSAPP'
  | 'NOWPAYMENTS';

export interface IntegrationProfileValidationResult {
  valid: boolean;
  profile: ExternalIntegrationProfile;
  errors: string[];
  enabledRoutes: {
    telegramClientBot: boolean;
    telegramStaffBot: boolean;
    whatsappWebhook: boolean;
    nowpaymentsCrypto: boolean;
  };
  sprintBBoundary: {
    maxRoles: 2;
    maxBookingWorkflows: 1;
    maxEnabledExternalIntegrations: 1;
    memoryCeilingMb: 500;
  };
}

function hasNonEmpty(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((k) => Boolean(env[k] && String(env[k]).trim().length > 0));
}

export function validateIntegrationProfileEnv(
  profileInput: ExternalIntegrationProfile | string | undefined,
  env: Record<string, string | undefined> = process.env
): IntegrationProfileValidationResult {
  const validProfiles = new Set<ExternalIntegrationProfile>([
    'NONE',
    'TELEGRAM_BUNDLE',
    'WHATSAPP',
    'NOWPAYMENTS',
  ]);

  const rawProfile = (profileInput || env.ENABLED_EXTERNAL_INTEGRATION || 'TELEGRAM_BUNDLE')
    .trim()
    .toUpperCase() as ExternalIntegrationProfile;

  const errors: string[] = [];

  if (!validProfiles.has(rawProfile)) {
    errors.push(`ERR_UNKNOWN_INTEGRATION_PROFILE: '${rawProfile}' is not a valid Sprint B profile`);
  }

  const hasClientBotToken = hasNonEmpty(env, ['BOT_TOKEN', 'TELEGRAM_BOT_TOKEN']);
  const hasStaffBotToken = hasNonEmpty(env, ['STAFF_BOT_TOKEN']);
  const hasThirdBotToken = hasNonEmpty(env, [
    'THIRD_BOT_TOKEN',
    'EXTRA_BOT_TOKEN',
    'SECONDARY_STAFF_BOT_TOKEN',
    'SUPPORT_BOT_TOKEN',
  ]);
  const hasWhatsAppCreds = hasNonEmpty(env, [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APP_SECRET',
  ]);
  const hasNowPaymentsCreds = hasNonEmpty(env, [
    'NOWPAYMENTS_API_KEY',
    'NOWPAYMENTS_IPN_SECRET',
  ]);

  if (hasThirdBotToken) {
    errors.push('ERR_THIRD_BOT_TOKEN_FORBIDDEN: Third Telegram bot token violates Sprint B contour');
  }

  switch (rawProfile) {
    case 'TELEGRAM_BUNDLE': {
      if (!hasClientBotToken || !hasStaffBotToken) {
        errors.push(
          'ERR_TELEGRAM_BUNDLE_INCOMPLETE: TELEGRAM_BUNDLE requires both client BOT_TOKEN (or TELEGRAM_BOT_TOKEN) and STAFF_BOT_TOKEN'
        );
      }
      if (hasWhatsAppCreds) {
        errors.push(
          'ERR_MIXED_INTEGRATION_CREDENTIALS: TELEGRAM_BUNDLE forbids WHATSAPP_* credentials'
        );
      }
      if (hasNowPaymentsCreds) {
        errors.push(
          'ERR_MIXED_INTEGRATION_CREDENTIALS: TELEGRAM_BUNDLE forbids NOWPAYMENTS_* credentials'
        );
      }
      break;
    }

    case 'WHATSAPP': {
      if (!hasWhatsAppCreds) {
        errors.push(
          'ERR_WHATSAPP_CREDS_MISSING: WHATSAPP profile requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID'
        );
      }
      if (hasClientBotToken || hasStaffBotToken) {
        errors.push(
          'ERR_FORBIDDEN_TELEGRAM_TOKENS: WHATSAPP profile forbids both BOT_TOKEN and STAFF_BOT_TOKEN'
        );
      }
      if (hasNowPaymentsCreds) {
        errors.push(
          'ERR_MIXED_INTEGRATION_CREDENTIALS: WHATSAPP profile forbids NOWPAYMENTS_* credentials'
        );
      }
      break;
    }

    case 'NOWPAYMENTS': {
      if (!hasNowPaymentsCreds) {
        errors.push(
          'ERR_NOWPAYMENTS_CREDS_MISSING: NOWPAYMENTS profile requires NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET'
        );
      }
      if (hasClientBotToken || hasStaffBotToken) {
        errors.push(
          'ERR_FORBIDDEN_TELEGRAM_TOKENS: NOWPAYMENTS profile forbids both BOT_TOKEN and STAFF_BOT_TOKEN'
        );
      }
      if (hasWhatsAppCreds) {
        errors.push(
          'ERR_MIXED_INTEGRATION_CREDENTIALS: NOWPAYMENTS profile forbids WHATSAPP_* credentials'
        );
      }
      break;
    }

    case 'NONE': {
      if (hasClientBotToken || hasStaffBotToken) {
        errors.push(
          'ERR_FORBIDDEN_TELEGRAM_TOKENS: NONE profile forbids both BOT_TOKEN and STAFF_BOT_TOKEN'
        );
      }
      if (hasWhatsAppCreds || hasNowPaymentsCreds) {
        errors.push(
          'ERR_MIXED_INTEGRATION_CREDENTIALS: NONE profile forbids all external integration credentials'
        );
      }
      break;
    }
  }

  return {
    valid: errors.length === 0,
    profile: rawProfile,
    errors,
    enabledRoutes: {
      telegramClientBot: rawProfile === 'TELEGRAM_BUNDLE' && errors.length === 0,
      telegramStaffBot: rawProfile === 'TELEGRAM_BUNDLE' && errors.length === 0,
      whatsappWebhook: rawProfile === 'WHATSAPP' && errors.length === 0,
      nowpaymentsCrypto: rawProfile === 'NOWPAYMENTS' && errors.length === 0,
    },
    sprintBBoundary: {
      maxRoles: 2,
      maxBookingWorkflows: 1,
      maxEnabledExternalIntegrations: 1,
      memoryCeilingMb: 500,
    },
  };
}

export function assertIntegrationProfileStartup(
  profile?: ExternalIntegrationProfile | string,
  env: Record<string, string | undefined> = process.env
): IntegrationProfileValidationResult {
  const result = validateIntegrationProfileEnv(profile, env);
  if (!result.valid) {
    const err = new Error(
      `ERR_INTEGRATION_PROFILE_VIOLATION: ${result.errors.join('; ')}`
    );
    err.name = 'ERR_INTEGRATION_PROFILE_VIOLATION';
    throw err;
  }
  return result;
}

// -------------------------------------------------------------
// Typed Build-Time Capability-Pack Configuration Contract (T007, FR-325)
// Zero runtime dynamic plugin registry; statically typed capabilities
// -------------------------------------------------------------

export interface CapabilityPackConfig {
  version: '003.1';
  tier: 'TIER_1_MVP';
  packs: {
    publicProfiles: boolean;     // US12: Public professional pages & portfolios
    serviceBooking: boolean;     // US2: Appointment booking with buffers & location modes
    staffAccess: boolean;        // US5: Better Auth & 3-role staff access control
    // Tier 2 & Subsequent Packs (Disabled in 003.1 Booking-First MVP)
    productSales: boolean;       // US1: Phase 15 product sales & inventory
    mixedCartFulfillment: boolean;// US3: Phase 5 mixed carts & segmented fulfillment
    paymentPlans: boolean;       // US4: Phase 6 deposit & milestone payment plans
    quotes: boolean;             // US6: Phase 8 custom quotes & margin guard
    partyTimeline: boolean;      // US7: Phase 9 unified party timeline & conversation drafts
    changeRequests: boolean;     // US8: Phase 10 order change requests & credit notes
    complianceAdapters: boolean; // US9: Phase 11 jurisdiction compliance SPI
    redactedReadModels: boolean; // US10: Phase 12 redacted read models & staged imports
    aiLab: boolean;              // US11: Phase 13 local LLM gateway & telemetry
  };
}

export const CAPABILITY_PACKS_CONFIG: CapabilityPackConfig = {
  version: '003.1',
  tier: 'TIER_1_MVP',
  packs: {
    publicProfiles: true,
    serviceBooking: true,
    staffAccess: true,
    productSales: false,
    mixedCartFulfillment: false,
    paymentPlans: false,
    quotes: false,
    partyTimeline: false,
    changeRequests: false,
    complianceAdapters: false,
    redactedReadModels: false,
    aiLab: false,
  },
};

export function getCapabilityPackConfig(): CapabilityPackConfig {
  return CAPABILITY_PACKS_CONFIG;
}
