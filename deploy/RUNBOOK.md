# TilesERP — Production Domain Deployment Runbook

**Project:** TilesERP (`/var/www/tilessaas`)
**VPS:** Hostinger, IP `187.77.144.38`
**Domain:** `sanitileserp.com`
**Backend runtime:** PM2 Node process on `127.0.0.1:3003`
**App routing model:** Single SPA bundle, host-based routing in nginx

> ⚠️ This runbook **only touches files belonging to this project**.
> Other VPS projects, their nginx site configs, their PM2 processes,
> and the global `nginx.conf` are **not modified**.

---

## 1. DNS — verify (already done by you)

```bash
dig +short sanitileserp.com         # → 187.77.144.38
dig +short www.sanitileserp.com     # → 187.77.144.38
dig +short app.sanitileserp.com     # → 187.77.144.38
dig +short portal.sanitileserp.com  # → 187.77.144.38
dig +short api.sanitileserp.com     # → 187.77.144.38
```

All five must return `187.77.144.38`. If not, fix DNS first.

---

## 2. Pull the new configs to the VPS

SSH into the VPS, then:

```bash
cd /var/www/tilessaas
git pull origin main
```

You should now see the four new files under `deploy/nginx/`:

```
deploy/nginx/sanitileserp.com.conf
deploy/nginx/app.sanitileserp.com.conf
deploy/nginx/portal.sanitileserp.com.conf
deploy/nginx/api.sanitileserp.com.conf
```

---

## 3. Install nginx site configs (isolated — does not touch other sites)

```bash
# Copy ONLY this project's site configs into nginx
sudo cp /var/www/tilessaas/deploy/nginx/sanitileserp.com.conf        /etc/nginx/sites-available/sanitileserp.com.conf
sudo cp /var/www/tilessaas/deploy/nginx/app.sanitileserp.com.conf    /etc/nginx/sites-available/app.sanitileserp.com.conf
sudo cp /var/www/tilessaas/deploy/nginx/portal.sanitileserp.com.conf /etc/nginx/sites-available/portal.sanitileserp.com.conf
sudo cp /var/www/tilessaas/deploy/nginx/api.sanitileserp.com.conf    /etc/nginx/sites-available/api.sanitileserp.com.conf

# Enable them
sudo ln -sf /etc/nginx/sites-available/sanitileserp.com.conf        /etc/nginx/sites-enabled/sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/app.sanitileserp.com.conf    /etc/nginx/sites-enabled/app.sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/portal.sanitileserp.com.conf /etc/nginx/sites-enabled/portal.sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/api.sanitileserp.com.conf    /etc/nginx/sites-enabled/api.sanitileserp.com.conf
```

> No `default_server` is claimed, no `nginx.conf` is edited, no other site
> in `sites-enabled/` is touched.

---

## 4. Issue SSL certificates with Certbot

Make sure certbot's webroot exists (the configs reference `/var/www/certbot`):

```bash
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

**Important:** the HTTPS server blocks reference `fullchain.pem` files that
don't exist yet. Before the first reload, temporarily comment out the
`listen 443 ssl ...` blocks **OR** use the easier path: issue certs with
`--nginx` plugin which handles this automatically.

### Option A — Recommended: webroot-then-reload (safe, no edits needed)

Disable the four sites for one minute, issue certs against a stripped HTTP-only
config, then re-enable:

```bash
# 1. Temporarily unlink the 4 site files
sudo rm /etc/nginx/sites-enabled/sanitileserp.com.conf \
        /etc/nginx/sites-enabled/app.sanitileserp.com.conf \
        /etc/nginx/sites-enabled/portal.sanitileserp.com.conf \
        /etc/nginx/sites-enabled/api.sanitileserp.com.conf

# 2. Drop a one-time HTTP-only stub so certbot can answer ACME
sudo tee /etc/nginx/sites-enabled/_sanitileserp_acme.conf > /dev/null <<'EOF'
server {
  listen 80;
  server_name sanitileserp.com www.sanitileserp.com app.sanitileserp.com portal.sanitileserp.com api.sanitileserp.com;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 200 "ok"; }
}
EOF

sudo nginx -t && sudo systemctl reload nginx

# 3. Issue ONE cert with all 5 names (simpler renewal)
sudo certbot certonly --webroot -w /var/www/certbot \
  -d sanitileserp.com \
  -d www.sanitileserp.com \
  -d app.sanitileserp.com \
  -d portal.sanitileserp.com \
  -d api.sanitileserp.com \
  --email YOUR_EMAIL@example.com --agree-tos --no-eff-email
