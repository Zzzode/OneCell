# Security Policy

## Security Model

OneCell is designed with security as a core principle:

### OneCell Runtime (`@onecell/edgejs`)

- **WebAssembly sandboxing:** Programs can run inside a Wasmer WASM sandbox (`--safe` mode), isolating execution at the OS level
- **N-API abstraction:** Multiple JS engines (V8, JavaScriptCore, QuickJS) behind a secure boundary
- **No host access in safe mode:** Sandboxed programs cannot access the host filesystem, network, or other resources without explicit mounting

### OneCell Assistant (`@onecell/nanoclaw`)

- **Container isolation:** Agents run in Linux containers (Docker or Apple Container) with filesystem isolation
- **Explicit mount model:** Only explicitly mounted directories are accessible to agents
- **Credential proxy:** API keys never enter containers — outbound requests route through a credential proxy that injects authentication at request time
- **Per-group isolation:** Each conversation group has its own isolated filesystem, memory, and sandbox

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please report them through GitHub's security advisory feature:

1. Go to [github.com/Zzzode/onecell/security/advisories](https://github.com/Zzzode/onecell/security/advisories)
2. Click "Report a vulnerability"
3. Provide a detailed description of the vulnerability

You can also email the maintainers directly if you prefer.

Please include:

- Type of vulnerability (e.g., sandbox escape, privilege escalation, code injection)
- Full paths of source files related to the vulnerability
- Steps to reproduce
- Potential impact

We aim to acknowledge reports within 48 hours and will keep you updated on the progress of a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch | Yes |
| Latest release | Yes |
| Older releases | No |

For package-specific security details, see:
- [OneCell Runtime security](packages/edgejs/README.md#safe-mode)
- [OneCell Assistant security](packages/nanoclaw/docs/SECURITY.md)
