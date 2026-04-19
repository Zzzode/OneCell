# OneCell Monorepo

pnpm workspace containing edgejs (secure JS runtime) and nanoclaw (AI assistant platform).

## Package-specific guidance

- Use this root `CLAUDE.md` for monorepo-wide context, shared commands, and runtime/package relationships.
- Use `packages/nanoclaw/CLAUDE.md` for assistant-specific architecture, config, and test guidance.
- Use `packages/edgejs/CLAUDE.md` for the npm wrapper package. The actual edgejs runtime source/build surface lives mostly at repo root, not inside `packages/edgejs/`.
- Native edgejs validation requires recursive submodules plus CMake. Nanoclaw verification is pnpm/TypeScript/Vitest oriented.

## Structure

- `src/` — C++ runtime core (CMake build)
- `lib/` — JavaScript standard library
- `deps/` — Vendored libraries (V8, libuv, OpenSSL...)
- `napi/` — N-API abstraction layer (git submodule)
- `wasix/` — WASIX build support
- `scripts/` — Build and test scripts
- `packages/edgejs/` — npm wrapper package (`@onecell/edgejs`)
- `packages/nanoclaw/` — TypeScript AI assistant (`@onecell/nanoclaw`)

## Common commands

```bash
pnpm install                                        # Install workspace dependencies
pnpm build                                          # Build all packages with their package scripts
pnpm build:edgejs                                   # Build the native edgejs runtime
pnpm build:nanoclaw                                 # Build nanoclaw
pnpm --filter @onecell/nanoclaw run lint            # Lint nanoclaw
pnpm --filter @onecell/nanoclaw run typecheck       # Type-check nanoclaw
pnpm --filter @onecell/nanoclaw run test            # Run nanoclaw tests

# Direct CMake usage for edgejs runtime work:
cmake --preset release                              # Configure release build
cmake --build --preset release                      # Build release runtime
ctest --preset release                              # Run release test preset
cmake --preset dev                                  # Configure debug build
cmake --build --preset dev                          # Build debug runtime
ctest --preset dev                                  # Run debug test preset

# Other presets: asan, coverage, wasix, release-shared-openssl
```

## CI / verification

- `.github/workflows/ci.yml` is the fast JS verification workflow for `@onecell/nanoclaw`.
- `.github/workflows/edgejs-native.yml` is the native/runtime verification workflow for edgejs-related changes and manual dispatch. It should use recursive submodules and validate Linux/macOS native builds plus targeted WASIX / napi-wasmer smoke coverage.

## Key integration

- nanoclaw imports `binaryPath` from `@onecell/edgejs` to locate the edge runtime binary.
- `packages/edgejs/runtime-api.js` resolves the built binary from the repo-level native build output.
- edgejs must be built before nanoclaw can use edge execution mode backed by the real runtime.

## Reference

When fixing bugs or implement features, please reference projects following:

- Harness engineering and UI implementation should reference:
  - `/Users/bytedance/Develop/claude-code/` — Claude Code CLI implementation
  - `/Users/bytedance/Develop/codex/` — OpenAI Codex CLI implementation
  - `/Users/bytedance/Develop/opencode/` — OpenCode CLI implementation
