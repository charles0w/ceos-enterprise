'use client';

// Direct browser→Cloudinary uploads (signed by /api/social/cloudinary-sign).
// Used for: (1) backing up library assets so they're renderable from any
// device, (2) publishing finished renders to a shareable URL you can open on
// your phone to post.

export interface CloudUploadResult {
  secureUrl: string;
  publicId: string;
  bytes: number;
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // Cloudinary free-plan per-file cap

export async function uploadToCloudinary(
  file: Blob,
  opts: { folder?: string; publicId?: string; onProgress?: (ratio: number) => void } = {},
): Promise<CloudUploadResult> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`file is ${(file.size / 1e6).toFixed(0)}MB — Cloudinary free plan caps uploads at 100MB. Render a draft, or trim the cut.`);
  }

  const signRes = await fetch('/api/social/cloudinary-sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folder: opts.folder, publicId: opts.publicId }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error || `sign failed (${signRes.status})`);

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sign.apiKey);
  form.append('timestamp', String(sign.timestamp));
  form.append('signature', sign.signature);
  form.append('folder', sign.folder);
  if (sign.publicId) form.append('public_id', sign.publicId);

  const url = `https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`;

  // XHR (not fetch) for upload progress events.
  return new Promise<CloudUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { secure_url?: string; public_id?: string; bytes?: number; error?: { message?: string } };
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve({ secureUrl: data.secure_url, publicId: data.public_id ?? '', bytes: data.bytes ?? file.size });
        } else {
          reject(new Error(data.error?.message || `Cloudinary upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Cloudinary upload failed (network)'));
    xhr.send(form);
  });
}
