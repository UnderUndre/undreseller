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
