import {
  authorizeStaffCallback,
  verifyStaffWebhookSecret,
} from '@/lib/bot/staffActions';
import {
  generateMagicRescheduleLink,
  verifyMagicRescheduleToken,
} from '@/lib/bot/magicReschedule';
import {
  maskCustomerPhone,
  formatStaffOrderCard,
  formatCopyContactsText,
} from '@/lib/bot/staffBot';
import {
  evaluateBlacklistIdentity,
  issuePhoneOtpPure,
  verifyPhoneOtpPure,
  OtpStateRecord,
} from '@/lib/booking/lock';
import { validateIntegrationProfileEnv } from '@/lib/config/integrationProfile';

describe('Staff Bot Authorization, Magic Reschedule Link, Blacklist OTP & Integration Matrix (T-113b, T-118)', () => {
  describe('Staff Bot Role Separation & Masked PII (T-106, T-107, T-118)', () => {
    it('rejects unauthorized group members while allowing whitelisted staff user IDs in staffDestinationChatId', () => {
      const allowed = authorizeStaffCallback({
        chatId: '-100987654321',
        fromUserId: '111222',
        staffDestinationChatId: '-100987654321',
        authorizedStaffUserIds: ['111222', '333444'],
      });
      expect(allowed.authorized).toBe(true);

      const unauthorizedMember = authorizeStaffCallback({
        chatId: '-100987654321',
        fromUserId: '999999',
        staffDestinationChatId: '-100987654321',
        authorizedStaffUserIds: ['111222', '333444'],
      });
      expect(unauthorizedMember.authorized).toBe(false);
      expect(unauthorizedMember.reason).toBe('USER_NOT_IN_AUTHORIZED_STAFF_LIST');
    });

    it('показывает полные контакты клиента (для копирования мастером) и маска через maskCustomerPhone отдельно', () => {
      expect(maskCustomerPhone('+79991234567')).toBe('+7 *** *** 4567');
      const card = formatStaffOrderCard({
        orderId: 'ord-1',
        orderNumber: 'ORD-777',
        serviceTitles: ['Стрижка', 'Борода'],
        totalDurationMin: 75,
        startTimeIso: '2026-10-21T10:00:00Z',
        endTimeIso: '2026-10-21T11:15:00Z',
        totalMinor: 4000,
        currency: 'USD',
        paymentType: 'PAY_ON_SITE',
        customerName: 'Алексей',
        customerPhone: '+79991234567',
        customerTgUsername: 'alexey_tg',
        hasWhatsApp: true,
        hasTelegram: true,
        hasCustomerNotes: true,
        customerNotes: 'Позвонить за час до визита',
        isNewClient: true,
      });
      // Полные контакты доступны мастеру для копирования (FR-мастер-флоу)
      expect(card).toContain('+79991234567');
      expect(card).toContain('@alexey_tg');
      expect(card).toContain('WhatsApp: есть');
      expect(card).toContain('Позвонить за час до визита');
    });

    it('verifies staff webhook secret with timing-safe comparison', () => {
      expect(verifyStaffWebhookSecret('sec_123', 'sec_123')).toBe(true);
      expect(verifyStaffWebhookSecret('wrong', 'sec_123')).toBe(false);
    });
  });

  describe('Single-Use HMAC Magic Reschedule Link (T-106, T-118)', () => {
    it('accepts valid token once and rejects tampered, expired, stale-version, or consumed tokens', () => {
      const now = new Date('2026-10-20T12:00:00Z');
      const bundle = generateMagicRescheduleLink({
        orderId: 'ord-resched-1',
        scheduleVersion: 3,
        now,
      });

      const orderState = {
        id: 'ord-resched-1',
        scheduleVersion: 3,
        rescheduleTokenHash: bundle.rescheduleTokenHash,
        rescheduleTokenConsumedAt: null as Date | null,
      };

      // 1. Valid verification
      const ok = verifyMagicRescheduleToken(bundle.token, orderState, now);
      expect(ok.valid).toBe(true);

      // 2. Tampered token rejected
      const tampered = bundle.token.slice(0, -4) + 'XXXX';
      expect(verifyMagicRescheduleToken(tampered, orderState, now).valid).toBe(false);

      // 3. Expired token (>24h) rejected
      const after25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
      const expired = verifyMagicRescheduleToken(bundle.token, orderState, after25h);
      expect(expired.valid).toBe(false);
      expect(expired.reason).toBe('TOKEN_EXPIRED');

      // 4. Consumed token rejected
      const consumedState = { ...orderState, rescheduleTokenConsumedAt: new Date() };
      const consumed = verifyMagicRescheduleToken(bundle.token, consumedState, now);
      expect(consumed.valid).toBe(false);
      expect(consumed.reason).toBe('TOKEN_ALREADY_CONSUMED');

      // 5. Incremented scheduleVersion rejected
      const staleState = { ...orderState, scheduleVersion: 4 };
      const stale = verifyMagicRescheduleToken(bundle.token, staleState, now);
      expect(stale.valid).toBe(false);
      expect(stale.reason).toBe('STALE_SCHEDULE_VERSION');
    });
  });

  describe('Blacklist 403 Enforcement, Phone OTP Ownership & Recycled Number Protection (T-105, T-118)', () => {
    it('blocks blacklisted Telegram ID and verified phone with 403, routes unverified/recycled phone-only matches to MANUAL_REVIEW, and expires 90d risk markers', () => {
      const now = new Date('2026-10-20T12:00:00Z');

      // 1. Blocked Telegram ID -> BLOCK_403
      const tgBlocked = evaluateBlacklistIdentity({
        customerTgId: 'tg_bad',
        contacts: [{ platform: 'TELEGRAM', externalId: 'tg_bad', isBlocked: true }],
        now,
      });
      expect(tgBlocked.action).toBe('BLOCK_403');

      // 2. Unverified phone-only match -> MANUAL_REVIEW (no indefinite 403 on unverified phone)
      const unverifiedPhone = evaluateBlacklistIdentity({
        normalizedPhone: '+79990001122',
        contacts: [
          {
            platform: 'WHATSAPP',
            externalId: '+79990001122',
            isBlocked: true,
            phoneVerificationMethod: 'UNVERIFIED_PHONE_ONLY',
            requiresManualReview: true,
          },
        ],
        now,
      });
      expect(unverifiedPhone.action).toBe('MANUAL_REVIEW');

      // 3. Expired 90-day risk marker -> EXPIRED_RISK_CLEARED
      const expiredRisk = evaluateBlacklistIdentity({
        normalizedPhone: '+79990009999',
        contacts: [
          {
            platform: 'WHATSAPP',
            externalId: '+79990009999',
            isBlocked: true,
            phoneRiskExpiresAt: new Date(now.getTime() - 1000),
          },
        ],
        now,
      });
      expect(expiredRisk.action).toBe('EXPIRED_RISK_CLEARED');

      // 4. Recycled phone rebound via OTP to a new owner clears previous owner's block
      const initialOtpState: OtpStateRecord = {
        phone: '+79995554433',
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00Z'),
        customerId: 'old_owner_tg_1',
        isBlocked: true,
      };
      const issued = issuePhoneOtpPure(initialOtpState, '482910', now);
      const rebound = verifyPhoneOtpPure(issued.updated, '482910', 'new_owner_tg_2', now);
      expect(rebound.verified).toBe(true);
      expect(rebound.rebindClearedBlock).toBe(true);
      expect(rebound.updated.isBlocked).toBe(false);
      expect(rebound.updated.customerId).toBe('new_owner_tg_2');
    });
  });

  describe('Fail-Closed Integration Profile Matrix (T-113b)', () => {
    it('permits exactly BOT_TOKEN + STAFF_BOT_TOKEN for TELEGRAM_BUNDLE and rejects mixed or third-token configs', () => {
      const validTgBundle = validateIntegrationProfileEnv('TELEGRAM_BUNDLE', {
        BOT_TOKEN: '123:abc',
        STAFF_BOT_TOKEN: '456:def',
      });
      expect(validTgBundle.valid).toBe(true);

      const mixedTgAndWa = validateIntegrationProfileEnv('TELEGRAM_BUNDLE', {
        BOT_TOKEN: '123:abc',
        STAFF_BOT_TOKEN: '456:def',
        WHATSAPP_ACCESS_TOKEN: 'wa_secret',
      });
      expect(mixedTgAndWa.valid).toBe(false);
      expect(mixedTgAndWa.errors[0]).toContain('TELEGRAM_BUNDLE forbids WHATSAPP_*');

      const waWithTgTokens = validateIntegrationProfileEnv('WHATSAPP', {
        WHATSAPP_ACCESS_TOKEN: 'wa_secret',
        WHATSAPP_PHONE_NUMBER_ID: '12345',
        STAFF_BOT_TOKEN: '456:def',
      });
      expect(waWithTgTokens.valid).toBe(false);
      expect(waWithTgTokens.errors[0]).toContain('forbids both BOT_TOKEN and STAFF_BOT_TOKEN');

      const thirdBotToken = validateIntegrationProfileEnv('TELEGRAM_BUNDLE', {
        BOT_TOKEN: '123:abc',
        STAFF_BOT_TOKEN: '456:def',
        THIRD_BOT_TOKEN: '789:ghi',
      });
      expect(thirdBotToken.valid).toBe(false);
      expect(thirdBotToken.errors[0]).toContain('ERR_THIRD_BOT_TOKEN_FORBIDDEN');
    });
  });
});
