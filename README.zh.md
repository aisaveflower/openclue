# OpenClue

OpenClue 是一个完整、独立的 AI 编程代理，原生支持后台 Shell 任务。开发服务器、监听器、构建和测试等长时间命令可以持续运行，同时你仍然可以继续对话；任务完成后，结果会自动返回会话。

> **这里保存的是 OpenClue 的完整源码。** 它不是补丁包、插件或需要覆盖到另一个项目上的零散文件。克隆本仓库即可获得构建、测试和继续开发 OpenClue 所需的全部源码。

[English](README.md)

## OpenClue 1.0

本仓库是 OpenClue 1.0 的初始开发基线。今后的 OpenClue 版本和功能都直接在这套完整源码上持续迭代。

首个基线源自 opencode 1.18.16。仓库保留这段来源信息用于许可证合规和技术兼容，但 OpenClue 拥有自己的命令、软件包、构建产物、数据目录、发布版本和产品路线。

## 主要特点

- CLI、TUI、服务端、Web、桌面端、SDK、测试、基础设施和构建工具均包含在同一仓库中。
- 使用独立的 `openclue` 命令和 `openclue-*` 平台包。
- 后台任务支持 `list`、`get`、`wait` 和 `cancel` 操作。
- 用户发送新消息时，可以自动把仍在运行的前台命令转为后台任务。
- 持续记录任务输出，并在完成或失败时自动向会话报告。
- OpenClue 默认使用独立的数据、缓存、配置和状态目录。
- 在必要处兼容现有 opencode 配置和插件生态。

## 安装和运行

npm 发行版由 `openclue` 启动包和对应平台的原生二进制包组成。npm 发布完成后可使用：

```powershell
npm install --global openclue
openclue
```

各平台发行文件位于：

<https://github.com/aisaveflower/openclue/releases>

## 从源码构建

需要安装 [Bun](https://bun.sh/)、Git，以及当前平台原生依赖所需的构建工具。

```powershell
git clone https://github.com/aisaveflower/openclue.git
cd openclue
bun install
cd packages/opencode
bun run script/build.ts --single --skip-embed-web-ui
```

构建结果位于 `packages/opencode/dist/`。直接从源码启动交互界面：

```powershell
bun run --cwd packages/opencode dev
```

## 仓库结构

| 目录 | 内容 |
|---|---|
| `packages/opencode` | OpenClue CLI、运行时、工具、会话和原生构建脚本 |
| `packages/app` | Web 应用 |
| `packages/desktop` | 桌面应用 |
| `packages/server` | 服务端组件 |
| `packages/sdk`、`sdks` | SDK 和编辑器集成 |
| `packages/core`、`packages/llm`、`packages/tui` | 公共运行时包 |
| `script`、`scripts` | 仓库自动化和发布工具 |
| `infra` | 基础设施定义 |
| `patches` | 构建使用的依赖修复，以及用于追溯的上游变更资料 |

`patches` 是完整源码仓库的一部分，但不是 OpenClue 的发布方式。使用者不需要先下载 opencode 再手动应用 OpenClue 补丁。

## 命令与配置

| 项目 | OpenClue 使用的名称 |
|---|---|
| CLI 命令 | `openclue` |
| npm 包 | `openclue` 和 `openclue-<platform>-<arch>` |
| 构建二进制 | `openclue` / `openclue.exe` |
| 数据、缓存、配置、状态目录 | `openclue` |

为了兼容已有插件和项目设置，OpenClue 会继续识别项目内的 `.opencode` 目录、`opencode.json` / `opencode.jsonc`，以及部分 `OPENCODE_*` 环境变量。这只是兼容层，不代表 OpenClue 是补丁项目。

## 后台任务

OpenClue 的 Shell 工具可以立即在后台启动命令。当前台命令尚未结束而用户继续发送消息时，也可以自动将其转入后台。随后可通过后台工具查看状态和输出、等待完成或取消任务。

主要实现位于：

- `packages/opencode/src/tool/shell.ts`
- `packages/opencode/src/tool/background.ts`
- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/test/tool/shell-background.test.ts`

运行相关测试：

```powershell
cd packages/opencode
bun test test/tool/shell-background.test.ts --timeout 30000
```

## 与 opencode 的关系

OpenClue 是基于 [opencode](https://github.com/anomalyco/opencode) 开发的独立分支项目，与 Anomaly 不存在隶属、官方认可或技术支持关系。源码中仍会保留许可证署名、兼容接口、依赖包名称和部分内部目录名。

分支建立时的上游说明保存在 `README.upstream.md`，仅用于署名和历史参考。

## 许可证

OpenClue 使用 MIT 许可证发布。完整条款和上游署名见 `LICENSE` 与 `NOTICE.md`。
