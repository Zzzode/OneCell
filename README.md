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

- macOS (arm64) or Linux (x86_64 / arm64)
- Node.js >= 20, [pnpm](https://pnpm.io) >= 9
- CMake >= 3.20, C++20 compiler (Clang 15+ / GCC 12+)
- Ninja (`brew install ninja` or `apt install ninja-build`)
- [Rust](https://rustup.rs) (for the wasix toolchain, needed by `--safe` mode)

### Install & Build

```bash
git clone --recurse-submodules https://github.com/Zzzode/onecell.git
cd onecell
pnpm install
pnpm build            # Build all packages
```

Or build individually:

```bash
pnpm build:edgejs     # Native runtime only (CMake)
pnpm build:nanoclaw   # Runtime + TypeScript (includes build:edgejs)
```

### Running

```bash
pnpm dev              # Start nanoclaw in dev mode (tsx hot-reload)
pnpm start            # Start nanoclaw from built dist
```

These are root-level convenience scripts — equivalent to `pnpm --filter @onecell/nanoclaw run dev`.

nanoclaw spawns an edgejs subprocess for each agent turn (controlled by `edgeRunnerMode` in `nanoclaw.config.json`). Whether that subprocess runs in sandboxed mode is controlled by `edge.safe` in the config:

```json
{
  "edge": {
    "safe": true
  }
}
```

| `edge.safe` | `build-wasix/edgejs.wasm` exists? | edgejs args | Meaning |
|---|---|---|---|
| `false` (default) | — | `edge dist/edge-runner-cli.js` | Built-in V8, no sandbox |
| `true` | Yes | `edge --safe --wasmer-package build-wasix/edgejs.wasm dist/edge-runner-cli.js` | Sandboxed via WASM |
| `true` | No | — | Error: build the artifact first |

`pnpm dev` and `pnpm start` behave identically in both cases — `edge.safe` in the config is the only control.

### Enabling --safe Mode (WASM Sandbox)

1. Set `edge.safe: true` in `nanoclaw.config.json`:

```json
{
  "edge": {
    "provider": "anthropic",
    "safe": true
  }
}
```

2. Build the WASM artifact (one-time setup):

```bash
# 1. Install the wasix cross-compiler
cargo install wasixcc
sudo wasixccenv install-executables /usr/local/bin

# 2. Download LLVM + sysroot (one-time, see packages/edgejs/README.md for details)
gh release download 21.1.203 --repo wasix-org/llvm-project \
  --pattern "LLVM-MacOS-aarch64.tar.gz" -D ~/.wasixcc/llvm
cd ~/.wasixcc/llvm && tar xzf LLVM-MacOS-aarch64.tar.gz && cd -

gh release download v2026-02-16.1 --repo wasix-org/wasix-libc -D ~/.wasixcc/sysroot
cd ~/.wasixcc/sysroot && for f in sysroot*.tar.gz; do d="${f%.tar.gz}"; mkdir -p "$d" && tar xzf "$f" -C "$d"; done && cd -

# 3. Build the WASM artifact (~5-10 min)
bash wasix/build-wasix.sh
# Output: build-wasix/edgejs.wasm

# 4. Rebuild nanoclaw
pnpm build:nanoclaw
```

If `edge.safe: true` is set but `build-wasix/edgejs.wasm` is missing, nanoclaw will print an error explaining how to build it.

> See [packages/nanoclaw/README.md](packages/nanoclaw/README.md) for the full step-by-step guide including sysroot setup details.

### Quick Start with OneCell Assistant

```bash
cd packages/nanoclaw
claude                # Launch Claude Code
/setup                # Guided setup
```

### Common Commands

```bash
pnpm build                       # Build everything
pnpm build:edgejs                # Build native runtime
pnpm build:nanoclaw              # Build runtime + TypeScript
pnpm dev                         # Dev mode (tsx hot-reload)
pnpm start                       # Run from dist
pnpm test                        # Run all package tests
pnpm lint                        # Lint all packages
pnpm typecheck                   # Type-check all packages

# Native runtime testing (from repo root)
cmake --preset release && cmake --build --preset release && ctest --preset release
```

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
