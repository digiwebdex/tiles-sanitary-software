# RESOURCE_LOCK.md

## Purpose
This file defines **hard protection rules** for the Lovable.dev agent and any developer working on this project.

The goal is to keep this site stable, isolated, and safe when:
- deploying on a VPS
- hosting multiple projects on the same server
- editing other projects on the VPS
- updating this project in the future

This project must remain self-contained and must not be changed in ways that can break the live site or affect other projects.

---

## Agent Instruction: Resource Lock Policy

You are working on a production-sensitive project.

### DO NOT CHANGE these locked resources unless the user gives explicit permission in writing:
1. **API base URLs**
2. **Application port**
3. **Database folder / database path**
4. **Project root folder / project directory name**
5. **VPS deployment structure that keeps this project isolated**
6. **Reverse proxy mappings for this project**
7. **Environment variable names already used by production**
8. **Build/output paths already used by deployment**
9. **Process manager names (PM2, systemd, Docker service names) if already configured**
10. **Nginx / Apache config bindings that serve the current live site**

---

## Locked Items

### 1) API Lock
- Do not change existing API endpoints.
- Do not change API base URL.
- Do not rename API routes.
- Do not move backend integration to a different service.
- Do not replace fetch/axios base configuration unless explicitly approved.
- Do not add breaking API changes.

### 2) Port Lock
- Do not change the project port.
- Do not reuse this project's port for another project.
- Do not modify proxy_pass or upstream port mapping.
- Do not change internal container port or service port without approval.

### 3) Database Folder Lock
- Do not rename the database folder.
- Do not move the database folder to another location.
- Do not point the project to another database folder.
- Do not delete, recreate, reset, or overwrite the database directory.
- Do not change file permissions on the database folder unless required for recovery and explicitly approved.

### 4) Project Folder Lock
- Do not rename the project folder.
- Do not move the project into another shared folder.
- Do not merge this project with another app.
- Do not reuse this project's directory for another deployment.
- Do not delete hidden files, config files, or lock files inside the project unless explicitly requested.

---

## VPS Isolation Rules

When this project is hosted on a VPS with other projects, the agent must ensure:

### Project isolation is mandatory
- Each project must have its **own folder**
- Each project must have its **own port**
- Each project must have its **own environment file**
- Each project must have its **own database/storage folder**
- Each project must have its **own process/service name**
- Each project must have its **own web server config**
- Each project must have its **own logs**

### No cross-project impact
Changes made to another VPS project must **never**:
- stop this project's process
- overwrite this project's env values
- reuse this project's port
- change this project's domain config
- change this project's database path
- modify this project's Nginx/Apache block
- alter file permissions of this project
- remove or overwrite build files of this project

### Safe deployment behavior
If deploying a new project on the same VPS:
- do not touch this project's running service
- do not edit this project's config files
- do not share this project's storage path
- do not share this project's database files
- do not bind the new project to this project's domain or port
- do not restart all services globally if only one project needs deployment

---

## Security Rules for the Agent

The agent must always prefer **non-breaking, isolated changes**.

### Allowed actions
The agent may:
- update code inside the current project safely
- add new features without changing locked resources
- fix UI issues
- improve styling
- add non-breaking components
- refactor internal code that does not affect deployment bindings
- create backup copies before risky operations
- document current deployment settings

### Forbidden actions
The agent must **not**:
- change API configuration silently
- change port numbers silently
- move database files silently
- rename project folders silently
- alter production deployment paths silently
- edit other VPS projects while working on this one
- make server-wide changes that may affect unrelated sites
- delete logs, backups, env files, or database files without approval
- replace working infrastructure with a new setup unless explicitly requested

---

## Required Workflow Before Any Sensitive Change

Before making any infrastructure-related change, the agent must:

1. Check whether the change affects:
   - API
   - port
   - database path
   - project folder
   - domain/reverse proxy
   - service/process name

2. If the change affects any locked item:
   - STOP
   - do not apply the change
   - ask for explicit approval
   - explain the impact clearly

3. If uncertain:
   - preserve the current working configuration
   - choose the safest non-breaking option
   - avoid global VPS edits

---

## Backup Rule
Before editing deployment-related files, always create a backup of:
- environment files
- Nginx/Apache config
- process manager config
- database connection config
- build/deploy scripts

Suggested backup naming:
- `.bak`
- timestamped backup
- versioned copy before modification

---

## Production Safety Rule
If the site is already live, treat the current configuration as **protected production state**.

That means:
- keep current API connection unchanged
- keep current port unchanged
- keep current database folder unchanged
- keep current project folder unchanged
- keep current domain binding unchanged
- keep current service name unchanged

No destructive or structural change is allowed without explicit written approval.

---

## Lovable.dev Agent Command

Use this instruction as the operating rule:

> This project is resource-locked. Do not change the API, port, database folder, project folder, production bindings, or VPS isolation structure. When deploying or editing other projects on the same VPS, ensure zero impact on this live site. Prefer isolated, non-breaking edits only. If any requested change touches infrastructure or deployment identity, stop and ask for explicit approval first.

---

## One-Line Enforcement Rule
**Never modify locked infrastructure identifiers or shared server bindings in a way that could break this project or affect other projects on the VPS.**

---

## Recommended Notes for Agent Memory
- This project is production-sensitive.
- Infrastructure identity is locked.
- Deployment isolation is required.
- Cross-project interference is forbidden.
- Ask permission before touching API, port, database path, project path, or reverse proxy config.

