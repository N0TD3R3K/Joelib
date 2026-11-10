# JoeLang Tools for Visual Studio Code

> **Project status: planning.** This directory currently defines the extension
> architecture and contributor workflow. It does not yet contain a working VS
> Code extension, compiler, or installable `.vsix` file.

JoeLang Tools will give `.joe` files first-class support in Visual Studio Code.
It will use the official JoeLang 1.0 language pack to analyze, format, compile,
and run JoeLang programs. The extension must be a consumer of the language pack,
not a second independent implementation of the language.

The intended result is a familiar development experience for the Joe team:

- JoeLang syntax coloring, brackets, indentation, snippets, and completion.
- Compiler errors and warnings in VS Code's **Problems** panel.
- Explicit commands to check, format, compile, show generated JavaScript, and
  run a `.joe` file.
- A **JoeLang** Output channel for program output and runtime messages.
- A versioned compiler-pack system so an IDE and a project agree on JoeLang
  semantics.

## Installation model

Users should install **one extension first**, not manually assemble a compiler
before they can start coding.

```text
JoeLang Tools .vsix
    ├── bundled official JoeLang pack (works immediately)
    └── optional Language Pack manager (for later pack releases)
```

The first extension release will bundle a compatible official language pack.
The JoeLang project can still publish a separate `.joepack` archive for
third-party IDE authors and for users who explicitly want a newer compiler.
Separately downloaded packs are optional; they must never be silently fetched
or executed.

### Intended user workflow

1. Download `joelang-tools-<version>.vsix` from the official Joelib GitHub
   Release.
2. In VS Code, run **Extensions: Install from VSIX...** and choose the file.
3. Open a `.joe` file. The bundled pack provides support immediately.
4. Run **JoeLang: Check Active File** or **JoeLang: Run Active File**.
5. When JoeLang publishes a newer compatible pack, download the `.joepack` and
   use **JoeLang: Install Language Pack...**.

Directly installed VSIX extensions do not automatically update by default, so
each GitHub Release must have a clear version number and release notes. A future
public Visual Studio Marketplace release may provide ordinary automatic updates.

## Planned commands

These commands are design commitments, not yet implemented:

| Command | Purpose |
| --- | --- |
| `JoeLang: Check Active File` | Parse and validate the open `.joe` file; send diagnostics to Problems. |
| `JoeLang: Run Active File` | Check, compile, then explicitly run the active file. |
| `JoeLang: Compile Active File to JavaScript` | Write JavaScript only after the user chooses an output location. |
| `JoeLang: Show Generated JavaScript` | Open compiled JavaScript as a read-only virtual document. |
| `JoeLang: Format Document` | Format source using the active language pack. |
| `JoeLang: Install Language Pack...` | Validate and install a user-selected `.joepack` archive. |
| `JoeLang: Select Language Pack` | Choose among compatible installed and bundled packs. |
| `JoeLang: Show Active Pack Information` | Show language, pack API, and compiler version. |

## Repository relationship

The official JoeLang 1.0 language-pack release is maintained alongside this
project:

```text
JoeLang/version_release_1.0/
├── joelang-1.0-language-pack/   # language semantics and distributable pack
├── joelang-1.0-studio/          # browser IDE, another pack consumer
└── joelang-vscode-extension/    # this VS Code integration
```

The language pack defines parsing, diagnostics, formatting, JavaScript
projection, and execution semantics. The Studio and this extension must use the
same public pack API. Editor-only behavior—such as VS Code menus, the Problems
adapter, or the Output channel—belongs in this extension.

## Planned file layout

The following structure is the implementation target. Directories marked
**planned** will be added only when their corresponding code is started.

