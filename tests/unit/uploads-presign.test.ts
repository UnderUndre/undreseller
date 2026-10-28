jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.com/PUT?X-Amz-Signature=abc'),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

import { createPresignedPut, PresignValidationError, PRESIGN_LIMITS } from '@/lib/uploads/presign';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('R2 Presigned Upload Service (T060, FR-441, spike S2 findings)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'test-bucket';
    delete process.env.R2_PUBLIC_BASE_URL;
  });

  it('issues a presigned PUT with content-type/length signed in (unhoistable headers)', async () => {
    const result = await createPresignedPut({
      contentType: 'image/webp',
      contentLength: 150_000,
      folder: 'portfolio',
      extension: 'webp',
    });

    expect(result.uploadUrl).toContain('X-Amz-Signature');
    expect(result.expiresIn).toBeLessThanOrEqual(5 * 60);
    expect(result.key).toMatch(/^portfolio\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(result.publicUrl).toContain(result.key);

    const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
    expect(command.ContentType).toBe('image/webp');
    expect(command.ContentLength).toBe(150_000);
    // Spike S2: unhoistable headers keep content-type/content-length signed
    const opts = (getSignedUrl as jest.Mock).mock.calls[0][2];
    expect(opts.unhoistableHeaders.has('content-type')).toBe(true);
    expect(opts.unhoistableHeaders.has('content-length')).toBe(true);
  });

  it('rejects disallowed content types, oversized bodies, and unknown folders (400)', async () => {
    await expect(
      createPresignedPut({ contentType: 'image/heic', contentLength: 100, folder: 'portfolio' })
    ).rejects.toBeInstanceOf(PresignValidationError);
    await expect(
      createPresignedPut({ contentType: 'image/webp', contentLength: 6 * 1024 * 1024, folder: 'portfolio' })
    ).rejects.toBeInstanceOf(PresignValidationError);
    await expect(
      createPresignedPut({ contentType: 'image/webp', contentLength: 100, folder: 'vendor' })
    ).rejects.toBeInstanceOf(PresignValidationError);
    await expect(
      createPresignedPut({ contentType: 'image/webp', contentLength: 100, folder: 'portfolio', extension: '../../etc' })
    ).rejects.toBeInstanceOf(PresignValidationError);
  });

  it('fails closed (503) when R2 env is not configured', async () => {
    delete process.env.R2_ACCOUNT_ID;
    await expect(
      createPresignedPut({ contentType: 'image/webp', contentLength: 100, folder: 'logo' })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('key is a single object path with no traversal surface', async () => {
    const result = await createPresignedPut({
      contentType: 'image/png',
      contentLength: 2048,
      folder: 'profiles',
      extension: 'PNG',
    });
    expect(result.key.startsWith('profiles/')).toBe(true);
    expect(result.key.endsWith('.png')).toBe(true);
    expect(result.key).not.toContain('..');
  });

  it('limits are exported for admin UI validation parity (T062)', () => {
    expect(PRESIGN_LIMITS.maxContentLength).toBe(5 * 1024 * 1024);
    expect(PRESIGN_LIMITS.allowedContentTypes).toContain('image/webp');
  });
});
