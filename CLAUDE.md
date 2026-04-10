# OneCell Monorepo

pnpm workspace containing edgejs (secure JS runtime) and nanoclaw (AI assistant platform).

## Structure

- `src/` — C++ runtime core (CMake build)
- `lib/` — JavaScript standard library
- `deps/` — Vendored libraries (V8, libuv, OpenSSL...)
- `napi/` — N-API abstraction layer (git submodule)
- `wasix/` — WASIX build support
- `scripts/` — Build and test scripts
- `packages/edgejs/` — npm wrapper package (`@onecell/edgejs`)
- `packages/nanoclaw/` — TypeScript AI assistant (tsc + vitest). Package: `@onecell/nanoclaw`

## Commands

```bash
pnpm install                  # Install all dependencies
pnpm build                    # Build all packages
pnpm build:edgejs             # Build edgejs only (requires cmake)
pnpm build:nanoclaw           # Build nanoclaw only (requires edgejs built first for full functionality)
pnpm test                     # Run all tests

# Direct CMake usage:
cmake -S . -B build-edge -DCMAKE_BUILD_TYPE=Release
cmake --build build-edge -j8
```

## Key Integration

nanoclaw imports `binaryPath` from `@onecell/edgejs` to locate the edge runtime binary. edgejs must be built before nanoclaw can use edge execution mode.
