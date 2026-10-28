/**
 * Client-safe upload limits (T062, FR-441).
 * Mirrors the authoritative PRESIGN_LIMITS exported by lib/uploads/presign.ts
 * so admin UI components can pre-validate BEFORE a presign request without
 * pulling the AWS SDK into the client bundle. Sync is asserted by
 * tests/unit/uploads-presign.test.ts.
 */

export const CLIENT_PRESIGN_LIMITS = {
  maxContentLength: 5 * 1024 * 1024, // 5 MB post-compression ceiling
  allowedContentTypes: ['image/webp', 'image/jpeg', 'image/png'],
  allowedFolders: ['portfolio', 'profiles', 'logo'],
  maxTtlSeconds: 5 * 60,
} as const;
