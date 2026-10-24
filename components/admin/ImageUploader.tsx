'use client';

/**
 * ImageUploader (T062, US9, FR-441)
 * Client-side compression with browser-image-compression (WebP, <=1200px,
 * <=200KB target), then POST /api/admin/uploads/presign, then direct PUT to
 * the presigned uploadUrl. File bytes never touch our server.
 * Field-level type/size validation happens BEFORE any presign request.
 */

import React, { useRef, useState } from 'react';
import { CLIENT_PRESIGN_LIMITS as PRESIGN_LIMITS } from '@/lib/uploads/presignLimits';

export interface UploadedImage {
  publicUrl: string;
  key: string;
}

interface ImageUploaderProps {
  folder: 'portfolio' | 'profiles' | 'logo';
  label: string;
  onUploaded: (image: UploadedImage) => void;
  onError?: (message: string) => void;
}

export const MAX_UPLOAD_BYTES = 200 * 1024; // 200KB post-compression target

export default function ImageUploader({ folder, label, onUploaded, onError }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function validate(file: File): string | null {
    if (!(PRESIGN_LIMITS.allowedContentTypes as readonly string[]).includes(file.type)) {
      return `Unsupported type "${file.type || 'unknown'}". Allowed: ${PRESIGN_LIMITS.allowedContentTypes.join(', ')}`;
    }
    if (file.size > PRESIGN_LIMITS.maxContentLength) {
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${PRESIGN_LIMITS.maxContentLength / 1024 / 1024}MB before compression.`;
    }
    return null;
  }

  async function handleFile(file: File) {
    setFieldError(null);
    const invalid = validate(file);
    if (invalid) {
      setFieldError(invalid);
      onError?.(invalid);
      return;
    }

    setBusy(true);
    try {
      // Compress client-side: WebP, max 1200px, target ~0.2MB
      const imageCompression = (await import('browser-image-compression')).default;
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        maxSizeMB: 0.2,
        fileType: 'image/webp',
        useWebWorker: true,
      });

      if (compressed.size > PRESIGN_LIMITS.maxContentLength) {
        throw new Error('Compressed image still exceeds the 5MB upload ceiling');
      }

      // 1. Presign
      const presignRes = await fetch('/api/admin/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: compressed.type,
          contentLength: compressed.size,
          folder,
          extension: 'webp',
        }),
      });
      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({}));
        throw new Error(data.error || `Presign failed (${presignRes.status})`);
      }
      const presign = (await presignRes.json()) as {
        uploadUrl: string;
        publicUrl: string;
        key: string;
      };

      // 2. Direct PUT to storage (bytes bypass our server)
      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': compressed.type },
        body: compressed,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      setPreviewUrl(presign.publicUrl);
      onUploaded({ publicUrl: presign.publicUrl, key: presign.key });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setFieldError(message);
      onError?.(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-base-content/60">{label}</label>
      <div className="flex items-center gap-3">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Uploaded preview"
            className="w-16 h-16 rounded-lg object-cover border border-base-300"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept={PRESIGN_LIMITS.allowedContentTypes.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          disabled={busy}
          className="block w-full text-xs text-base-content/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-medium hover:file:bg-purple-500 disabled:opacity-50"
        />
      </div>
      {busy && <p className="text-xs text-purple-400">Compressing &amp; uploading…</p>}
      {fieldError && <p className="text-xs text-error">{fieldError}</p>}
    </div>
  );
}
