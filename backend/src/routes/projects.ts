/**
 * Projects + Project Sites — VPS migration phase 3U-25.
 *
 * Mirrors src/services/projectService.ts (full surface: list, CRUD, sites CRUD,
 * pickers, project+site lookup, next-code generator).
 *
 *   GET    /api/projects?dealerId=&search=&status=&customerId=
 *   GET    /api/projects/picker?dealerId=&customerId=
 *   GET    /api/projects/next-code?dealerId=
 *   GET    /api/projects/lookup?dealerId=&projectId=&siteId=  (project+site detail)
 *   GET    /api/projects/:id                                  (full project)
 *   POST   /api/projects                                      { dealer_id, ...input }
 *   PUT    /api/projects/:id                                  { dealer_id, ...patch }
 *   DELETE /api/projects/:id?dealerId=
 *
 *   GET    /api/projects/:id/sites?dealerId=
 *   GET    /api/projects/:id/sites/picker?dealerId=
 *   POST   /api/projects/:id/sites                            { dealer_id, ...input }
 *   PUT    /api/projects/sites/:siteId                        { dealer_id, ...patch }
 *   DELETE /api/projects/sites/:siteId?dealerId=
 *
 * Dealer-scoped via tenantGuard. Mutations require dealer_admin (matches
 * legacy Supabase RLS that allowed dealer staff but UI gates to admin).
 * Salesman is read-only — they may need to pick projects for sales.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard } from '../middleware/tenant';

const router = Router();
router.use(authenticate, tenantGuard);

function resolveDealer(req: Request, res: Response): string | null {
  const isSuper = req.user?.roles.includes('super_admin');
  const claimed =
    (req.query.dealerId as string | undefined) ||
    (req.body?.dealer_id as string | undefined) ||
    undefined;
  if (isSuper) {
    if (!claimed) {
      res.status(400).json({ error: 'super_admin must specify dealerId' });
      return null;
    }
    return claimed;
  }
  if (!req.dealerId) {
    res.status(403).json({ error: 'No dealer assigned to your account' });
    return null;
  }
  if (claimed && claimed !== req.dealerId) {
    res.status(403).json({ error: 'dealerId mismatch' });
    return null;
  }
  return req.dealerId;
}

function requireAdmin(req: Request, res: Response): boolean {
  const roles = (req.user?.roles ?? []) as string[];
  if (!roles.includes('dealer_admin') && !roles.includes('super_admin')) {
    res.status(403).json({ error: 'Only dealer_admin can manage projects' });
    return false;
  }
  return true;
}

const trimOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : null;
  const t = v.trim();
  return t === '' ? null : t;
};

const projectInput = z.object({
  customer_id: z.string().uuid(),
  project_name: z.string().min(1).max(255),
  project_code: z.string().max(50).optional().nullable(),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled']).optional(),
  notes: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  expected_end_date: z.string().optional().nullable(),
});

const projectPatch = projectInput.partial();

const siteInput = z.object({
  project_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  site_name: z.string().min(1).max(255),
  address: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

const sitePatch = siteInput.partial();

// ─── Projects ───────────────────────────────────────────────────────────────

/** GET /api/projects/next-code — RPC wrapper for get_next_project_code(). */
router.get('/next-code', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const r = await db.raw<{ rows: { get_next_project_code: string }[] }>(
      'SELECT public.get_next_project_code(?::uuid) AS get_next_project_code',
      [dealerId],
    );
    res.json({ code: r.rows[0]?.get_next_project_code ?? null });
  } catch (err: any) {
    console.error('[projects.nextCode] error', err);
    res.status(500).json({ error: err?.message || 'Failed to generate project code' });
  }
});

/** GET /api/projects/picker — lightweight active projects for dropdowns. */
router.get('/picker', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const customerId = (req.query.customerId as string) || null;
    let q = db('projects')
      .where({ dealer_id: dealerId, status: 'active' })
      .orderBy('project_name', 'asc')
      .select('id', 'project_name', 'project_code', 'customer_id', 'status');
    if (customerId) q = q.where({ customer_id: customerId });
    const rows = await q;
    res.json(rows);
  } catch (err: any) {
    console.error('[projects.picker] error', err);
    res.status(500).json({ error: err?.message || 'Failed to list projects' });
  }
});

