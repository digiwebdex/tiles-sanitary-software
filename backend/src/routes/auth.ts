import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { authenticate } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err: any) {
    const message = err.message || 'Login failed';
    const status = message.includes('Invalid') || message.includes('suspended') ? 401 : 400;
    res.status(status).json({ error: message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshTokens(refreshToken);

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Token refresh failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.json({ success: true });
  } catch {
    // Always return success for logout (don't leak token validity)
    res.json({ success: true });
  }
});

// POST /api/auth/logout-all (requires authentication)
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    await authService.logoutAll(req.user!.userId);
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

// GET /api/auth/me (returns current user info)
router.get('/me', authenticate, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
