# Contributing to JoeLang Studio

This guide is for the Joe team members who fix Studio or JoeLang language-pack
bugs. The canonical source is this folder inside the **Joelib** repository.
Do not fix a separate deployment copy and do not upload files through the live
Studio in order to release a code change.

## First-time setup

1. Clone the Joelib repository and check out the shared `JoeLang` branch.
2. Create a focused branch, for example `fix/caret-after-auto-indent` or
   `feature/count-loop-diagnostics`.
3. From this folder, install the pinned development dependency and run checks:

   ```bash
   npm ci
   npm run check
   ```

4. Start the local Studio with `npm run dev`. Wrangler prints the local URL.
   Use a normal browser window and keep DevTools open while testing a UI bug.

The `package-lock.json` file is part of the project. Use `npm ci` for ordinary
development; only update the lockfile intentionally when changing a dependency.

## Where to make a change

### Studio behavior and visuals

- Edit `dist/app.js` for the editor, file tree, dialogs, browser-local
  workspace, keyboard shortcuts, and IDE behavior.
- Edit `dist/index.html` for UI markup, accessible labels, and dialogs.
- Edit `dist/styles.css` for layout, themes, token colors, and visual fixes.

For an editor issue, test typing, selection, Enter, bracket completion, and
Cmd/Ctrl+S as relevant. Do not assume that a click test is enough: the Studio
uses a textarea overlay and an independently rendered code view, so caret and
scroll behavior require real keyboard testing.

### JoeLang language behavior

- Edit `dist/pack/joelang-language.json` for language metadata and keyword
  definitions.
- Edit `dist/pack/joelang-core.js` for parsing, validation, formatter rules,
  JavaScript projection, and execution semantics.

Keep public language behavior inside the pack rather than adding language rules
to `dist/app.js`. That allows third-party JoeLang IDEs to reuse the same pack.
When changing the pack, test a representative `.joe` program in Studio and
verify both diagnostics and runtime output.

### Server and access behavior

- Edit `cloudflare/src/worker.mjs` only for Worker routes, response headers, or
  the Access-provided session identity endpoint.
- Edit `wrangler.jsonc` only when an administrator has approved a deployment
  configuration change.

Never add authentication decisions to browser JavaScript. Cloudflare Access is
the login boundary. Do not commit `.dev.vars`, Cloudflare API tokens, one-time
PINs, user email lists, or browser workspaces.

## Required checks

Run this before opening a pull request:

```bash
npm run check
```

Then manually test the behavior you changed. Use this minimum checklist when
applicable:

- The Studio opens with no browser-console errors.
- A `.joe` file can be created, edited, saved with Cmd/Ctrl+S, and run.
- Auto-indent and closing-bracket placement preserve a correct caret position.
- Keyword completion disappears when typing leaves a candidate or when Enter
  accepts a newline instead of a completion.
- A deliberately invalid program has a visible, dismissible diagnostic.
- The account menu shows a signed-in identity on the hosted preview; locally,
  an absent identity is handled safely.
- Import/export still creates a usable workspace or `.joe` file.

## Review and release flow

1. Commit a small, descriptive change on your feature or fix branch.
2. Push it to GitHub and open a pull request into `JoeLang`.
3. Review the Cloudflare preview URL and GitHub check result. Fix failures on
   the same branch.
4. A maintainer merges the approved pull request into `JoeLang`.
5. Cloudflare Workers Builds deploys that merge to
   `https://joelang-studio.derekli.dev`.

Do not run `wrangler deploy` to publish a routine change after GitHub deployment
is enabled. Merging to the production branch is the release action. A
maintainer can pause or disconnect the Cloudflare build integration if an
emergency requires manual control.

## Files that must not be committed

The local `.gitignore` excludes `node_modules/`, Wrangler state, local secret
files, and macOS `.DS_Store` metadata. If Git already shows an old `.DS_Store`
as tracked, ask a maintainer to remove it from Git tracking; deleting it from
Git does not affect Studio source code.

## Reporting a bug

Include the browser and operating system, the exact `.joe` source or smallest
reproduction, observed versus expected behavior, a screenshot when visual, and
any console error. Never include another user's workspace or personal data in a
public issue.
