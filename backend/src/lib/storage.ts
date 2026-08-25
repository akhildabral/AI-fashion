import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

// Local-disk storage for uploaded photos and generated images. Files are
// served statically under UPLOADS_URL_PREFIX (see app.ts). This is the simple
// self-hosted option; swapping in S3/MinIO later means changing only this file.
export const UPLOADS_DIR = path.resolve(process.cwd(), env.UPLOADS_DIR);
export const UPLOADS_URL_PREFIX = '/api/uploads';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export function urlForFilename(filename: string): string {
  return `${UPLOADS_URL_PREFIX}/${filename}`;
}

export function absPathForFilename(filename: string): string {
  // basename guards against path traversal from stored values.
  return path.join(UPLOADS_DIR, path.basename(filename));
}

export function saveBase64Image(b64: string, ext = 'png'): { filename: string; url: string } {
  const filename = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(b64, 'base64'));
  return { filename, url: urlForFilename(filename) };
}

export function deleteFile(filename: string): void {
  try {
    fs.unlinkSync(absPathForFilename(filename));
  } catch {
    // Already gone — nothing to do.
  }
}
