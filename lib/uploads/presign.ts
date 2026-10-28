/**
 * R2 Presigned Upload Service (T060, US9, FR-441, spike S2 findings)
 * Server issues presigned PUTs; image bytes never pass through Node.
 * TTL ≤5 min; Content-Type + Content-Length cryptographically signed into the
 * PUT (unhoistableHeaders) so the bucket enforces them server-side.
 * Key = single object, no prefix traversal: `${folder}/${date}/${uuid}.${ext}`.
 */

import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MAX_TTL_SECONDS = 5 * 60;
const ALLOWED_CONTENT_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5 MB post-compression ceiling
const ALLOWED_FOLDERS = new Set(['portfolio', 'profiles', 'logo']);

export interface PresignRequest {
  contentType: string;
  contentLength: number;
  folder: string;
  extension?: string;
}

export interface PresignResult {
  uploadUrl: string;
  /** Public URL of the object after a successful PUT. */
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export class PresignValidationError extends Error {
  readonly statusCode = 400;
}

function r2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    const error: Error & { statusCode?: number } = Object.assign(
      new Error('R2 storage is not configured (missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)'),
      { statusCode: 503 }
    );
    throw error;
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

export function bucketName(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    const error: Error & { statusCode?: number } = Object.assign(
      new Error('R2_BUCKET is not configured'),
      { statusCode: 503 }
    );
    throw error;
  }
  return bucket;
}

function safeExtension(ext?: string): string {
  if (!ext) return 'webp';
  if (!/^[a-z0-9]{2,5}$/i.test(ext)) {
    throw new PresignValidationError('Invalid file extension');
  }
  return ext.toLowerCase();
}

/**
 * Issues a presigned PUT. Spike S2 findings applied:
 * - unhoistableHeaders keep content-type/content-length as SIGNED headers
 *   (the bucket can reject mismatched uploads server-side);
 * - path-style is not needed for real R2 (virtual host works via endpoint).
 */
export async function createPresignedPut(req: PresignRequest): Promise<PresignResult> {
  if (!ALLOWED_CONTENT_TYPES.has(req.contentType)) {
    throw new PresignValidationError(`Unsupported content type: ${req.contentType}`);
  }
  if (!Number.isInteger(req.contentLength) || req.contentLength <= 0 || req.contentLength > MAX_CONTENT_LENGTH) {
    throw new PresignValidationError(`Invalid content length (1..${MAX_CONTENT_LENGTH} bytes)`);
  }
  if (!ALLOWED_FOLDERS.has(req.folder)) {
    throw new PresignValidationError(`Unsupported folder: ${req.folder}`);
  }

  const bucket = bucketName();
  const client = r2Client();
  const key = `${req.folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${safeExtension(req.extension)}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: req.contentType,
    ContentLength: req.contentLength,
  });

  const presigner = {
    client,
    command,
    options: {
      expiresIn: MAX_TTL_SECONDS,
      // Spike S2: without this, the SDK hoists Content-Type into the query string
      // and the bucket cannot enforce it.
      unhoistableHeaders: new Set(['content-type', 'content-length']),
    },
  };

  const uploadUrl = await getSignedUrl(
    presigner.client,
    presigner.command,
    presigner.options
  );

  const publicBase = process.env.R2_PUBLIC_BASE_URL || `https://${bucket}.${process.env.R2_ACCOUNT_ID ?? 'account'}.r2.dev`;
  return {
    uploadUrl,
    publicUrl: `${publicBase}/${key}`,
    key,
    expiresIn: MAX_TTL_SECONDS,
  };
}

export const PRESIGN_LIMITS = {
  maxTtlSeconds: MAX_TTL_SECONDS,
  maxContentLength: MAX_CONTENT_LENGTH,
  allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
  allowedFolders: [...ALLOWED_FOLDERS],
};
