/**
 * File upload routes — product images.
 *
 * POST /api/uploads/product-image  (multipart, field "file")
 *   - dealer_admin / super_admin only
 *   - Saves to ./uploads/products/<dealerId>/<uuid>.<ext>
 *   - Returns { url: '/uploads/products/<dealerId>/<file>' }
 *
 * Files are served statically from the same /uploads prefix in index.ts.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';
import { requireRole } from '../middleware/roles';

const router = Router();

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(UPLOADS_ROOT);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dealerId = (req as Request).dealerId || (req as any).body?.dealerId;
    if (!dealerId) {
      cb(new Error('No dealer scope'), '');
      return;
    }
    const dir = path.join(UPLOADS_ROOT, 'products', dealerId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, WEBP, GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.use(authenticate, tenantGuard);

router.post(
  '/product-image',
  requireRole('dealer_admin'),
  (req: Request, res: Response) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Upload failed' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file received' });
        return;
      }
      const dealerId = req.dealerId!;
      const url = `/uploads/products/${dealerId}/${req.file.filename}`;
      res.status(201).json({ url });
    });
  },
);

export default router;
