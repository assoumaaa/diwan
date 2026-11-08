# Diwan

Diwan is a personal, self-hosted team of AI agents: persistent bots with their own chats, memory,
routines and computers, run on your own machine and reached from your laptop and phone.

Diwan is a fork of [Rakazo](https://github.com/elie222/rakazo), the open source AI agent for
persistent teammates, and is distributed under the same [Apache-2.0 license](./LICENSE). All
credit for the core product goes to the Rakazo project and its contributors.

## What Diwan changes

- Runs only against your own server: the desktop app's setup no longer offers the hosted service
  or a downloaded upstream stack.
- Terminal-style sounds when a bot starts working, finishes, or fails, with a Sounds switch in
  Settings > General.
- Hold Space in an empty message box to dictate, then release to send.

## Features

- Persistent bots with their own conversations, memory, routines, and history
- Voice mode: speak replies, dictate, and call a bot
- Shared team computers and isolated private computers
- Browser, terminal, file, and graphical desktop access
- Bots that can delegate to peer bots or short-lived subagents
- Bring-your-own model credentials, including ChatGPT and Claude plan sign-in
- App integrations through Composio or Pipedream Connect, plus remote MCP and OpenAPI tool sources

## Run it

You need Node.js, pnpm (the version in `package.json`), and Docker.

```bash
pnpm install --frozen-lockfile
cp .env.example .env   # then fill in the secrets, see docs/self-host.md
pnpm sandbox:build     # builds the bots' computer image, first run only
WEB_PORT=5183 pnpm dev
```

Open http://127.0.0.1:5183. `pnpm dev` starts the API, worker, web app and sandbox supervisor, and
a local Postgres container when `.env` has no `DATABASE_URL`. Pass `WEB_PORT` in the shell; the dev
script does not read it from `.env`.

## Desktop app

```bash
pnpm --filter @rakazo/desktop dev
```

On first launch, enter your server's address, for example `http://127.0.0.1:5183`. The window
loads its screens from that server, so web changes show up in the app without rebuilding it.

## Phone and other devices

Keep the server on one always-on machine and reach it over [Tailscale](https://tailscale.com):
start it with `RAKAZO_DEV_TAILNET=1` to serve the web app over HTTPS to devices on your tailnet,
without exposing it to the internet.

## Staying up to date with Rakazo

`main` mirrors upstream Rakazo; Diwan's work lives on the `diwan` branch. Internal package names
(`@rakazo/*`) and settings (`RAKAZO_*`) are kept on purpose so upstream changes merge cleanly.

```bash
git fetch upstream
git switch main && git merge --ff-only upstream/main && git push origin main
git switch diwan && git merge main
```

## Commit messages

Commits follow the Odoo convention:

```
[TAG] module: short sentence, about 50 characters

Body wrapped at 72 characters that explains why the change was made.
```

Tags: `[IMP]` improvement or feature, `[FIX]` bug fix, `[REF]` refactor, `[ADD]` new module,
`[REM]` removal, `[REV]` revert, `[MOV]` moved files, `[PERF]`, `[I18N]`, `[MERGE]`, `[REL]`.
The module is the app or package (`web`, `desktop`, `api`, `mobile`, `core`), or `*` across the
repo.

## Documentation

The guides in [docs](./docs) come from Rakazo and cover configuration, models, voice, computers,
integrations, backups and more.

## License

Apache-2.0. See [LICENSE](./LICENSE). Diwan is a modified version of Rakazo.
