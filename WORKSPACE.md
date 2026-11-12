# NCSW workspace management

## Source of truth

Directus is the source of truth and the interface for catalog and schema work. Local agents and scripts use the Directus REST API, and never create fallback databases or files.

Exception, matching `AGENTS.md` and `research/CLAUDE.md`: **bulk row changes** (over ~2,000 rows) go straight to PostgreSQL, because the Directus API caps updates at 100 rows and can crash the small Render instance. Shape changes (add / drop / rename a column) still go through Directus — see `research/DIRECTUS-WORKING-GUIDE.md` §6.

## Repository location

- Repository: `/Volumes/SSD 1TB/NCSW/app` (the NCSW folder also holds `research/` and `assets/`).
- The older paths `/Volumes/SSD 1TB/ncsw-app` and `/Users/brettcombs/Documents/Database` no longer exist (Mac reset 2026-11-12).

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

On this Mac `~/.config` is a shortcut into `/Volumes/SSD 1TB/Claude Home/dot-config/`, so the file survives a Mac reset. The SSD must be plugged in; after a reset, run `Claude Home/Restore Claude.command`.

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

## Direct-database access (bulk work only)

The Postgres password lives in `~/.pgpass` (mode 600; also a shortcut into `Claude Home`) and nowhere else. This Mac has no `psql`; use Python `psycopg2` — connection details are in `research/CLAUDE.md`. Get Brett's approval and write a rollback snapshot before any production write.

Some older migration scripts read `DATABASE_URL`. Don't revive that variable; point them at `~/.pgpass` instead.

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
