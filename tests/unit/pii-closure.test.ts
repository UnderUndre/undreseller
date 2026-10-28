import { redactFreeText } from '@/lib/security/staffAuth';

describe('PII Closure (T092, FR-428, SC-403)', () => {
  it('redactFreeText strips emails, phones, and card-like sequences pre-persist', () => {
    expect(redactFreeText('client user@example.com asked to reschedule')).toBe(
      'client [REDACTED_EMAIL] asked to reschedule'
    );
    expect(redactFreeText('call +7 999 123-45-67 after 5pm')).toBe(
      'call [REDACTED_PHONE] after 5pm'
    );
    expect(redactFreeText('card 4111 1111 1111 1111 provided')).toBe(
      'card [REDACTED_PAN] provided'
    );
  });

  it('passes through clean operational reasons unchanged; null-safe', () => {
    expect(redactFreeText('Staff executed CONFIRM on booking')).toBe(
      'Staff executed CONFIRM on booking'
    );
    expect(redactFreeText(null)).toBeNull();
    expect(redactFreeText(undefined)).toBeNull();
  });
});