/** GET /api/projects/lookup — project + site detail by id (for documents). */
router.get('/lookup', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const projectId = (req.query.projectId as string) || null;
    const siteId = (req.query.siteId as string) || null;

    const [project, site] = await Promise.all([
      projectId
        ? db('projects')
            .where({ id: projectId, dealer_id: dealerId })
            .first('id', 'project_name', 'project_code')
        : Promise.resolve(null),
      siteId
        ? db('project_sites')
            .where({ id: siteId, dealer_id: dealerId })
            .first('id', 'site_name', 'address', 'contact_person', 'contact_phone')
        : Promise.resolve(null),
    ]);

    res.json({ project: project ?? null, site: site ?? null });
  } catch (err: any) {
    console.error('[projects.lookup] error', err);
    res.status(500).json({ error: err?.message || 'Failed to lookup project/site' });
  }
});

/** GET /api/projects — full list with customer join + filters. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const search = ((req.query.search as string) || '').trim();
    const status = (req.query.status as string) || '';
    const customerId = (req.query.customerId as string) || null;

    let q = db('projects as p')
      .leftJoin('customers as c', 'p.customer_id', 'c.id')
      .where('p.dealer_id', dealerId)
      .orderBy('p.created_at', 'desc')
      .select(
        'p.*',
        'c.id as c_id',
        'c.name as c_name',
        'c.phone as c_phone',
      );

    if (status) q = q.where('p.status', status);
    if (customerId) q = q.where('p.customer_id', customerId);
    if (search) {
      q = q.where((b) => {
        b.whereILike('p.project_name', `%${search}%`).orWhereILike(
          'p.project_code',
          `%${search}%`,
        );
      });
    }

    const rows = await q;
    const data = rows.map((r: any) => {
      const { c_id, c_name, c_phone, ...rest } = r;
      return {
        ...rest,
        customer: c_id ? { id: c_id, name: c_name, phone: c_phone } : null,
      };
    });
    res.json(data);
  } catch (err: any) {
    console.error('[projects.list] error', err);
    res.status(500).json({ error: err?.message || 'Failed to list projects' });
  }
});

/** GET /api/projects/:id — single project. */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const row = await db('projects')
      .where({ id: req.params.id, dealer_id: dealerId })
      .first('*');
    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(row);
  } catch (err: any) {
    console.error('[projects.getById] error', err);
    res.status(500).json({ error: err?.message || 'Failed to load project' });
  }
});

/** POST /api/projects — create (auto-generates project_code if missing). */
router.post('/', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = projectInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const input = parsed.data;

    let code = (input.project_code ?? '').trim();
    if (!code) {
      const r = await db.raw<{ rows: { get_next_project_code: string }[] }>(
        'SELECT public.get_next_project_code(?::uuid) AS get_next_project_code',
        [dealerId],
      );
      code = r.rows[0]?.get_next_project_code ?? '';
    }

    const [row] = await db('projects')
      .insert({
        dealer_id: dealerId,
        customer_id: input.customer_id,
        project_name: input.project_name.trim(),
        project_code: code,
        status: input.status ?? 'active',
        notes: trimOrNull(input.notes),
        start_date: input.start_date || null,
        expected_end_date: input.expected_end_date || null,
        created_by: req.user?.id ?? null,
      })
      .returning('*');

    res.status(201).json(row);
  } catch (err: any) {
    console.error('[projects.create] error', err);
    res.status(500).json({ error: err?.message || 'Failed to create project' });
  }
});

/** PUT /api/projects/:id — partial update. */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = projectPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const p = parsed.data;
    const patch: Record<string, unknown> = {};
    if (p.project_name !== undefined) patch.project_name = p.project_name.trim();
    if (p.project_code !== undefined) patch.project_code = (p.project_code ?? '').trim();
    if (p.customer_id !== undefined) patch.customer_id = p.customer_id;
    if (p.status !== undefined) patch.status = p.status;
    if (p.notes !== undefined) patch.notes = trimOrNull(p.notes);
    if (p.start_date !== undefined) patch.start_date = p.start_date || null;
    if (p.expected_end_date !== undefined) patch.expected_end_date = p.expected_end_date || null;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const [row] = await db('projects')
      .where({ id: req.params.id, dealer_id: dealerId })
      .update(patch)
      .returning('*');

    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(row);
  } catch (err: any) {
    console.error('[projects.update] error', err);
    res.status(500).json({ error: err?.message || 'Failed to update project' });
  }
});

