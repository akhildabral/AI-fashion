import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import convert from 'heic-convert';
import { HttpError } from './error';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// iPhone gallery photos arrive as HEIC; they're converted to JPEG on the way
// in so the rest of the pipeline only ever sees the three formats above.
const HEIC = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

function looksHeic(file: { mimetype: string; originalname: string }): boolean {
  return HEIC.has(file.mimetype) || (/\.hei[cf]$/i.test(file.originalname) && (file.mimetype === 'application/octet-stream' || !file.mimetype));
}

// Phones sometimes send a photo with no type, or as octet-stream. The bytes
// know what they are: read the magic numbers instead of trusting the label.
function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const brand = buf.toString('ascii', 8, 12);
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(brand)) return 'image/heic';
  return null;
}
const UNTYPED = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'png';
}

// Uploads land in memory and are persisted through the storage driver by the
// controller (local disk or S3, depending on configuration).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB (HEIC originals run large)
  fileFilter: (_req, file, cb) => {
    // Untyped files are let through and sniffed once the bytes are in.
    if (EXT_BY_MIME[file.mimetype] || looksHeic(file) || UNTYPED.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP or HEIC images are allowed'));
  },
});

// Build middleware that accepts a single image under the given field name and
// turns multer errors into clean 400s via the central error handler.
function singleImageUpload(field: string) {
  const handler = upload.single(field);
  return function (req: Request, res: Response, next: NextFunction) {
    handler(req, res, (err: unknown) => {
      if (err) {
        const raw = err instanceof Error ? err.message : 'Upload failed';
        // busboy's words for a body that ended before its closing boundary.
        const message = /unexpected end of form|unexpected end of multipart|malformed part header/i.test(raw)
          ? 'The upload was cut short — try that photo again.'
          : raw;
        return next(new HttpError(400, message));
      }
      if (req.file && UNTYPED.has(req.file.mimetype)) {
        const sniffed = sniffMime(req.file.buffer);
        if (!sniffed) return next(new HttpError(400, 'Only JPEG, PNG, WebP or HEIC images are allowed'));
        req.file.mimetype = sniffed;
      }
      if (req.file && looksHeic(req.file)) {
        convert({ buffer: new Uint8Array(req.file.buffer), format: 'JPEG', quality: 0.92 })
          .then((out) => {
            req.file!.buffer = Buffer.from(out);
            req.file!.mimetype = 'image/jpeg';
            req.file!.size = req.file!.buffer.length;
            req.file!.originalname = req.file!.originalname.replace(/\.hei[cf]$/i, '.jpg');
            next();
          })
          .catch(() => next(new HttpError(400, 'That HEIC photo could not be read — try exporting it as JPEG.')));
        return;
      }
      next();
    });
  };
}

export const handlePhotoUpload = singleImageUpload('photo');
export const handleItemUpload = singleImageUpload('image');
