# Edgejs package wrapper

Package-local guidance for `@onecell/edgejs`.

## What this package is

`packages/edgejs/` is the npm wrapper that exposes `binaryPath` and package metadata for the edgejs runtime.

## What this package is not

The actual runtime source, native build configuration, and most verification surface live at the monorepo root:

- `src/` — C++ runtime source
- `lib/` — JS standard library
- `deps/` — vendored dependencies
- `napi/` — N-API layer and Rust/Wasm helpers
- `wasix/` — WASIX build support
- `CMakeLists.txt` / `CMakePresets.json` — native build entrypoints

## Build / verification

Run these from the monorepo root.

Shorthand:

```bash
pnpm build:edgejs
```

Direct CMake alternative:

```bash
cmake --preset release
cmake --build --preset release
ctest --preset release
cmake --build build-release --target test-wasix-napi-cli
```

For WASIX-specific validation, the repo also contains the `wasix` preset and the `build-wasix` / `test-wasix-napi-cli` targets rooted in the top-level CMake project.

## Integration contract

`runtime-api.js` resolves the runtime binary from the repo-level build output and exports it as `binaryPath`. Downstream packages such as `@onecell/nanoclaw` depend on that path when they execute through the native edge runtime.