```

> If you used **one combined cert** above, edit the four configs to all point
> at `/etc/letsencrypt/live/sanitileserp.com/fullchain.pem` and the matching
> `privkey.pem` (the configs are already wired this way for the root domain;
> just change the `app.*`, `portal.*`, `api.*` configs to use the same path).

```bash
sudo sed -i 's|/etc/letsencrypt/live/app.sanitileserp.com/|/etc/letsencrypt/live/sanitileserp.com/|g'    /etc/nginx/sites-available/app.sanitileserp.com.conf
sudo sed -i 's|/etc/letsencrypt/live/portal.sanitileserp.com/|/etc/letsencrypt/live/sanitileserp.com/|g' /etc/nginx/sites-available/portal.sanitileserp.com.conf
sudo sed -i 's|/etc/letsencrypt/live/api.sanitileserp.com/|/etc/letsencrypt/live/sanitileserp.com/|g'    /etc/nginx/sites-available/api.sanitileserp.com.conf
```

```bash
# 4. Remove the stub, re-enable the real configs
sudo rm /etc/nginx/sites-enabled/_sanitileserp_acme.conf
sudo ln -sf /etc/nginx/sites-available/sanitileserp.com.conf        /etc/nginx/sites-enabled/sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/app.sanitileserp.com.conf    /etc/nginx/sites-enabled/app.sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/portal.sanitileserp.com.conf /etc/nginx/sites-enabled/portal.sanitileserp.com.conf
sudo ln -sf /etc/nginx/sites-available/api.sanitileserp.com.conf    /etc/nginx/sites-enabled/api.sanitileserp.com.conf

sudo nginx -t && sudo systemctl reload nginx
```

### Option B — Easier: Certbot --nginx plugin

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d sanitileserp.com -d www.sanitileserp.com \
  -d app.sanitileserp.com -d portal.sanitileserp.com -d api.sanitileserp.com \
  --email YOUR_EMAIL@example.com --agree-tos --no-eff-email --redirect
```

Certbot will edit the configs in-place to add the right `ssl_certificate` lines.

### Auto-renewal (already installed by the certbot package)

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 5. Update the project `.env` on the VPS

```bash
cd /var/www/tilessaas
cp .env.production .env       # if not already done
nano .env                     # fill in real DB_PASSWORD, JWT secrets, SMTP, SMS
```

Verify the production values match:

```
VITE_API_URL=https://api.sanitileserp.com/api
CORS_ORIGIN=https://sanitileserp.com,https://www.sanitileserp.com,https://app.sanitileserp.com,https://portal.sanitileserp.com
COOKIE_DOMAIN=.sanitileserp.com
```

---

## 6. Rebuild the frontend SPA (single bundle for all subdomains)

```bash
cd /var/www/tilessaas
npm ci
npm run build      # outputs to /var/www/tilessaas/dist (matches nginx root)
```

---

## 7. Restart **only this project's** PM2 process

> ⚠️ Do **not** run `pm2 restart all` — that would touch other projects.

```bash
# Find this project's PM2 process name
pm2 list

# Restart ONLY tileserp-api (or whatever name yours uses)
pm2 restart tileserp-api --update-env
pm2 save
```

If the backend is not yet under PM2:

```bash
cd /var/www/tilessaas/backend
npm ci && npm run build
pm2 start dist/index.js --name tileserp-api --update-env
pm2 save
```

The backend now reads `PORT=3003` and `CORS_ORIGIN=...sanitileserp.com,...` from `.env`.

---

## 8. Verification checklist

Run from your **local machine** (not the VPS):

```bash
# Root domain → landing page (200, HTML)
curl -I https://sanitileserp.com

# www → 301 to root
curl -I https://www.sanitileserp.com

# app subdomain → / 302s to /login
curl -I https://app.sanitileserp.com/

# portal subdomain → / 302s to /portal/login
curl -I https://portal.sanitileserp.com/

# API health endpoint
curl https://api.sanitileserp.com/api/health

# HTTP must redirect to HTTPS everywhere
curl -I http://sanitileserp.com
curl -I http://app.sanitileserp.com
curl -I http://portal.sanitileserp.com
curl -I http://api.sanitileserp.com
```

Browser checks:
- [ ] `https://sanitileserp.com` → marketing landing page, padlock green
- [ ] `https://www.sanitileserp.com` → redirects to `https://sanitileserp.com`
- [ ] `https://app.sanitileserp.com` → ERP login page
- [ ] `https://portal.sanitileserp.com` → portal login page
- [ ] Login on `app.*`, then DevTools → Network → API requests go to `https://api.sanitileserp.com/api/...` with `200`
- [ ] No CORS errors in console
- [ ] No mixed-content warnings
- [ ] Other VPS projects still load on their own domains

---

## 9. Rollback (if anything misbehaves)

```bash
# Disable just this project's nginx sites
sudo rm /etc/nginx/sites-enabled/sanitileserp.com.conf \
        /etc/nginx/sites-enabled/app.sanitileserp.com.conf \
        /etc/nginx/sites-enabled/portal.sanitileserp.com.conf \
        /etc/nginx/sites-enabled/api.sanitileserp.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

This leaves every other site on the VPS untouched.
