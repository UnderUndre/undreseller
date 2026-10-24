import { renderBookingEmail } from '@/lib/email/templates';

const vars = {
  businessName: 'Studio <X> & Co',
  serviceTitle: 'Haircut',
  startsAt: 'Nov 1, 2026, 10:00 AM',
  orderNumber: 'ORD-123',
  serviceAddress: 'Main St 1',
};

describe('Email Templates ru/en (T042, FR-413)', () => {
  it('renders confirmed/cancelled/reminder in en and ru with same data', () => {
    for (const kind of ['bookingConfirmed', 'bookingCancelled', 'bookingReminder'] as const) {
      const en = renderBookingEmail(kind, 'en', vars);
      const ru = renderBookingEmail(kind, 'ru', vars);
      expect(en.subject).toContain('ORD-123');
      expect(ru.subject).toContain('ORD-123');
      expect(en.html).toContain('Haircut');
      expect(ru.html).toContain('Haircut');
      // Both locales must exist (no fallback leakage)
      expect(en.subject).not.toBe(ru.subject);
    }
  });

  it('escapes HTML in customer/business-influenced values', () => {
    const en = renderBookingEmail('bookingConfirmed', 'en', vars);
    expect(en.html).not.toContain('<X>');
    expect(en.html).toContain('&lt;X&gt;');
  });

  it('includes service address only when provided', () => {
    const withAddress = renderBookingEmail('bookingConfirmed', 'en', vars);
    expect(withAddress.html).toContain('Main St 1');

    const without = renderBookingEmail('bookingConfirmed', 'en', { ...vars, serviceAddress: null });
    expect(without.html).not.toContain('📍');
  });
});
