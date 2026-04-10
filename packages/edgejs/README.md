<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/edgejs-logo-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/edgejs-logo-dark.svg">
    <img src="./assets/edgejs-logo-dark.svg" alt="OneCell Runtime logo" height="100">
  </picture>
</p>

<p align="center">
  Run JavaScript anywhere. <b>Safely</b>.
</p>

<p align="center">
  <a href="https://github.com/Zzzode/onecell">OneCell</a> ·
  <a href="../../CONTRIBUTING.md">Contributing</a> ·
  <a href="./ARCHITECTURE.md">Architecture</a>
</p>

<hr />

OneCell Runtime (formerly Edge.js) is a secure **JavaScript** runtime, designed for Edge computing and AI workloads. Part of the [OneCell](https://github.com/Zzzode/onecell) project.

OneCell Runtime **uses WebAssembly** for sandboxing when in `--safe` mode, so even the most insecure programs can run on it safely. It is also:

- Fully **compatible with Node.js**
- **Sandboxed** by design
- Pluggable with any **JS engine**: V8, JavaScriptCore or QuickJS
- Compatible with **any package manager**: NPM/PNPM/Yarn/Bun

## Install

```bash
curl -fsSL https://edgejs.org/install | bash
```

Or build from source (requires CMake >= 3.20, Make, C++20 compiler):

```bash
git clone https://github.com/Zzzode/onecell.git
cd onecell/packages/edgejs
git submodule update --init napi
make build
./build-edge/edge --version
```

## Usage

Use it like Node.js:

```js
const http = require("node:http");

http
  .createServer((_req, res) => {
    res.end("hello from edge\n");
  })
  .listen(3000, () => {
    console.log("listening on http://localhost:3000");
  });
```

```bash
$ edge server.js
```

Run inside the WebAssembly sandbox with `--safe`:

```bash
$ edge --safe server.js
```

Wrap your existing workflow:

```bash
$ edge node myfile.js
$ edge npm install
$ edge pnpm run dev
```

## Safe Mode

`edge --safe` runs the program through Wasmer with the current working directory mounted at `/home` inside the guest sandbox.

By default, Edge resolves the safe-mode runtime in this order:

1. `--wasmer-bin` / `--wasmer-package`
2. `WASMER_BIN` / `EDGE_WASMER_PACKAGE`
3. `~/.wasmer/bin/wasmer`
4. A matching cached `wasmer/edgejs@=...` package from `~/.wasmer/cache/checkouts/`
5. The registry package name baked into the build

A locally installed Wasmer plus a previously cached `wasmer/edgejs` package is enough to run `edge --safe` offline.

Pin a specific runtime explicitly:

```bash
WASMER_BIN="$HOME/.wasmer/bin/wasmer" \
EDGE_WASMER_PACKAGE="$HOME/.wasmer/cache/checkouts/<sha>.bin" \
edge --safe server.js
```

## Development

Clone the repo and initialize the `napi` submodule:

```bash
git clone https://github.com/Zzzode/onecell.git
cd onecell/packages/edgejs
git submodule update --init napi
```

Build the CLI locally:

```bash
make build
./build-edge/edge server.js
```

Run in dev mode:

```bash
./build-edge/edge --run dev
```

Run tests:

```bash
make test
NODE_TEST_RUNNER="$(pwd)/build-edge/edge" \
./test/nodejs_test_harness --category=node:assert
```

## Architecture

For architecture details, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Key components

```
packages/edgejs/
├── src/           # C++ runtime core (~90 source files)
├── lib/           # JavaScript standard library (Node.js-compatible)
├── napi/          # N-API abstraction layer (git submodule)
├── deps/          # Vendored libraries (V8, libuv, OpenSSL, zlib...)
├── tests/         # C++ test runners + JS fixtures
└── scripts/       # Build and test scripts
```

## Roadmap

- **0.x** Production readiness: platform coverage across Linux, Windows, macOS, iOS, and Android; reliability in constrained environments; security audits; and successful real production use.
- **1.x** Performance: faster startup, faster core paths, and performance that competes with or beats Node.js, Bun, and Deno on most workloads.
- **2.x** Developer experience: first-class TypeScript support and smoother DX.

## Contributing

See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general guidelines. For architecture and porting policies, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## License

[MIT](./LICENSE)
