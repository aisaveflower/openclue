# OpenClue

OpenClue 是一个完整、独立的 AI 编程代理，基于 OpenCode v2.0.10。它的核心新增能力是 **Mulitagent** 模式：收到一个请求后，先自动设计多条真正不同的实现路径，再让多个隔离的代理并行完成实际编码和测试，最后由主代理比较、择优或合并，并把最终方案落实到用户原始工作区。

> 本仓库是 OpenClue 的完整源码，不是补丁包、插件或必须覆盖到 OpenCode 源码上的文件集合。

[English](README.md)

## Mulitagent 模式

在 TUI 中按 `Tab` 或 `Shift+Tab`，可以在三个主模式之间切换：

- **Build**：标准实现模式。
- **Plan**：只读规划与代码探索模式。
- **Mulitagent**：全自动并行实现模式。

每次收到请求后，Mulitagent 会：

1. 根据并行数量设计 N 个有实质差异的实现方法。
2. 为每种方法创建独立 Git worktree。
3. 同时启动 N 个实现代理。
4. 要求每个代理真正修改代码并执行验证，而不是只给建议。
5. 将各实现的报告和 diff 交给主代理，由主代理择优或合并，应用到原始工作区并再次验证。

Mulitagent 不会向用户追问；遇到不确定内容时会自行做合理假设并继续完成任务。

默认并行代理数为 3，可在 `opencode.json` 或 `opencode.jsonc` 中配置为 1–8：

```json
{
  "experimental": {
    "mulitagent_agents": 3
  }
}
```

`mulitagent` 的拼写是有意保留的正式模式名和配置名。

## 安装

npm 版本发布后：

```bash
npm install --global openclue
openclue
```

OpenClue 可以和 OpenCode 同时安装：命令分别是 `openclue` 与 `opencode`，全局数据、缓存、配置、状态和临时目录也相互独立。为兼容原有生态，OpenClue 仍会读取项目中的 `.opencode` 目录以及 `opencode.json(c)`。

## 从源码构建

需要 Git，以及 Bun 1.3.14 或更新版本：

```bash
git clone https://github.com/aisaveflower/openclue.git
cd openclue
bun install
bun run --cwd packages/cli build --single
```

原生包输出到 `packages/cli/dist/openclue-<platform>-<arch>/`。也可以直接从源码运行：

```bash
bun run --cwd packages/cli dev
```

## 版本与来源

当前源码版本为 `2.0.10-openclue.1`，上游基线为 OpenCode `v2.0.10`。后续 OpenClue 功能直接在本仓库继续迭代，不需要再下载 OpenCode 后应用补丁。

OpenClue 是 [OpenCode](https://github.com/anomalyco/opencode) 的独立非官方分支，与 OpenCode 团队没有隶属、背书或支持关系。部分内部包名、协议和环境变量继续保留 OpenCode 名称，以维持上游兼容性。

## 许可证

OpenClue 使用 MIT License。详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。
