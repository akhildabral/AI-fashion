import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

// Storage seam for uploaded photos and generated images. Two drivers:
//   local — files on disk, served statically under UPLOADS_URL_PREFIX
//   s3    — S3-compatible object storage (AWS S3, Cloudflare R2, MinIO)
// Stored values in the DB are URLs; keys are flat uuid filenames, so
// keyFromStored() recovers the key from either driver's URL.

export interface StoredFile {
  key: string;
  url: string;
}

interface StorageDriver {
  save(buffer: Buffer, ext: string): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  urlFor(key: string): string;
}

export const UPLOADS_DIR = path.resolve(process.cwd(), env.UPLOADS_DIR);
export const UPLOADS_URL_PREFIX = '/api/uploads';

export const isLocalStorage = env.STORAGE_DRIVER === 'local';

class LocalDriver implements StorageDriver {
  constructor() {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  urlFor(key: string): string {
    return `${UPLOADS_URL_PREFIX}/${key}`;
  }

  async save(buffer: Buffer, ext: string): Promise<StoredFile> {
    const key = `${randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, key), buffer);
    return { key, url: this.urlFor(key) };
  }

  async read(key: string): Promise<Buffer> {
    return fs.promises.readFile(path.join(UPLOADS_DIR, path.basename(key)));
  }

  async remove(key: string): Promise<void> {
    await fs.promises.unlink(path.join(UPLOADS_DIR, path.basename(key)));
  }
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
};

class S3Driver implements StorageDriver {
  // Lazily constructed so the SDK is only loaded when the driver is active.
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-s3').then(
        ({ S3Client }) =>
          new S3Client({
            region: env.S3_REGION,
            ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
            ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
              ? {
                  credentials: {
                    accessKeyId: env.S3_ACCESS_KEY_ID,
                    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                  },
                }
              : {}),
          }),
      );
    }
    return this.clientPromise;
  }

  urlFor(key: string): string {
    if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    if (env.S3_ENDPOINT) return `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${key}`;
    return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
  }

  async save(buffer: Buffer, ext: string): Promise<StoredFile> {
    const key = `${randomUUID()}.${ext}`;
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
      }),
    );
    return { key, url: this.urlFor(key) };
  }

  async read(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object for key ${key}`);
    return Buffer.from(bytes);
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

export const storage: StorageDriver = isLocalStorage ? new LocalDriver() : new S3Driver();

// Stored DB values are URLs (or bare filenames from earlier versions); the key
// is always the final path segment. basename also guards against traversal.
export function keyFromStored(stored: string): string {
  return path.basename(stored.split('?')[0]);
}

export function mimeForKey(key: string): string {
  const ext = path.extname(key).toLowerCase().replace('.', '');
  return CONTENT_TYPES[ext] ?? 'image/png';
}

export function urlForFilename(filename: string): string {
  return storage.urlFor(keyFromStored(filename));
}

export async function saveBase64Image(b64: string, ext = 'png'): Promise<StoredFile> {
  return storage.save(Buffer.from(b64, 'base64'), ext);
}

export async function saveImageBuffer(buffer: Buffer, ext = 'png'): Promise<StoredFile> {
  return storage.save(buffer, ext);
}

export async function readStored(stored: string): Promise<Buffer> {
  return storage.read(keyFromStored(stored));
}

export async function deleteFile(stored: string): Promise<void> {
  try {
    await storage.remove(keyFromStored(stored));
  } catch {
    // Already gone — nothing to do.
  }
}
