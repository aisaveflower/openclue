import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Fiber, Layer } from "effect"
import { Shell } from "@opencode-ai/core/shell"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ShellTool } from "../../src/tool/shell"
import { BackgroundTool } from "../../src/tool/background"
import { BackgroundJob } from "../../src/background/job"
import { Config } from "@/config/config"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "../../src/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const shellLayer = Layer.mergeAll(
  LayerNode.compile(
    LayerNode.group([
      CrossSpawnSpawner.node,
      FSUtil.node,
      Plugin.node,
      Truncate.node,
      Config.node,
      Agent.node,
      RuntimeFlags.node,
      BackgroundJob.node,
    ]),
  ),
  testInstanceStoreLayer,
)
const it = testEffect(shellLayer)

const initShell = Effect.fn("ShellBackgroundTest.init")(function* () {
  const info = yield* ShellTool
  return yield* info.init()
})

const initBackground = Effect.fn("ShellBackgroundTest.initBackground")(function* () {
  const info = yield* BackgroundTool
  return yield* info.init()
})

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

Shell.acceptable.reset()
const quote = (text: string) => `"${text}"`
const squote = (text: string) => `'${text}'`
const bin = quote(process.execPath.replaceAll("\\", "/"))
const sh = () => Shell.name(Shell.acceptable())
const command = (code: string) => {
  const text = `${bin} -e ${sh() === "cmd" ? quote(code) : squote(code)}`
  return sh() === "pwsh" || sh() === "powershell" ? `& ${text}` : text
}
const echo = () => command("console.log(11235813)")
const sleep = () => command("setTimeout(()=>{},30000)")

const runIn = <A, E, R>(directory: string, self: Effect.Effect<A, E, R>) => self.pipe(provideInstance(directory))
const metadata = (result: { metadata: unknown }) => result.metadata as Record<string, unknown>

describe("tool.shell background", () => {
  it.live("returns immediately with a job id and delivers the output later", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      yield* runIn(
        tmp,
        Effect.gen(function* () {
          const shell = yield* initShell()
          const jobs = yield* BackgroundJob.Service

          const result = yield* shell.execute({ command: echo(), background: true }, ctx)

          expect(metadata(result).background).toBe(true)
          const jobID = String(metadata(result).jobId)
          expect(jobID.startsWith("job_")).toBe(true)
          expect(result.output).toContain(jobID)
          expect(result.output).toContain("running in the background")

          const waited = yield* jobs.wait({ id: jobID, timeout: 20000 })
          expect(waited.timedOut).toBe(false)
          expect(waited.info?.status).toBe("completed")
          expect(waited.info?.output).toContain("11235813")
        }),
      )
    }),
  )

  it.live("promotes a running foreground command so the tool call returns a job id", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      yield* runIn(
        tmp,
        Effect.gen(function* () {
          const shell = yield* initShell()
          const jobs = yield* BackgroundJob.Service

          const call = yield* shell.execute({ command: sleep() }, ctx).pipe(Effect.forkChild)
          const running = yield* pollWithTimeout(
            jobs.list().pipe(Effect.map((all) => all.find((job) => job.status === "running"))),
            "shell command never registered a running job",
          )

          yield* jobs.promote(running.id)

          const result = yield* Fiber.join(call)
          expect(metadata(result).background).toBe(true)
          expect(metadata(result).jobId).toBe(running.id)

          const still = yield* jobs.wait({ id: running.id, timeout: 0 })
          expect(still.timedOut).toBe(true)
          expect(still.info?.status).toBe("running")

          yield* jobs.cancel(running.id)
          const cancelled = yield* jobs.get(running.id)
          expect(cancelled?.status).toBe("cancelled")
        }),
      )
    }),
  )

  it.live("keeps running after the tool call aborts its own signal", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      yield* runIn(
        tmp,
        Effect.gen(function* () {
          const shell = yield* initShell()
          const jobs = yield* BackgroundJob.Service
          const controller = new AbortController()

          const result = yield* shell.execute({ command: sleep(), background: true }, {
            ...ctx,
            abort: controller.signal,
          })
          const jobID = String(metadata(result).jobId)

          // The SDK aborts a tool call's signal once the step that requested the command
          // finishes; a command that already moved to the background must ignore that and
          // keep running until its job is cancelled.
          controller.abort()
          yield* Effect.sleep("1 seconds")

          const still = yield* jobs.wait({ id: jobID, timeout: 0 })
          expect(still.timedOut).toBe(true)
          expect(still.info?.status).toBe("running")

          yield* jobs.cancel(jobID)
          expect((yield* jobs.get(jobID))?.status).toBe("cancelled")
        }),
      )
    }),
  )

  it.live("reports a running job with its live output through the background tool", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      yield* runIn(
        tmp,
        Effect.gen(function* () {
          const shell = yield* initShell()
          const background = yield* initBackground()
          const jobs = yield* BackgroundJob.Service

          const result = yield* shell.execute({ command: sleep(), background: true }, ctx)
          const jobID = String(metadata(result).jobId)

          const status = yield* background.execute({ action: "get", job_id: jobID }, ctx)
          expect(status.output).toContain(`job: ${jobID}`)
          expect(status.output).toContain("status: running")

          const listed = yield* background.execute({ action: "list" }, ctx)
          expect(listed.output).toContain(jobID)

          const cancelled = yield* background.execute({ action: "cancel", job_id: jobID }, ctx)
          expect(cancelled.output).toContain("was cancelled")
          expect((yield* jobs.get(jobID))?.status).toBe("cancelled")
        }),
      )
    }),
  )
})
