import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from './error';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'png';
}

// Uploads land in memory and are persisted through the storage driver by the
// controller (local disk or S3, depending on configuration).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
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
      next();
    });
  };
}

export const handlePhotoUpload = singleImageUpload('photo');
export const handleItemUpload = singleImageUpload('image');
