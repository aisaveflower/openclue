# OpenClue

OpenClue is a complete, standalone AI coding agent based on OpenCode v2.0.10. Its defining feature is **Mulitagent** mode: one request is automatically turned into several genuinely different implementation paths, implemented in parallel by isolated workers, then compared and consolidated into the original workspace.

> This repository contains the full OpenClue source tree. It is not a patch, plugin, or overlay that must be applied to another OpenCode checkout.

[简体中文](README.zh.md)

## Mulitagent mode

Press `Tab` or `Shift+Tab` in the TUI to cycle between the primary modes:

- **Build** — the standard implementation mode.
- **Plan** — read-only planning and exploration.
- **Mulitagent** — fully automatic parallel implementation.

For each request, Mulitagent mode:

1. Designs N substantially different implementation methods.
2. Creates an isolated Git worktree for every method.
3. Starts all N implementation agents concurrently.
4. Makes every worker edit code and run verification, rather than only offering advice.
5. Gives the resulting reports and diffs to the primary agent, which selects or combines the strongest result and applies it to the original workspace.

Mulitagent mode does not ask the user clarifying questions. It makes reasonable assumptions and continues through implementation and verification automatically.

The default worker count is 3. Configure 1–8 workers in `opencode.json` or `opencode.jsonc`:

```json
{
  "experimental": {
    "mulitagent_agents": 3
  }
}
```

The `mulitagent` spelling is intentional and is the stable mode/configuration identity.

## Install

When the npm release is available:

```bash
npm install --global openclue
openclue
```

OpenClue and OpenCode can be installed together. They expose different commands (`openclue` and `opencode`) and use different global data, cache, config, state, and temporary directories. OpenClue continues to read project-level `.opencode` directories and `opencode.json(c)` files for ecosystem compatibility.

## Build from source

Requirements: Git and Bun 1.3.14 or newer.

```bash
git clone https://github.com/aisaveflower/openclue.git
cd openclue
bun install
bun run --cwd packages/cli build --single
```

The native package is emitted under `packages/cli/dist/openclue-<platform>-<arch>/`. Run directly from source with:

```bash
bun run --cwd packages/cli dev
```

## Repository and release identity

| Component | Value |
| --- | --- |
| CLI command | `openclue` |
| npm wrapper | `openclue` |
| native npm packages | `openclue-<platform>-<arch>` |
| source release | `2.0.10-openclue.1` |
| upstream baseline | OpenCode `v2.0.10` |
| source repository | <https://github.com/aisaveflower/openclue> |

Inherited internal package names and selected `OPENCODE_*` environment variables remain for upstream compatibility. OpenClue also accepts equivalent `OPENCLUE_*` variables; the OpenClue form takes precedence for its own config path and home overrides.

## Relationship to OpenCode

OpenClue is an independent, unofficial fork of [OpenCode](https://github.com/anomalyco/opencode). It is not affiliated with, endorsed by, or supported by the OpenCode team. Upstream references remain where needed for attribution, compatibility, providers, protocols, and internal APIs.

## License

OpenClue is distributed under the MIT License. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