/** DELETE /api/projects/:id — hard delete (cascades to sites). */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const n = await db('projects')
      .where({ id: req.params.id, dealer_id: dealerId })
      .del();
    if (n === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[projects.remove] error', err);
    // FK violation (challans/deliveries/portal_requests reference this project)
    if (err?.code === '23503') {
      res.status(409).json({
        error: 'Cannot delete: this project is referenced by challans, deliveries, or portal requests',
      });
      return;
    }
    res.status(500).json({ error: err?.message || 'Failed to delete project' });
  }
});

// ─── Sites ──────────────────────────────────────────────────────────────────

/** GET /api/projects/:id/sites — all sites for a project. */
router.get('/:id/sites', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const rows = await db('project_sites')
      .where({ project_id: req.params.id, dealer_id: dealerId })
      .orderBy('created_at', 'asc')
      .select('*');
    res.json(rows);
  } catch (err: any) {
    console.error('[projects.listSites] error', err);
    res.status(500).json({ error: err?.message || 'Failed to list sites' });
  }
});

/** GET /api/projects/:id/sites/picker — active sites for dropdowns. */
router.get('/:id/sites/picker', async (req: Request, res: Response) => {
  try {
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const rows = await db('project_sites')
      .where({
        project_id: req.params.id,
        dealer_id: dealerId,
        status: 'active',
      })
      .orderBy('site_name', 'asc')
      .select('id', 'site_name', 'address', 'status');
    res.json(rows);
  } catch (err: any) {
    console.error('[projects.sitePicker] error', err);
    res.status(500).json({ error: err?.message || 'Failed to list sites' });
  }
});

/** POST /api/projects/:id/sites — create site. */
router.post('/:id/sites', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = siteInput.safeParse({
      ...req.body,
      project_id: req.params.id, // path is authoritative
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const input = parsed.data;

    const [row] = await db('project_sites')
      .insert({
        dealer_id: dealerId,
        project_id: input.project_id,
        customer_id: input.customer_id,
        site_name: input.site_name.trim(),
        address: trimOrNull(input.address),
        contact_person: trimOrNull(input.contact_person),
        contact_phone: trimOrNull(input.contact_phone),
        notes: trimOrNull(input.notes),
        status: input.status ?? 'active',
        created_by: req.user?.id ?? null,
      })
      .returning('*');

    res.status(201).json(row);
  } catch (err: any) {
    console.error('[projects.createSite] error', err);
    res.status(500).json({ error: err?.message || 'Failed to create site' });
  }
});

/** PUT /api/projects/sites/:siteId — partial update. */
router.put('/sites/:siteId', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const parsed = sitePatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const p = parsed.data;
    const patch: Record<string, unknown> = {};
    if (p.site_name !== undefined) patch.site_name = p.site_name.trim();
    if (p.address !== undefined) patch.address = trimOrNull(p.address);
    if (p.contact_person !== undefined) patch.contact_person = trimOrNull(p.contact_person);
    if (p.contact_phone !== undefined) patch.contact_phone = trimOrNull(p.contact_phone);
    if (p.notes !== undefined) patch.notes = trimOrNull(p.notes);
    if (p.status !== undefined) patch.status = p.status;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const [row] = await db('project_sites')
      .where({ id: req.params.siteId, dealer_id: dealerId })
      .update(patch)
      .returning('*');

    if (!row) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    res.json(row);
  } catch (err: any) {
    console.error('[projects.updateSite] error', err);
    res.status(500).json({ error: err?.message || 'Failed to update site' });
  }
});

/** DELETE /api/projects/sites/:siteId — hard delete. */
router.delete('/sites/:siteId', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const dealerId = resolveDealer(req, res);
    if (!dealerId) return;
    const n = await db('project_sites')
      .where({ id: req.params.siteId, dealer_id: dealerId })
      .del();
    if (n === 0) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[projects.removeSite] error', err);
    if (err?.code === '23503') {
      res.status(409).json({
        error: 'Cannot delete: this site is referenced by challans or deliveries',
      });
      return;
    }
    res.status(500).json({ error: err?.message || 'Failed to delete site' });
  }
});

export default router;
