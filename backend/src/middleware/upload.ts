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
  return HEIC.has(file.mimetype) || (/\.hei[cf]$/i.test(file.originalname) && file.mimetype === 'application/octet-stream');
}

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'png';
}

// Uploads land in memory and are persisted through the storage driver by the
// controller (local disk or S3, depending on configuration).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB (HEIC originals run large)
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype] || looksHeic(file)) cb(null, true);
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
        const message = err instanceof Error ? err.message : 'Upload failed';
        return next(new HttpError(400, message));
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
