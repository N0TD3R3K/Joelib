# JoeLang Studio 1.0

JoeLang Studio is the browser-based editor, runner, and project workspace for
JoeLang 1.0. It is a client-side IDE backed by the portable JoeLang language
pack in `dist/pack/`.

This folder is the **single source of truth** for the public Studio. Contributors
edit and test files here, commit them to the Joelib repository, and submit them
through GitHub. Once Cloudflare Workers Builds is connected, a merge to the
production branch deploys the same folder to
`https://joelang-studio.derekli.dev`; no separate release-folder copy is needed.

## Project map

| Path | Purpose | Change it when... |
| --- | --- | --- |
| `dist/index.html` | Studio structure and dialogs | changing visible HTML or controls |
| `dist/styles.css` | Studio themes and layout | changing the appearance or responsive layout |
| `dist/app.js` | editor, file tree, browser workspace, and UI behavior | changing Studio features or fixing UI bugs |
| `dist/pack/joelang-language.json` | language metadata and keyword definitions | changing the published JoeLang language description |
| `dist/pack/joelang-core.js` | parser, diagnostics, formatter, projection, and execution | changing JoeLang language behavior |
| `dist/downloads/` | downloadable release artifacts | publishing a deliberately rebuilt downloadable package |
| `cloudflare/src/worker.mjs` | Worker routes, security headers, and Access session endpoint | changing server-side behavior |
| `wrangler.jsonc` | Worker name, static assets, and custom-domain route | changing deployment configuration |
| `cloudflare/release/` | Access and launch documentation | changing login or release procedures |

The Studio UI owns browser-local files, layout, and host input. The language
pack owns JoeLang parsing, diagnostics, formatting, projection, and execution.
Keep those responsibilities separate so other IDEs can use the language pack.

## Local development

Use Node.js 20 or newer.

```bash
cd JoeLang/version_release_1.0/joelang-1.0-studio
npm ci
npm run check
npm run dev
```

`npm run dev` starts the Worker and static assets locally. It is the preferred
way to test the signed-in top bar and `/api/session`; Cloudflare Access itself
is only present on the hosted domain. The Studio also works as a static page for
editor-only work, but do not treat a `file://` test as a deployment test.

Before opening a pull request, run `npm run check` and manually verify the
affected behavior in a fresh browser tab. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the required workflow and test checklist.

## GitHub to Cloudflare deployment

The Worker is named `joelang-studio` in `wrangler.jsonc`. Keep that name: it
must match the existing Cloudflare Worker when using Workers Builds.

When an administrator connects the existing Worker to GitHub, use these
settings:

| Cloudflare setting | Value |
| --- | --- |
| Repository | `N0TD3R3K/Joelib` |
| Production branch | `JoeLang` |
| Root directory | `JoeLang/version_release_1.0/joelang-1.0-studio` |
| Build command | `npm ci && npm run check` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Build watch path | `JoeLang/version_release_1.0/joelang-1.0-studio/**` |

Enable preview builds. A pull request from any non-production branch then gets
an isolated preview instead of changing the live Studio. Only changes merged
into `JoeLang` deploy to the custom domain. The custom domain and its Cloudflare
Access policy stay attached to the existing Worker.

Until that connection is made, the project can still be deployed manually by an
authorized administrator with `npm run deploy`. Do not store Cloudflare tokens,
Access credentials, email lists, or `.dev.vars` files in Git.

## User workspaces and privacy

The Studio does not upload a user's source files or console input to this
repository or to a JoeLang database. Workspaces are stored in that user's
browser and can be transferred explicitly with **Open workspace**, **Save
workspace**, **Import .joe**, and **Download file**. Cloudflare Access controls
who can open the hosted Studio; it does not synchronize their browser workspaces.

## Release and operations documents

- [Contributing to JoeLang Studio](CONTRIBUTING.md)
- [Cloudflare Access setup](cloudflare/release/ACCESS_SETUP.md)
- [Launch checklist](cloudflare/release/LAUNCH_CHECKLIST.md)
