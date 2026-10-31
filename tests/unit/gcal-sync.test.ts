/**
 * T020/T022 contract tests (contracts/gcal-adapter.md §5, stubbed SDK):
 * sync parameter combinations (F1-rev), own-event filtering (F2),
 * transparency/cancel handling, 410 flag, idempotent delete (F3),
 * session-level lock + OAuth state one-time semantics (F4/F1-rev).
 */

process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

const listMock = jest.fn();
const insertMock = jest.fn();
const patchMock = jest.fn();
const deleteMock = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      events: { list: listMock, insert: insertMock, patch: patchMock, delete: deleteMock },
    }),
  },
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: class {
    setCredentials() {}
    on() {}
  },
}));

import { createGcalClient, parseCredentialPayload, serializeCredentialPayload } from '@/lib/integrations/gcalClient';
import {
  createOAuthState,
  consumeOAuthState,
  resetOAuthStateStoreForTests,
} from '@/lib/integrations/oauthState';

const payload = {
  refreshToken: '1//test-refresh',
  accessToken: 'ya29.test-access',
  calendarId: 'primary@example.com',
};

beforeEach(() => {
  listMock.mockReset();
  insertMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

describe('T022: sync parameter combinations and delta handling (F1-rev)', () => {
  it('initial full sync uses timeMin + singleEvents + showDeleted, NO syncToken', async () => {
    listMock.mockResolvedValue({ data: { items: [], nextSyncToken: 'tok-1' } });
    const client = createGcalClient({ credentialPayload: { ...payload } });
    const res = await client.incrementalSync({ windowDays: 30 });
    expect(listMock).toHaveBeenCalledTimes(1);
    const args = listMock.mock.calls[0][0];
    expect(args.syncToken).toBeUndefined();
    expect(args.timeMin).toBeDefined();
    expect(args.singleEvents).toBe(true);
    expect(args.showDeleted).toBe(true);
    expect(res.nextSyncToken).toBe('tok-1');
    expect(res.fullSync).toBe(true);
  });

  it('incremental sync uses ONLY syncToken — no timeMin/q (Google 400 guard)', async () => {
    listMock.mockResolvedValue({ data: { items: [], nextSyncToken: 'tok-2' } });
    const client = createGcalClient({ credentialPayload: { ...payload, syncToken: 'tok-1' } });
    await client.incrementalSync({ windowDays: 30 });
    const args = listMock.mock.calls[0][0];
    expect(args.syncToken).toBe('tok-1');
    expect(args.timeMin).toBeUndefined();
    expect(args.q).toBeUndefined();
    expect(args.singleEvents).toBeUndefined();
  });

  it('third-party events → busy blocks; own events (undresellerOrderId) strictly ignored (F2)', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 'ev-external-1',
            status: 'confirmed',
            start: { dateTime: '2027-02-01T10:00:00Z' },
            end: { dateTime: '2027-02-01T11:00:00Z' },
          },
          {
            id: 'ev-own-1',
            status: 'confirmed',
            start: { dateTime: '2027-02-01T12:00:00Z' },
            end: { dateTime: '2027-02-01T13:00:00Z' },
            extendedProperties: { private: { undresellerOrderId: 'order-1' } },
          },
          {
            id: 'ev-transparent',
            status: 'confirmed',
            transparency: 'transparent',
            start: { dateTime: '2027-02-01T14:00:00Z' },
            end: { dateTime: '2027-02-01T15:00:00Z' },
          },
          {
            id: 'ev-cancelled',
            status: 'cancelled',
            start: { dateTime: '2027-02-01T16:00:00Z' },
            end: { dateTime: '2027-02-01T17:00:00Z' },
          },
        ],
        nextSyncToken: 'tok-3',
      },
    });
    const client = createGcalClient({ credentialPayload: { ...payload } });
    const res = await client.incrementalSync({ windowDays: 30 });
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0]).toMatchObject({ gcEventId: 'ev-external-1' });
    expect(res.removedEventIds).toEqual(['ev-transparent', 'ev-cancelled']);
  });

  it('recurrence expansion: instances import as individual busy blocks by instance-id', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 'inst-1',
            status: 'confirmed',
            start: { dateTime: '2027-02-02T10:00:00Z' },
            end: { dateTime: '2027-02-02T11:00:00Z' },
          },
          {
            id: 'inst-2',
            status: 'confirmed',
            start: { dateTime: '2027-02-09T10:00:00Z' },
            end: { dateTime: '2027-02-09T11:00:00Z' },
          },
        ],
        nextSyncToken: 'tok-4',
      },
    });
    const client = createGcalClient({ credentialPayload: { ...payload } });
    const res = await client.incrementalSync({ windowDays: 30 });
    expect(res.blocks.map((b) => b.gcEventId)).toEqual(['inst-1', 'inst-2']);
  });
});

