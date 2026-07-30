# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Git / deploy

The user has standing authorization for git commits and pushes to main. Commit and `git push` without asking for confirmation. Every push to main auto-deploys to ncsw-app.vercel.app.

# Directus access

Directus is the only catalog database and the source of truth. Before any database task, verify authenticated access with:

```bash
scripts/directus-api.sh GET /users/me
```

The persistent credential source is `~/.config/directus-render.env`, which must remain owner-readable only. Use `scripts/directus-api.sh` for Directus API reads and writes. Do not use the repository `.env` as the authoritative admin credential, and do not substitute a local database, JSON file, CSV, mock collection, or other datastore when authentication fails. A public Directus read is not proof of authenticated access. If the access check fails, stop the catalog task and repair this credential path first.

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
