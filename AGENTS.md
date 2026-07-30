# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Git / deploy

The user has standing authorization for git commits and pushes to main. Commit and `git push` without asking for confirmation. Every push to main auto-deploys to ncsw-app.vercel.app.

# Directus access

Directus is the only catalog interface and the source of truth. The workspace root is `/Volumes/SSD 1TB/ncsw-app`; `/Users/brettcombs/Documents/Database` is only a compatibility symlink to that same repository.

Before any catalog or schema task, verify authenticated Directus API access with:

```bash
scripts/directus-api.sh GET /users/me
```

The sole local credential source is `~/.config/directus-render.env`, containing only `DIRECTUS_URL` and `DIRECTUS_TOKEN` and remaining owner-readable only. Use `scripts/directus-api.sh` for direct requests and `scripts/directus-api.sh run <command>` for repository programs that call Directus. The repository `.env` must not contain `DIRECTUS_TOKEN`.

Do not connect directly to PostgreSQL, use `DATABASE_URL`, `psql`, or `psycopg` for catalog work. Historical scripts containing those mechanisms are unsupported migration history, not an available workflow. Do not substitute a local database, JSON file, CSV, mock collection, Vercel proxy, or another datastore when Directus authentication fails. A public Directus read is not proof of authenticated access. If the authenticated check fails, stop the catalog task and repair the single credential path first.

The Vercel Directus token exists only for the deployed application's server-side proxy. It is deployment infrastructure, not the workspace database-access path. See `WORKSPACE.md` for setup and rotation.

# AI workspace strategy

Codex is the default working agent for this repo. Use Codex for repo search, implementation, testing, browser/computer-use verification, data inspection, and review loops.

Fable 5 is an advisor only. Do not use Fable for unbounded exploration, file discovery, long log reads, data archaeology, implementation loops, subagents, or workflows. Use the repo skill `.agents/skills/fable-advisor/SKILL.md` only when a decision is expensive enough that better judgment is worth metered API cost.

The Fable advisor skill is callable by the user with `$fable-advisor`. Codex may propose a Fable escalation and may prepare the advisor packet, but Codex must stop before the metered Fable call and ask for explicit approval. Do not execute a Fable call merely because the skill seems relevant.

Before any Fable call, prepare a bounded advisor packet with:

- the exact decision needed
- known source-of-truth paths or database tables
- relevant Codex findings summarized in plain text
- options under consideration
- constraints, risks, and stop conditions
- a per-call dollar cap

If the source of truth is unclear, do one cheap inventory pass with Codex and stop. Do not escalate uncertainty to Fable and do not spawn agents to guess.