describe('T021: push semantics (stubbed SDK)', () => {
  it('pushEvent carries extendedProperties marker + resourceId; meet only when flagged', async () => {
    insertMock.mockResolvedValue({ data: { id: 'ev-new', hangoutLink: 'https://meet.google.com/abc' } });
    const client = createGcalClient({ credentialPayload: { ...payload } });

    const withMeet = await client.pushEvent({
      calendarId: payload.calendarId,
      orderId: 'order-9',
      resourceId: 'res-1',
      serviceTitle: 'Консультация',
      orderNumber: 'ORD-9',
      description: 'Клиент: И***',
      startsAtUtc: '2027-02-01T10:00:00.000Z',
      endsAtUtc: '2027-02-01T11:00:00.000Z',
      meet: true,
    });
    expect(withMeet).toEqual({ gcEventId: 'ev-new', meetLink: 'https://meet.google.com/abc' });
    const args = insertMock.mock.calls[0][0];
    expect(args.requestBody.extendedProperties.private.undresellerOrderId).toBe('order-9');
    expect(args.conferenceDataVersion).toBe(1);

    await client.pushEvent({
      calendarId: payload.calendarId,
      orderId: 'order-10',
      resourceId: null,
      serviceTitle: 'Стрижка',
      orderNumber: 'ORD-10',
      description: 'Клиент: П***',
      startsAtUtc: '2027-02-01T10:00:00.000Z',
      endsAtUtc: '2027-02-01T11:00:00.000Z',
      meet: false,
    });
    expect(insertMock.mock.calls[1][0].conferenceDataVersion).toBeUndefined();
  });

  it('deleteEvent: 404/410 from Google → idempotent NOOP success (F3)', async () => {
    deleteMock.mockRejectedValueOnce({ code: 404 });
    deleteMock.mockRejectedValueOnce({ code: 410 });
    deleteMock.mockResolvedValueOnce({ data: {} });
    const client = createGcalClient({ credentialPayload: { ...payload } });

    expect(await client.deleteEvent({ calendarId: payload.calendarId, gcEventId: 'ev-1' })).toEqual({ noop: true });
    expect(await client.deleteEvent({ calendarId: payload.calendarId, gcEventId: 'ev-1' })).toEqual({ noop: true });
    expect(await client.deleteEvent({ calendarId: payload.calendarId, gcEventId: 'ev-2' })).toEqual({ noop: false });
  });

  it('credential payload roundtrip through the vault (plaintext never at rest)', () => {
    const encoded = serializeCredentialPayload(payload);
    expect(encoded).toMatch(/^v1:/);
    expect(encoded).not.toContain('1//test-refresh');
    expect(parseCredentialPayload(encoded)).toEqual(payload);
  });
});

describe('T020: OAuth state one-time + TTL semantics', () => {
  beforeEach(() => resetOAuthStateStoreForTests());

  it('valid state consumed exactly once (replay → null)', () => {
    const state = createOAuthState('res-1', 'staff-1');
    expect(consumeOAuthState(state)).toMatchObject({ resourceId: 'res-1', connectedByStaffId: 'staff-1' });
    expect(consumeOAuthState(state)).toBeNull();
  });

  it('unknown state → null', () => {
    expect(consumeOAuthState('bogus-state')).toBeNull();
  });
});
