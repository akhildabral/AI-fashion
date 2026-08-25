import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { UPLOADS_DIR } from '../lib/storage';
import { HttpError } from './error';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}.${EXT_BY_MIME[file.mimetype] ?? 'png'}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
  },
}).single('photo');

// Wrap multer so its errors become clean 400s via the central error handler.
export function handlePhotoUpload(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      return next(new HttpError(400, message));
    }
    next();
  });
}
