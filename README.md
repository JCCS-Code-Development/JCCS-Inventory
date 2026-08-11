# JCCS Inventory

Materials/consumable-supply tracking for JCCS, styled to match `jccs-fieldclock` (same
React + Tailwind stack, brand palette, layout conventions). Tracks stock across a
fixed set of locations (1200 Woodruff Rd., 109 E Miller), with receiving, physical
counts, low-stock alerting, and CSV reporting.

## Stack

- React 19 + Vite 8 + Tailwind 4 + Zustand + react-router-dom v6, PWA via vite-plugin-pwa
- PHP flat-file API (PDO + MySQL), same conventions as FieldClock's `api/`
- Deployed via `.cpanel.yml` to `inventory.jccs-services.com`, a sibling subdomain to
  `fieldclock.jccs-services.com`

## Auth model

Inventory has no accounts of its own. The frontend logs in directly against
FieldClock's existing `/api/auth/login.php` (see `VITE_FIELDCLOCK_API_BASE_URL` in
`.env`) and reuses the JWT that comes back. Inventory's own API validates that same
JWT using a **shared `JWT_SECRET`** — copy it verbatim from FieldClock's production
`api/config/config.php` into Inventory's `api/config/config.php` (see
`config.example.php` for the template; never commit the real file).

Once the JWT is verified, Inventory looks up the user's `inventory_user_roles` row
(a table local to Inventory's own database) to determine whether they're
provisioned here and whether they're `admin` or `staff`. A user who's never been
added to `inventory_user_roles` gets a 403 — an existing Inventory admin has to add
them first (there's no self-service signup).

## First-time setup

1. Create the `jccs_inventory` MySQL database on the server and import `api/schema.sql`
   (seeds the two locations).
2. Manually insert at least one admin row so someone can log in and add the rest:
   ```sql
   INSERT INTO inventory_user_roles (fieldclock_user_id, name, role)
   VALUES (<their FieldClock user id>, '<their name>', 'admin');
   ```
3. Copy `api/config/config.example.php` → `api/config/config.php` on the server,
   fill in the new database credentials, and paste in FieldClock's `JWT_SECRET`
   exactly.
4. `npm install && npm run build`, then deploy via `.cpanel.yml` (update the
   `secure_backups` path for `inventory-config.php` to match wherever you keep it).

## Local development

```
npm install
npm run dev
```

The dev server proxies `/api` to `https://inventory.jccs-services.com` (see
`vite.config.js`) — point it at a local PHP server instead if you're running the
API locally.