```text
joelang-vscode-extension/
├── README.md                    # architecture, installation model, user guide
├── CONTRIBUTING.md               # team workflow and quality rules
├── CHANGELOG.md                  # released and unreleased changes
├── LICENSE                       # planned: project license or repository reference
├── package.json                  # planned: VS Code manifest, commands, settings
├── package-lock.json             # planned: reproducible extension dependencies
├── tsconfig.json                 # planned: TypeScript compilation settings
├── .vscodeignore                 # planned: defines files excluded from a VSIX
├── src/                          # planned: extension-host TypeScript
│   ├── extension.ts              # activates services and registers commands
│   ├── compiler/
│   │   ├── PackResolver.ts       # finds and validates the active compiler pack
│   │   ├── CompilerService.ts    # one gateway to analyze/format/compile calls
│   │   ├── DiagnosticAdapter.ts  # maps pack spans to VS Code diagnostics
│   │   ├── Runner.ts             # explicit local execution of compiled output
│   │   └── VirtualDocument.ts    # read-only generated-JavaScript documents
│   ├── commands/
│   │   ├── check.ts              # Check Active File command
│   │   ├── compile.ts            # explicit JavaScript export command
│   │   ├── run.ts                # Run Active File command
│   │   ├── format.ts             # Format Document command
│   │   └── languagePacks.ts      # install/select/show pack commands
│   ├── providers/
│   │   ├── CompletionProvider.ts # keyword/context completion from pack metadata
│   │   ├── HoverProvider.ts      # keyword and standard-library help
│   │   └── SymbolProvider.ts     # outline and document symbols
│   └── util/
│       ├── version.ts            # semantic-version and API compatibility checks
│       └── paths.ts              # workspace-safe path helpers
├── syntaxes/                     # planned: TextMate grammar for token colors
│   └── joelang.tmLanguage.json
├── snippets/                     # planned: user-insertable JoeLang templates
│   └── joelang.json
├── resources/                    # planned: language configuration and icons
│   └── language-configuration.json
├── bundled-pack/                 # planned build input, copied into the VSIX
│   └── joelang-1.0.0.joepack
├── scripts/                      # planned: validation and packaging helpers
│   ├── sync-official-pack.mjs    # copies a reviewed pack into bundled-pack
│   └── verify-package.mjs        # verifies VSIX contents before release
├── docs/
│   ├── language-pack-contract.md # planned: stable pack API and archive contract
│   ├── installation.md           # planned: graphical and command-line install guide
│   └── release-process.md        # planned: VSIX and pack release checklist
└── test/                         # planned: automated extension and pack tests
    ├── fixtures/                 # minimal valid/invalid JoeLang source files
    ├── compiler.test.ts          # compile/diagnostic contract tests
    └── extension.test.ts         # command and provider integration tests
```

## Language-pack contract

The extension needs a stable, documented boundary to the compiler. The initial
pack API should expose these operations:

| Pack operation | Extension use |
| --- | --- |
| `analyze(source, options)` | diagnostics while a document changes or is saved |
| `format(source, options)` | document formatting |
| `compile(source, options)` | JavaScript generation and source mapping |
| `run(source, options)` | optional controlled execution route |
| `getCompletions(context)` | language-aware keyword completion |
| `getDocumentSymbols(source)` | outline and symbol navigation |

Each diagnostic must contain a severity, message, stable code, and source span
(`startLine`, `startColumn`, `endLine`, `endColumn`). The extension can then map
it faithfully to a VS Code `Diagnostic` without guessing positions.

### `.joepack` archive contract

An official downloadable language pack should contain a manifest and its exact
runtime assets:

```text
joelang-1.0.0.joepack
├── manifest.json
├── joelang-language.json
├── joelang-core.js
├── LICENSE
└── checksums.json
```

`manifest.json` must include at least:

```json
{
  "language": "JoeLang",
  "languageVersion": "1.0.0",
  "packApiVersion": 1,
  "compilerEntry": "joelang-core.js",
  "metadataEntry": "joelang-language.json"
}
```

The extension must validate the archive structure, checksums, and
`packApiVersion` before making a downloaded pack active. It should show a clear
error for an incompatible pack rather than attempting an unsafe or partial
compile.

### Active-pack selection order

1. A compatible pack explicitly pinned by the workspace.
2. A compatible pack deliberately installed by the user.
3. The bundled official pack.
4. A clear error with installation guidance.

The intended workspace setting is:

```json
{
  "joelang.packVersion": "1.0.0",
  "joelang.compile.outputDirectory": "out"
}
```

This makes a team project reproducible: members using a newer extension still
compile it with the version the project expects.

## Safety and execution policy

A compiler pack contains executable compiler logic. Therefore:

- The extension must never download or replace packs in the background.
- Installing an external pack requires an explicit file-selection action and a
  confirmation displaying its name and version.
- The first release should bundle only reviewed official packs.
- **Run Active File** must be explicit; validation or opening a `.joe` file must
  never execute its generated JavaScript.
- Compiled JavaScript should run in the workspace directory and report output
  through the JoeLang Output channel.
- File writes must be limited to a user-selected output location or the
  configured workspace `out/` directory.

## Development milestones

| Milestone | Scope | Completion condition |
| --- | --- | --- |
| 0 — Contract | Pack API, `.joepack` manifest, fixtures, and version policy | Studio and extension can name the same stable API. |
| 1 — Editor | `.joe` language ID, grammar, brackets, snippets, basic completion | A `.joe` file feels correctly recognized in VS Code. |
| 2 — Compiler | bundled pack loading, check command, Problems diagnostics | Valid and invalid fixtures match pack results. |
| 3 — Workflow | formatting, generated-JS preview, explicit compile/run | Output and errors are clear and no source is overwritten. |
| 4 — Distribution | VSIX packaging, GitHub Release, install documentation | A team member can install and use the release without source checkout. |
| 5 — Project tooling | workspace/package resolution, symbols, hover, definition | Multi-file JoeLang projects are supported. |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the team workflow and
[CHANGELOG.md](CHANGELOG.md) for project history.

