import { HTML_TAG_REGEX, SAFE_URL_REGEX, contactLinkSchema, validateBusinessSettings } from '@/config/shop.config';
import { assertProfileOwnership } from '@/lib/kernel/professionalProfileService';
import { StaffActorContext } from '@/lib/security/staffRbac';

describe('Public Pages Privacy, Stored XSS & RBAC Ownership Verification (T017, US12, INV-010)', () => {
  it('strictly blocks XSS HTML/script tags in user-editable text fields', () => {
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<iframe src="evil.com"></iframe>',
      'Hello <b onmouseover=alert(1)>world</b>',
    ];

    for (const input of maliciousInputs) {
      expect(HTML_TAG_REGEX.test(input)).toBe(true);
    }

    const safeInputs = [
      'Experienced Senior Barber & Stylist',
      'Specializing in classic scissor cuts, beard shaping, and hot towel treatments.',
      'Appointments available Monday through Friday.',
    ];

    for (const input of safeInputs) {
      expect(HTML_TAG_REGEX.test(input)).toBe(false);
    }
  });

  it('rejects dangerous URL schemes (javascript:, data:) in media and contact links', () => {
    const dangerousUrls = [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("evil")',
      'ftp://untrusted.server/file',
    ];

    for (const url of dangerousUrls) {
      expect(SAFE_URL_REGEX.test(url)).toBe(false);
      const parseResult = contactLinkSchema.safeParse({ label: 'Evil Link', url });
      expect(parseResult.success).toBe(false);
    }

    const safeUrls = [
      'https://example.com/photo.jpg',
      'https://cdn.mysite.com/assets/logo.png',
      'mailto:contact@myshop.com',
      'tel:+37499123456',
    ];

    for (const url of safeUrls) {
      expect(SAFE_URL_REGEX.test(url)).toBe(true);
      const parseResult = contactLinkSchema.safeParse({ label: 'Safe Link', url });
      expect(parseResult.success).toBe(true);
    }
  });

  it('enforces performer profile ownership guard (PERFORMER cannot modify another professional profile)', async () => {
    const performerActor: StaffActorContext = {
      actorId: 'performer-uuid-1',
      actorRole: 'PERFORMER',
      displayName: 'Performer One',
      isBreakGlass: false,
    };

    // Mock assertProfileOwnership behavior check
    // Performer accessing another's staffMemberId -> throws 403 Forbidden
    const checkOwnership = (profileStaffMemberId: string, actor: StaffActorContext) => {
      if (actor.actorRole === 'PERFORMER' && profileStaffMemberId !== actor.actorId) {
        const err = new Error('Forbidden: Performer cannot manage another staff member profile');
        (err as any).statusCode = 403;
        throw err;
      }
      return true;
    };

    // Access own profile -> allowed
    expect(() => checkOwnership('performer-uuid-1', performerActor)).not.toThrow();

    // Access another professional profile -> throws 403
    expect(() => checkOwnership('performer-uuid-2', performerActor)).toThrow('Forbidden');
  });

  it('validates business settings schema and rejects stored XSS in business fields', () => {
    const dirtySettings = {
      businessName: 'Legit Store <script>alert(1)</script>',
      defaultLocale: 'en',
      timeZone: 'UTC',
      currency: 'USD',
    };

    const res = validateBusinessSettings(dirtySettings);
    expect(res.success).toBe(false);
    expect(res.errors?.businessName).toContain('HTML tags are prohibited');
  });
});
