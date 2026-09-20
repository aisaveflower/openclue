# OpenClue

OpenClue is a complete, standalone AI coding agent with first-class background shell jobs. Long-running dev servers, watchers, builds, and test suites can keep running while the conversation continues, and their results return to the session automatically.

> **This is the full OpenClue source repository.** It is not a patch pack, add-on, or set of files that must be applied to another checkout. Clone this repository and you have the complete source needed to build, test, and develop OpenClue.

[简体中文](README.zh.md)

## OpenClue 1.0

This repository is the initial OpenClue 1.0 development baseline. Future OpenClue releases and features will be developed directly on this codebase.

The first baseline was derived from opencode 1.18.16. That ancestry is kept for license compliance and technical compatibility, but OpenClue has its own command, packages, build outputs, data directories, releases, and product roadmap.

## Highlights

- Complete CLI, TUI, server, web, desktop, SDK, tests, infrastructure, and build tooling in one repository.
- Native `openclue` command and `openclue-*` platform packages.
- Background shell jobs with `list`, `get`, `wait`, and `cancel` operations.
- Automatic promotion of a running foreground command when a new message arrives.
- Live output capture and automatic completion or failure messages.
- Separate OpenClue data, cache, config, and state directories.
- Compatibility with the existing opencode configuration and plugin ecosystem where useful.

## Install and run

The npm distribution consists of the `openclue` wrapper plus a native package for each supported platform. Once the npm release is available:

```bash
npm install --global openclue
openclue
```

Release binaries are published at:

<https://github.com/aisaveflower/openclue/releases>

## Build from source

Requirements:

- [Bun](https://bun.sh/)
- Git
- Platform build tools required by native dependencies

```bash
git clone https://github.com/aisaveflower/openclue.git
cd openclue
bun install
cd packages/opencode
bun run script/build.ts --single --skip-embed-web-ui
```

The platform binary is written below `packages/opencode/dist/`. To run the interactive TUI directly from source:

```bash
bun run --cwd packages/opencode dev
```

## Repository layout

| Path | Purpose |
|---|---|
| `packages/opencode` | OpenClue CLI, runtime, tools, sessions, and native build scripts |
| `packages/app` | Web application |
| `packages/desktop` | Desktop application |
| `packages/server` | Server components |
| `packages/sdk` and `sdks` | SDKs and editor integrations |
| `packages/core`, `packages/llm`, `packages/tui` | Shared runtime packages |
| `script` and `scripts` | Repository automation and release utilities |
| `infra` | Infrastructure definitions |
| `patches` | Dependency fixes and historical upstream-reference material used by the build |

The `patches` directory is part of the source tree, but it is not the OpenClue distribution model. Users do not need to download opencode and apply an OpenClue patch.

## Command and configuration identity

| Component | OpenClue identity |
|---|---|
| CLI command | `openclue` |
| npm packages | `openclue` and `openclue-<platform>-<arch>` |
| build binary | `openclue` / `openclue.exe` |
| data directory | `openclue` |
| config directory | `openclue` |
| cache directory | `openclue` |
| state directory | `openclue` |

OpenClue deliberately retains compatibility with project-level `.opencode` directories, `opencode.json` / `opencode.jsonc`, and selected `OPENCODE_*` variables so existing plugins and project settings continue to work. This compatibility does not change the executable name or make OpenClue a patch-only project.

## Background jobs

OpenClue's shell tool can start a command in the background immediately. A foreground command that is still running when the user sends another message can also be promoted automatically. The background tool can then inspect status and output, wait for completion, or cancel the job.

The main implementation lives in:

- `packages/opencode/src/tool/shell.ts`
- `packages/opencode/src/tool/background.ts`
- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/test/tool/shell-background.test.ts`

Run the focused tests from the package directory:

```bash
cd packages/opencode
bun test test/tool/shell-background.test.ts --timeout 30000
```

## Relationship to opencode

OpenClue is an independent fork based on [opencode](https://github.com/anomalyco/opencode). It is not affiliated with, endorsed by, or supported by Anomaly. References to opencode remain where required for upstream attribution, compatibility, dependency names, and inherited internal APIs.

The upstream README at the time of the fork is preserved as `README.upstream.md` for attribution and historical reference.

## License

OpenClue is distributed under the MIT License. See `LICENSE` and `NOTICE.md` for the full license and upstream attribution.
