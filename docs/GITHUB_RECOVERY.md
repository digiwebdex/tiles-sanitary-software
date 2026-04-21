# GitHub Disconnect & Reconnect Recovery Checklist

Use this checklist when the Lovable ↔ GitHub sync breaks (e.g. the repo was
deleted on GitHub, the GitHub App was uninstalled, the org/owner changed, or
pushes/pulls stopped flowing in either direction).

> ⚠️ Lovable's GitHub link is managed in the **Lovable UI** (not via the chat
> agent or the standard Connectors API). You must perform these steps yourself
> in the editor.

---

## 0. Before you start (safety net)

1. **Open the Lovable editor** for this project.
2. **Open Project History** (clock icon top-right, or `+` → "History") and
   confirm a recent restore point exists. This is your rollback if anything
   goes wrong.
3. If your GitHub repo still exists, **clone it locally** as a backup:
   ```bash
   git clone https://github.com/<owner>/<repo>.git tilesserp-backup
   ```
4. **Export the database** (separate from code):
   `Cloud → Database → Tables → Export` (CSV per table).

---

## 1. Diagnose what's broken

Pick the row that matches your situation:

| Symptom | Likely cause | Jump to |
|---|---|---|
| Lovable says "repository not found" | Repo deleted on GitHub | Step 2 |
| Pushes from Lovable not appearing on GitHub | GitHub App uninstalled / token revoked | Step 2 |
| Local commits don't appear in Lovable | Webhook broken / wrong default branch | Step 2 |
| Wrong GitHub account / org connected | Need to switch owner | Step 2 |
| "Lovable can't reconnect with Git" | Stale link — must disconnect first | Step 2 |

---

## 2. Disconnect the existing GitHub link

**Desktop:**
1. In the left sidebar, open **Connectors** (root level).
2. Click **GitHub**.
3. Click **Disconnect project** (or the `⋯` menu → **Disconnect**).
4. Confirm in the dialog.

**Mobile:**
1. Tap the `…` button (bottom-right, in Chat mode) → **Settings**.
2. Open the **GitHub** tab.
3. Tap **Disconnect from GitHub** and confirm.

**Also clean up on GitHub's side** (recommended — prevents stale auth):
1. Go to <https://github.com/settings/installations>.
2. Find **Lovable** → **Configure**.
3. Either remove this repo from the allowed list, or scroll down and
   **Uninstall** the app entirely (you'll reinstall in Step 3).

---

## 3. Reconnect to a fresh GitHub repository

1. Back in Lovable, open **Connectors** → **GitHub** → **Connect project**.
2. The browser will redirect to GitHub. **Authorize the Lovable GitHub App.**
3. Choose the **account or organization** that should own the new repo.
4. (If prompted) grant access to **All repositories** or **Only select
   repositories** — if you choose "Only select", make sure the new repo (or
   "Create new repositories" permission) is included.
5. Back in Lovable, click **Create Repository**.
6. Pick a **repo name** (must not already exist on the chosen account) and
   **visibility** (Private recommended for ERP code).
7. Wait for the green "Connected" indicator and the first push to complete.

---

## 4. Verify the sync works both ways

**Lovable → GitHub:**
1. Make a tiny edit in Lovable (e.g. add a blank line to `README.md`).
2. Open the new repo on GitHub → confirm the commit appears within ~30s.

**GitHub → Lovable:**
1. On GitHub, edit `README.md` directly in the web UI and commit to the
   default branch.
2. In Lovable, open the file via the **Code Editor** view — confirm the
   change appears within ~30s.

If either direction fails, repeat Steps 2–3 (the most common cause is the
GitHub App not having access to the new repo).

---

## 5. Restore your local clone (if you had one)

If you cloned the **old** repo before disconnecting, repoint it at the new
remote so you don't lose local-only commits:

```bash
cd tilesserp-backup
git remote set-url origin https://github.com/<new-owner>/<new-repo>.git
git fetch origin
git status                          # see if anything is ahead
git push origin <your-branch>       # push any local-only work
```

---

## 6. Re-verify production deploy (VPS)

This project deploys from GitHub to the Hostinger VPS. After reconnecting:

```bash
ssh root@187.77.144.38
cd /var/www/tilessaas

# Point at the new repo (only if the URL changed)
git remote set-url origin https://github.com/<new-owner>/<new-repo>.git

# Pull and run the standard update cycle
git pull origin main \
  && cd backend && npm install && npm run build && pm2 restart tilesserp-backend \
  && cd .. && npm install && npm run build
```

Confirm:
- `pm2 status` → `tilesserp-backend` is **online** on port **3003**.
- `https://app.sanitileserp.com` loads and login works.

---

## Common pitfalls

- **"Repository already exists"** when creating in Step 3 → pick a different
  name, or delete the conflicting repo on GitHub first.
- **Only one GitHub account per Lovable account.** If you need a different
  account, sign out of GitHub in your browser before clicking
  **Connect project**.
- **Don't run `git` commands inside the Lovable sandbox** — Lovable manages
  git state internally. Only run git on your local clone or the VPS.
- **Database does not move with the repo.** Code is in GitHub; data lives in
  Lovable Cloud. Always export/backup the DB separately.
- **Branch switching is experimental.** Enable via Account Settings → Labs →
  "GitHub Branch Switching" only if you actually need it.

---

## Quick reference

| Action | Where |
|---|---|
| Disconnect GitHub | Connectors → GitHub → Disconnect project |
| Reconnect GitHub | Connectors → GitHub → Connect project → Create Repository |
| Uninstall Lovable on GitHub | <https://github.com/settings/installations> |
| Project History (rollback) | Clock icon (top-right) or `+` → History |
| Export database | Cloud → Database → Tables → Export |
| VPS deploy script | `docs/DEPLOYMENT_COMMANDS.md` |
