# Contributing to OneCell

Thank you for your interest in contributing to OneCell! This document provides guidelines for contributing to the project.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### OneCell Runtime (`@onecell/edgejs`)

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Ensure tests pass (`pnpm --filter @onecell/edgejs test`)
5. Submit a pull request

**Build requirements:** CMake >= 3.20, Make, C++20 compiler

### OneCell Assistant (`@onecell/nanoclaw`)

OneCell Assistant follows a **skill-based contribution model**. Instead of merging new capabilities into core:

1. Fork the repository
2. Create a skill branch (`skill/your-feature`)
3. Add a `SKILL.md` following the [skill format](packages/nanoclaw/CONTRIBUTING.md)
4. Submit a pull request

Users then install skills on their fork via `/your-feature`, getting clean code that does exactly what they need.

Only **security fixes, bug fixes, and clear improvements** are accepted into the base configuration.

## Development Setup

```bash
git clone https://github.com/Zzzode/onecell.git
cd onecell
pnpm install
pnpm build:edgejs     # Build the runtime
pnpm build:nanoclaw   # Build the assistant
pnpm test
```

## Pull Request Process

1. Update relevant documentation
2. Add tests for new functionality
3. Ensure all existing tests pass
4. Follow the existing code style (run `pnpm lint`)
5. Reference any related issues in your PR description

## Reporting Issues

- **Bugs:** Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- **Features:** Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- **Security:** See [SECURITY.md](SECURITY.md) for responsible disclosure
