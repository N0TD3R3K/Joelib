# Changelog

All notable changes to JoeLang Tools for Visual Studio Code will be documented
in this file. This project follows [Semantic Versioning](https://semver.org/).

The extension is not yet implemented or released. Planned features are recorded
separately from completed work so release notes remain trustworthy.

## [Unreleased]

### Added

- Initial extension architecture in `README.md`.
- Contributor workflow, ownership rules, language-pack compatibility policy,
  testing requirements, and release process in `CONTRIBUTING.md`.

### Planned for 0.1.0

- `.joe` file recognition and `joelang` language ID.
- Syntax grammar, bracket/indent rules, and starter snippets.
- Bundled official JoeLang compiler pack.
- Check command and compiler diagnostics in the Problems panel.
- Explicit compile, generated-JavaScript preview, format, and run commands.
- VSIX packaging for private Joe-team distribution.

### Not yet implemented

- VS Code extension code or manifest.
- Compiler-pack adapter or `.joepack` archive reader.
- Syntax grammar, snippets, commands, diagnostics, execution, or tests.
- VSIX package, Marketplace listing, or GitHub Release artifact.

## Release format

When the first release is made, add a section in this form before publishing:

```markdown
## [0.1.0] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...
```

Use **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, and
**Security** headings as appropriate. Do not move an item from Planned to a
release section until it has been packaged and verified in a clean VS Code
profile.

