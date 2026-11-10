# Contributing to JoeLang Tools

JoeLang Tools is a planned Visual Studio Code extension that consumes the
official JoeLang language pack. This document sets the implementation rules
before code is added, so the extension and browser Studio do not drift into
different JoeLang dialects.

## Current status

This branch contains planning documents only. Do not describe an unimplemented
feature as released or working. When implementation begins, update the relevant
documentation and [CHANGELOG.md](CHANGELOG.md) in the same pull request.

## Source-of-truth rule

The language pack is the authority for JoeLang behavior:

| Concern | Owner |
| --- | --- |
| Grammar, parser, diagnostics, formatting, JavaScript projection, execution semantics | `joelang-1.0-language-pack` |
| Browser file tree, browser workspace, browser UI | `joelang-1.0-studio` |
| VS Code commands, Problems adapter, Output channel, grammar, snippets, extension settings | `joelang-vscode-extension` |

Do **not** fix a language rule exclusively in the VS Code extension if that
rule belongs in the language pack. Update the pack contract and confirm that
Studio uses the same behavior.

## Branch and review workflow

1. Start from `joelang-extension-dev` until the extension has a stable release
   branch policy.
2. Create a focused branch such as `feature/compiler-diagnostics` or
   `fix/format-caret-range`.
3. Keep each pull request limited to one behavior or one tightly related set of
   files.
4. Explain the user-visible result, test cases, language-pack version, and any
   new setting in the pull request description.
5. Obtain review before merging a change that affects language semantics,
   compiler-pack loading, execution, or release packaging.

Avoid committing generated VSIX files, `node_modules/`, VS Code workspace state,
local pack installations, private API keys, or user source workspaces.

## Planned implementation sequence

Build in this order. Do not start a later layer by duplicating functionality
that an earlier layer is meant to establish.

### 1. Define and test the language-pack adapter

Before adding VS Code UI, agree on the exact JavaScript interface exposed by a
JoeLang pack. It must provide analysis, formatting, compilation, completion
metadata, and version information. Add valid and invalid `.joe` fixtures at the
same time.

Required questions to settle:

- Does the compiler handle one file or a project graph?
- How are package references resolved?
- How are errors represented, including exact zero- or one-based positions?
- What result object carries generated JavaScript and an optional source map?
- How are standard library packages such as `joemath`, `JoerayList`, and
  `Joetime` located?

### 2. Add the editor layer

Add `package.json` contributions for the `joelang` language ID and `.joe` file
extension, then add the TextMate grammar, language configuration, snippets, and
simple metadata-driven completion. These features must not execute source code.

### 3. Add analysis and diagnostics

Implement one `CompilerService` that is the only route from VS Code to the
language pack. The diagnostics adapter maps a pack span to a `vscode.Range` and
publishes a stable diagnostic code. Debounce document-change checking so typing
does not cause overlapping compiler jobs or stale errors.

### 4. Add formatting, compile, and run

Formatting uses the pack's formatter. Compilation writes only when the user
selects a command or configures an output directory. Running code is always an
explicit command and never occurs on save, open, validation, or completion.

### 5. Add language-pack installation and distribution

Implement archive validation before support for external packs. Package an
official built-in pack into the VSIX. Only after the team can install a VSIX on
a clean machine should GitHub Release packaging be considered complete.

## Planned file ownership

| File or directory | Responsibility | Review required |
| --- | --- | --- |
| `package.json` | extension ID, commands, settings, activation, VS Code compatibility | maintainer |
| `src/extension.ts` | lifecycle and registration only; avoid compiler logic here | extension reviewer |
| `src/compiler/` | pack loading, compatibility, analysis, compile/run boundary | language-pack reviewer |
| `src/commands/` | command behavior and user-facing errors | extension reviewer |
| `src/providers/` | completion, hover, symbols | extension reviewer |
| `syntaxes/`, `snippets/`, `resources/` | editor recognition and editing defaults | extension reviewer |
| `bundled-pack/` | reviewed copy of official distributable pack only | release maintainer |
| `scripts/` | deterministic synchronization and VSIX validation | release maintainer |
| `test/fixtures/` | minimal reproducible language cases | language-pack reviewer |

## Required tests by change type

| Change | Required evidence before review |
| --- | --- |
| Grammar or snippets | Open valid `.joe` fixtures and verify token categories, brackets, comments, and indentation. |
| Completion | Test inside a token, after a completed keyword, in a string/comment, and after pressing Enter. |
| Diagnostic mapping | Verify exact line/column highlighting on first line, last line, and a multi-line construct. |
| Compiler behavior | Compare extension results with the official pack fixture results. |
| Formatter | Verify the result parses again and preserves the intended semantic output. |
| Run command | Test output, runtime failure, cancellation, and a workspace path containing spaces. |
| Pack installation | Test valid, corrupt, unsupported-API, and missing-entry archives. |
| VSIX release | Install the packaged VSIX in a clean VS Code profile and run a fixture. |

## Diagnostics contract

Every compiler diagnostic must retain:

```text
severity     error | warning | information | hint
message      human-readable explanation
code         stable machine-readable identifier, e.g. JL1003
range        start and end line/column in the original .joe document
source       "JoeLang"
```

Do not derive an error range by searching the diagnostic text. The language pack
must provide the source range. This is necessary for reliable editor highlighting
and future quick-fixes.

## Language-pack compatibility rules

- `languageVersion` identifies JoeLang syntax and semantics, for example
  `1.0.0`.
- `packApiVersion` identifies the JavaScript interface understood by the
  extension.
- A pack with an unsupported `packApiVersion` is rejected before loading.
- A workspace pin takes precedence over a user's selected pack.
- A missing requested pack may fall back only when that fallback satisfies the
  workspace pin; otherwise the extension reports a clear error.
- Never mutate a downloaded pack. Install it as an immutable versioned asset.

## Security rules

- Never commit Cloudflare, GitHub, Marketplace, or other tokens.
- Never fetch and execute a language pack automatically.
- Require a direct user action to install an external `.joepack` file.
- Display pack name, language version, and API version before activating it.
- Never run a JoeLang program as a side effect of completion, diagnostics,
  formatting, saving, or opening a file.
- Keep generated JavaScript in a virtual document until the user explicitly
  chooses to export or run it.

## Release policy

The first distribution channel is a GitHub Release containing:

```text
joelang-tools-<extension-version>.vsix
joelang-<language-version>.joepack
SHA256SUMS.txt
release-notes.md or GitHub Release notes
```

The release notes must state the extension version, bundled pack version,
minimum VS Code version, supported JoeLang version, installation instructions,
and known limitations. A Marketplace publication can be considered only after
the team is satisfied with the private VSIX workflow.

## Writing documentation and issues

Use exact commands, file names, settings keys, and version numbers. Mark design
items as **planned** until they are tested and released. Bug reports should
include the smallest `.joe` reproduction, expected versus actual output, VS
Code version, extension version, active pack information, operating system, and
any Output-channel message.

