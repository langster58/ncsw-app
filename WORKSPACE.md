# NCSW workspace management

## Source of truth

Directus is the only interface for catalog and schema work. Local agents and scripts use the Directus REST API. They do not connect directly to PostgreSQL and do not create fallback databases or files.

## Repository location

- Workspace root: `/Volumes/SSD 1TB/ncsw-app`
- Compatibility symlink: `/Users/brettcombs/Documents/Database`

Both paths resolve to the same repository. New tasks should open the workspace root.

## Local Directus credentials

The sole local credential file is:

```text
~/.config/directus-render.env
```

It is owner-readable only and contains exactly:

```text
DIRECTUS_URL=...
DIRECTUS_TOKEN=...
```

It must not contain `DATABASE_URL`. The repository `.env` must not contain `DIRECTUS_TOKEN`.

Verify authenticated access before every catalog or schema task:

```bash
scripts/directus-api.sh GET /users/me
```

Make a direct API request:

```bash
scripts/directus-api.sh GET '/items/vehicles?limit=1'
```

Run a repository program with the same credential:

```bash
scripts/directus-api.sh run node scripts/audit-year-ranges.mjs
```

If `/users/me` fails, stop. Repair this credential file; do not switch to anonymous access, PostgreSQL, the deployed proxy, or a local data file.

## Historical direct-database scripts

Some historical migration scripts still import `psycopg2` or refer to `DATABASE_URL`. They are retained only as implementation history. They are unsupported, have no local database credential, and must not be used for catalog work. Any needed operation must be implemented through the Directus API.

## Deployed application

The website performs public reads directly and server-side writes through `api/directus/`. Vercel stores its own `DIRECTUS_URL`, `DIRECTUS_TOKEN`, and `NCSW_ADMIN_KEY` because deployed functions cannot read the local credential file. These are application runtime secrets, not the local workspace access method.

## Credential rotation

When the Directus token is intentionally replaced:

1. Replace `DIRECTUS_TOKEN` in `~/.config/directus-render.env`.
2. Run `scripts/directus-api.sh GET /users/me` and an authorized same-value test write.
3. Replace `DIRECTUS_TOKEN` in the Vercel production and development environments.
4. Deploy a new production version because environment changes do not affect an existing deployment.
5. Verify a production proxy read and authorized same-value write.

No repository file should receive the token during rotation.
