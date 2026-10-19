import { logger } from '@/lib/telemetry/logger';

describe('logger redaction and denylist', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('redacts sensitive fields: botToken, phone, email, initData', () => {
    logger.info('test_event', {
      botToken: '123456:secret-token-value',
      customerPhone: '+1-555-123-4567',
      customerEmail: 'sensitive@example.com',
      initData: 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&hash=12345',
      orderId: 'safe-order-uuid-1234',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0];

    // Assert sensitive strings are absent
    expect(output).not.toContain('123456:secret-token-value');
    expect(output).not.toContain('+1-555-123-4567');
    expect(output).not.toContain('sensitive@example.com');
    expect(output).not.toContain('AAHdF6IQAAAAAN0XohDhrOrc');

    // Assert safe orderId is present
    expect(output).toContain('safe-order-uuid-1234');
    expect(output).toContain('[REDACTED]');
  });

  it('formats [ADMIN_ACTION] without credentials', () => {
    logger.adminAction('/api/admin/items', 'POST', 'item-uuid-1', 201);
    expect(logSpy).toHaveBeenCalledWith('[ADMIN_ACTION] action=/api/admin/items method=POST targetId=item-uuid-1 status=201');
  });

  it('emits counter log lines', () => {
    logger.counter('inbox_send_fail');
    logger.counter('hold_expired');
    logger.counter('webhook_rejected');

    expect(logSpy).toHaveBeenCalledTimes(3);
    expect(logSpy.mock.calls[0][0]).toContain('[COUNTER] name=inbox_send_fail');
    expect(logSpy.mock.calls[1][0]).toContain('[COUNTER] name=hold_expired');
    expect(logSpy.mock.calls[2][0]).toContain('[COUNTER] name=webhook_rejected');
  });
});
