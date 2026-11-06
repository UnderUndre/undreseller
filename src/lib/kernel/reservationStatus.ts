/**
 * Reservation status — SINGLE SOURCE OF TRUTH for the DB `ReservationStatus`
 * enum values (T031, spec 001-reinit-from-payload-ecommerce-template).
 *
 * Dedup decision: legacy (undreseller-legacy `lib/kernel/bookingFsm.ts`)
 * declared the DB-status list only as the type union `DbReservationStatus`
 * (mirroring the legacy prisma enum) and as the key set of
 * DB_TO_SPEC_BOOKING_STATE — there was no runtime list. Here the list becomes
 * a runtime const array so one literal feeds:
 *   (a) the FSM↔DB mapping in `./bookingFsm` — its `DbReservationStatus` type
 *       is a re-export of `ReservationStatus` from this file, and
 *   (b) the Payload select options for the reservations collection (zcode F3).
 * Values and order are 1:1 with the legacy prisma enum / legacy type union.
 */
export const RESERVATION_STATUSES = ['HELD','BOOKED','RELEASED','PAYMENT_PENDING','UNDERPAID','PENDING_APPROVAL','CANCELLED','STAFF_REJECTED'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]
export const RESERVATION_STATUS_OPTIONS = RESERVATION_STATUSES.map((value) => ({ label: value, value }))
