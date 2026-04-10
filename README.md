<div align="center">

# OneCell

**Secure runtime for AI workloads**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg)](https://pnpm.io)

OneCell is a monorepo delivering a Node.js-compatible secure JavaScript runtime and an AI assistant platform built on top of it.

[Getting Started](#getting-started) · [Packages](#packages) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

</div>

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| **[@onecell/edgejs](packages/edgejs)** | — | Secure JS runtime with WebAssembly sandboxing |
| **[@onecell/nanoclaw](packages/nanoclaw)** | 1.2.45 | Multi-channel AI assistant with container isolation |

### OneCell Runtime (`@onecell/edgejs`)

A Node.js-compatible JavaScript runtime built with N-API-first architecture. Programs run inside a Wasmer WebAssembly sandbox (`--safe` mode), making it safe to execute untrusted code. Supports multiple JS engines (V8, JavaScriptCore, QuickJS) through its N-API abstraction layer.

```bash
edge server.js        # Run like Node.js
edge --safe server.js # Sandboxed execution
```

### OneCell Assistant (`@onecell/nanoclaw`)

A personal AI assistant that runs Claude agents in isolated containers. Supports multi-channel messaging (WhatsApp, Telegram, Slack, Discord, Gmail, terminal) through a skill-based system. Each conversation group has its own isolated filesystem and sandbox.

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
```

## Getting Started

### Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io) >= 9
- CMake >= 3.20 and Make (for building the runtime)

### Install & Build

```bash
git clone https://github.com/Zzzode/onecell.git
cd onecell
pnpm install
pnpm build:edgejs     # Build the runtime (CMake + Make)
pnpm build:nanoclaw   # Build the assistant (TypeScript)
pnpm test
```

### Quick Start with OneCell Assistant

```bash
cd packages/nanoclaw
claude                # Launch Claude Code
/setup                # Guided setup
```

## Architecture

```
OneCell
├── CMakeLists.txt            # CMake build
├── Makefile                  # GNU Make build
├── src/                      # C++ runtime core
├── lib/                      # JavaScript standard library
├── deps/                     # Vendored libraries (V8, libuv, OpenSSL...)
├── napi/                     # N-API abstraction layer (git submodule)
├── wasix/                    # WASIX build support
├── scripts/                  # Build and test scripts
├── ARCHITECTURE.md           # Runtime architecture doc
│
├── packages/edgejs/          # npm wrapper (@onecell/edgejs)
│   ├── package.json
│   ├── runtime-api.js
│   └── runtime-api.d.ts
│
└── packages/nanoclaw/        # AI assistant (@onecell/nanoclaw)
    ├── src/                  #   Core orchestration, channels, IPC
    ├── container/            #   Agent container definitions
    ├── setup/                #   First-time setup module
    └── docs/                 #   Documentation
```

OneCell Assistant runs Claude-powered agents inside OneCell Runtime sandboxes, providing OS-level isolation for each conversation group.

## Documentation

- [OneCell Runtime Architecture](ARCHITECTURE.md)
- [OneCell Assistant Spec](packages/nanoclaw/docs/SPEC.md)
- [Security Model](SECURITY.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**OneCell Assistant** follows a skill-based contribution model — new capabilities are contributed as installable skills rather than merged into core. See [packages/nanoclaw/CONTRIBUTING.md](packages/nanoclaw/CONTRIBUTING.md) for details.

## Acknowledgments

### OneCell Runtime (`@onecell/edgejs`)

OneCell Runtime is based on [wasmerio/edgejs](https://github.com/wasmerio/edgejs) — Wasmer's secure JavaScript runtime built on WebAssembly sandboxing. We thank the Wasmer team and Edge.js contributors for their foundational work.

### OneCell Assistant (`@onecell/nanoclaw`)

OneCell Assistant is based on [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw). We thank the Qwibit AI team and nanoclaw contributors for their work.

We also thank all [nanoclaw contributors](packages/nanoclaw/CONTRIBUTORS.md) who have helped shape this project.

## License

[Apache License 2.0](LICENSE)

OneCell Runtime (`@onecell/edgejs`) is licensed under MIT — see [packages/edgejs/LICENSE](packages/edgejs/LICENSE).
OneCell Assistant (`@onecell/nanoclaw`) is licensed under MIT — see [packages/nanoclaw/LICENSE](packages/nanoclaw/LICENSE).
