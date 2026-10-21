import {
  validateAndBuildServiceCart,
  sanitizeCustomerNotes,
  AuthoritativeServiceItem,
} from '@/lib/booking/cart';
import { computeContiguousAvailableSlots } from '@/lib/booking/windows';

describe('Multi-Service Cart & 30-Minute Contiguous Slot Grid (T-103, T-104, T-114)', () => {
  const sampleCatalog: AuthoritativeServiceItem[] = [
    {
      id: 'srv-haircut',
      title: 'Стрижка',
      priceMinor: 2500,
      starsPrice: 1250,
      currency: 'USD',
      itemType: 'SERVICE',
      durationMin: 45,
      isActive: true,
    },
    {
      id: 'srv-beard',
      title: 'Оформление бороды',
      priceMinor: 1500,
      starsPrice: 750,
      currency: 'USD',
      itemType: 'SERVICE',
      durationMin: 30,
      isActive: true,
    },
    {
      id: 'srv-styling',
      title: 'Укладка',
      priceMinor: 1000,
      starsPrice: 500,
      currency: 'USD',
      itemType: 'SERVICE',
      durationMin: 15,
      isActive: true,
    },
    {
      id: 'srv-inactive',
      title: 'Архивная услуга',
      priceMinor: 1000,
      currency: 'USD',
      itemType: 'SERVICE',
      durationMin: 30,
      isActive: false,
    },
    {
      id: 'srv-eur',
      title: 'Европейский сервис',
      priceMinor: 3000,
      currency: 'EUR',
      itemType: 'SERVICE',
      durationMin: 60,
      isActive: true,
    },
  ];

  describe('Authoritative Cart Validation & Snapshots (T-103)', () => {
    it('sums cumulative duration (45+30+15=90 min) and price across 3 services and creates immutable snapshots', () => {
      const cart = validateAndBuildServiceCart(
        ['srv-haircut', 'srv-beard', 'srv-styling'],
        sampleCatalog
      );

      expect(cart.totalDurationMin).toBe(90);
      expect(cart.totalMinor).toBe(5000);
      expect(cart.currency).toBe('USD');
      expect(cart.snapshots).toHaveLength(3);
      expect(cart.snapshots[0]).toEqual({
        itemId: 'srv-haircut',
        titleSnapshot: 'Стрижка',
        priceMinor: 2500,
        currency: 'USD',
        durationMin: 45,
        quantity: 1,
        stockDecremented: 0,
      });
    });

    it('rejects duplicate service IDs in cart', () => {
      expect(() =>
        validateAndBuildServiceCart(['srv-haircut', 'srv-haircut'], sampleCatalog)
      ).toThrow('Duplicate service items are not allowed');
    });

    it('rejects inactive or non-existent services', () => {
      expect(() =>
        validateAndBuildServiceCart(['srv-haircut', 'srv-inactive'], sampleCatalog)
      ).toThrow('not found, inactive, or not a bookable service');
    });

    it('rejects mixed currencies in cart', () => {
      expect(() =>
        validateAndBuildServiceCart(['srv-haircut', 'srv-eur'], sampleCatalog)
      ).toThrow('Mixed currencies in cart are prohibited');
    });

    it('rejects cart exceeding 10 items or 480 total minutes', () => {
      const elevenIds = Array.from({ length: 11 }, (_, i) => `srv-${i}`);
      expect(() => validateAndBuildServiceCart(elevenIds, sampleCatalog)).toThrow(
        'Cart cannot exceed 10 services'
      );

      const longItems: AuthoritativeServiceItem[] = [
        {
          id: 'long-1',
          title: 'Day Spa 1',
          priceMinor: 10000,
          currency: 'USD',
          itemType: 'SERVICE',
          durationMin: 300,
          isActive: true,
        },
        {
          id: 'long-2',
          title: 'Day Spa 2',
          priceMinor: 10000,
          currency: 'USD',
          itemType: 'SERVICE',
          durationMin: 240,
          isActive: true,
        },
      ];
      expect(() => validateAndBuildServiceCart(['long-1', 'long-2'], longItems)).toThrow(
        'exceeds maximum allowed 480 minutes'
      );
    });

    it('sanitizes customerNotes by stripping HTML tags and enforcing 1000 char ceiling', () => {
      const cleaned = sanitizeCustomerNotes('  <b>Пожалуйста</b>, покороче <script>alert(1)</script>  ');
      expect(cleaned).toBe('Пожалуйста, покороче alert(1)');

      expect(() => sanitizeCustomerNotes('x'.repeat(1001))).toThrow(
        'Customer notes cannot exceed 1000 characters'
      );
    });
  });

  describe('30-Minute Grid & Contiguous Window Filtering (T-104)', () => {
    it('filters out 30-min grid start times where 75-min contiguous interval overlaps existing booking or lunch break (US1 Acceptance 1)', () => {
      const now = new Date('2026-10-20T06:00:00Z');
      // Working hours 10:00 (600) to 18:00 (1080), lunch break 13:00 (780) to 14:00 (840)
      // Existing reservation: 11:30 to 12:30 on 2026-10-21
      const slots = computeContiguousAvailableSlots({
        dateStr: '2026-10-21',
        totalDurationMin: 75,
        slotGridStepMin: 30,
        minNoticeMin: 60,
        now,
        resourceId: 'default_master',
        workingHours: {
          startMin: 10 * 60,
          endMin: 18 * 60,
          breakStartMin: 13 * 60,
          breakEndMin: 14 * 60,
        },
        existingReservations: [
          {
            startTime: new Date('2026-10-21T11:30:00.000Z'),
            endTime: new Date('2026-10-21T12:30:00.000Z'),
          },
        ],
      });

      const startTimes = slots.map((s) => s.startTime);

      // 10:00 -> 10:00..11:15 (fits before 11:30!)
      expect(startTimes).toContain('2026-10-21T10:00:00.000Z');
      // 10:30 -> 10:30..11:45 (overlaps 11:30..12:30 -> excluded!)
      expect(startTimes).not.toContain('2026-10-21T10:30:00.000Z');
      // 11:00 -> 11:00..12:15 (overlaps 11:30..12:30 -> excluded!)
      expect(startTimes).not.toContain('2026-10-21T11:00:00.000Z');
      // 12:00 -> 12:00..13:15 (overlaps both reservation and 13:00 break -> excluded!)
      expect(startTimes).not.toContain('2026-10-21T12:00:00.000Z');
      // 12:30 -> 12:30..13:45 (overlaps 13:00..14:00 break -> excluded!)
      expect(startTimes).not.toContain('2026-10-21T12:30:00.000Z');
      // 14:00 -> 14:00..15:15 (after break -> available!)
      expect(startTimes).toContain('2026-10-21T14:00:00.000Z');
      // 17:00 -> 17:00..18:15 (exceeds 18:00 shift end -> excluded!)
      expect(startTimes).not.toContain('2026-10-21T17:00:00.000Z');
    });
  });
});
