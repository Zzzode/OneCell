<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="OneCell Assistant" width="400">
</p>

<p align="center">
  An AI assistant that runs agents securely in their own containers.<br/>
  Lightweight, customizable, part of <a href="https://github.com/Zzzode/onecell">OneCell</a>.
</p>

<p align="center">
  <a href="https://github.com/Zzzode/onecell">OneCell</a> &nbsp;·&nbsp;
  <a href="README_zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README_ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="../../CONTRIBUTING.md">Contributing</a> &nbsp;·&nbsp;
  <a href="docs/SECURITY.md">Security</a>
</p>

---

## Why OneCell Assistant

[OpenClaw](https://github.com/openclaw/openclaw) is an impressive project, but it has nearly half a million lines of code, 53 config files, and 70+ dependencies. Its security is at the application level (allowlists, pairing codes) rather than true OS-level isolation. Everything runs in one Node process with shared memory.

OneCell Assistant provides the same core functionality in a codebase small enough to understand: one process and a handful of files. Claude agents run in their own Linux containers with filesystem isolation, not merely behind permission checks.

## Quick Start

```bash
git clone https://github.com/Zzzode/onecell.git
cd onecell/packages/nanoclaw
pnpm install
claude
```

Then run `/setup`. Claude Code handles everything: dependencies, authentication, container setup and service configuration.

> **Note:** Commands prefixed with `/` (like `/setup`, `/add-whatsapp`) are [Claude Code skills](https://code.claude.com/docs/en/skills). Type them inside the `claude` CLI prompt, not in your regular terminal. If you don't have Claude Code installed, get it at [claude.com/product/claude-code](https://claude.com/product/claude-code).

## Philosophy

**Small enough to understand.** One process, a few source files and no microservices. If you want to understand the full codebase, just ask Claude Code to walk you through it.

**Secure by isolation.** Agents run in Linux containers (Apple Container on macOS, or Docker) and they can only see what's explicitly mounted. Bash access is safe because commands run inside the container, not on your host.

**Built for the individual user.** OneCell Assistant isn't a monolithic framework; it's software that fits each user's exact needs. You make your own fork and have Claude Code modify it to match your needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that it's safe to make changes.

**AI-native.**

- No installation wizard; Claude Code guides setup.
- No monitoring dashboard; ask Claude what's happening.
- No debugging tools; describe the problem and Claude fixes it.

**Skills over features.** Instead of adding features to the codebase, contributors submit [Claude Code skills](https://code.claude.com/docs/en/skills) like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

## Features

- **Multi-channel messaging** — Talk to your assistant from WhatsApp, Telegram, Discord, Slack, or Gmail. Add channels with skills like `/add-whatsapp` or `/add-telegram`. Run one or many at the same time.
- **Isolated group context** — Each group has its own memory, isolated filesystem, and runs in its own container sandbox.
- **Main channel** — Your private channel (self-chat) for admin control.
- **Scheduled tasks** — Recurring jobs that run Claude and can message you back.
- **Web access** — Search and fetch content from the Web.
- **Container isolation** — Agents sandboxed in Docker (macOS/Linux), [Docker Sandboxes](docs/docker-sandboxes.md) (micro VM isolation), or Apple Container (macOS).
- **Credential security** — Agents never hold raw API keys. Outbound requests route through a credential proxy that injects credentials at request time.
- **Agent Swarms** — Spin up teams of specialized agents that collaborate on complex tasks.
- **Optional integrations** — Add Gmail (`/add-gmail`) and more via skills.

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy review the git history for the past week each Friday and update the README
@Andy every Monday at 8am, compile AI news from Hacker News and message me a briefing
```

From the main channel (your self-chat), manage groups and tasks:

```
@Andy list all scheduled tasks across groups
@Andy pause the Monday briefing task
@Andy join the Family Chat group
```

## Customizing

OneCell Assistant doesn't use configuration files. To make changes, tell Claude Code what you want:

- "Change the trigger word to @Bob"
- "Remember to make responses shorter and more direct"
- "Add a custom greeting when I say good morning"

Or run `/customize` for guided changes.

## Requirements

- macOS, Linux, or Windows (via WSL2)
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Apple Container](https://github.com/apple/container) (macOS) or [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

## Architecture

```
Channels --> SQLite --> Polling loop --> Container (Claude Agent SDK) --> Response
```

Single Node.js process. Channels are added via skills and self-register at startup. Agents execute in isolated Linux containers with filesystem isolation. Per-group message queue with concurrency control. IPC via filesystem.

Key files:

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/group-queue.ts` | Per-group queue with global concurrency limit |
| `src/container-runner.ts` | Spawns streaming agent containers |
| `src/task-scheduler.ts` | Runs scheduled tasks |

## Contributing

**Don't add features. Add skills.**

See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general guidelines, and [CONTRIBUTING.md](./CONTRIBUTING.md) for skill-specific details.

Only security fixes, bug fixes, and clear improvements are accepted into the base configuration. Everything else should be contributed as skills.

## FAQ

**Can I run this on Linux or Windows?**

Yes. Docker is the default runtime and works on macOS, Linux, and Windows (via WSL2). Just run `/setup`.

**Is this secure?**

Agents run in containers, not behind application-level permission checks. They can only access explicitly mounted directories. Credentials never enter the container. See [Security](docs/SECURITY.md) for the full security model.

**Can I use third-party or open-source models?**

Yes. Set these environment variables in your `.env` file:

```bash
ANTHROPIC_BASE_URL=https://your-api-endpoint.com
ANTHROPIC_API_KEY=your-token-here
```

This allows you to use local models via [Ollama](https://ollama.ai), open-source models on [Together AI](https://together.ai), [Fireworks](https://fireworks.ai), or any Anthropic-compatible API.

**How do I debug issues?**

Ask Claude Code. "Why isn't the scheduler running?" "What's in the recent logs?" That's the AI-native approach.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

[MIT](./LICENSE)
