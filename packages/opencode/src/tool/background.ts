import DESCRIPTION from "./background.txt"
import * as Tool from "./tool"
import { Effect, Schema } from "effect"
import { open } from "node:fs/promises"
import { BackgroundJob } from "@/background/job"
import { ShellID } from "./shell/id"

const id = "background"

const TAIL_BYTES = 8 * 1024
const DEFAULT_WAIT_MS = 30_000

const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "get", "cancel", "wait"]).annotate({
    description: "list every background job, get one job's status and live output, cancel a running job, or wait for one to finish",
  }),
  job_id: Schema.optional(Schema.String).annotate({
    description: 'Job id returned by the bash tool. Required for action="get", "cancel", and "wait".',
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description: `For action="wait": milliseconds to wait before reporting progress. Defaults to ${DEFAULT_WAIT_MS}.`,
  }),
})

// Every branch below reports through this shape. Declaring it once keeps the tool
// metadata a single type instead of a union of per-branch literals.
type BackgroundMetadata = {
  count?: number
  running?: number
  jobs?: string[]
  jobId?: string
  status?: BackgroundJob.Status
  timedOut?: boolean
}

export const BackgroundTool = Tool.define<typeof Parameters, BackgroundMetadata, BackgroundJob.Service, "background">(
  id,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service

    const run = Effect.fn("BackgroundTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      if (params.action === "list") {
        const jobs = yield* background.list()
        const running = jobs.filter((job) => job.status === "running")
        // Completed jobs accumulate for the life of the workspace, so keep the output
        // focused on live work and the most recent history.
        const finished = jobs.filter((job) => job.status !== "running").slice(-10)
        const visible = [...running, ...finished]
        return {
          title: `Background jobs (${jobs.length})`,
          metadata: { count: jobs.length, running: running.length, jobs: visible.map((job) => job.id) },
          output: visible.length
            ? [
                ...visible.map((job) => renderJob(job)),
                ...(visible.length < jobs.length
                  ? [`(${jobs.length - visible.length} older finished job(s) omitted)`]
                  : []),
              ].join("\n")
            : "No background commands have been started in this workspace.",
        }
      }

      const jobID = params.job_id
      if (!jobID) return yield* Effect.fail(new Error(`job_id is required for action="${params.action}"`))
      const job = yield* background.get(jobID)
      if (!job) return yield* Effect.fail(new Error(`Unknown background job: ${jobID}`))

      if (params.action === "cancel") {
        const command = typeof job.metadata?.command === "string" ? job.metadata.command : jobID
        if (job.status !== "running") {
          return {
            title: job.title ?? jobID,
            metadata: { jobId: jobID, status: job.status },
            output: `${renderJobDetail(job, undefined, false)}\n\nThe job already finished, so there was nothing to cancel.`,
          }
        }
        yield* ctx.ask({
          permission: ShellID.ToolID,
          patterns: [command],
          always: [],
          metadata: { command, job_id: jobID },
        })
        const cancelled = (yield* background.cancel(jobID)) ?? job
        return {
          title: cancelled.title ?? jobID,
          metadata: { jobId: jobID, status: cancelled.status },
          output: `${renderJobDetail(cancelled, yield* readLogTail(cancelled), false)}\n\nThe job was cancelled and its process was killed.`,
        }
      }

      const waited =
        params.action === "wait"
          ? yield* background.wait({ id: jobID, timeout: params.timeout ?? DEFAULT_WAIT_MS })
          : { info: job, timedOut: false }
      const info = waited.info ?? job
      return {
        title: info.title ?? jobID,
        metadata: { jobId: jobID, status: info.status, ...(waited.timedOut ? { timedOut: true } : {}) },
        output: renderJobDetail(info, yield* readLogTail(info), waited.timedOut),
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)

function runtime(job: BackgroundJob.Info) {
  const seconds = Math.max(0, Math.round(((job.completed_at ?? Date.now()) - job.started_at) / 1000))
  return `${seconds}s`
}

function renderJob(job: BackgroundJob.Info) {
  const command = typeof job.metadata?.command === "string" ? job.metadata.command : job.title ?? job.type
  return `- ${job.id} [${job.status}] ${runtime(job)} — ${command}`
}

function renderJobDetail(job: BackgroundJob.Info, tail: string | undefined, timedOut: boolean) {
  const command = typeof job.metadata?.command === "string" ? job.metadata.command : job.title ?? job.type
  const log = typeof job.metadata?.log === "string" ? job.metadata.log : undefined
  const output = tail?.trim() ? tail.trim() : job.output?.trim()
  return [
    `job: ${job.id}`,
    `status: ${job.status}${job.status === "running" && timedOut ? " (still running)" : ""}`,
    `command: ${command}`,
    `runtime: ${runtime(job)}`,
    ...(log ? [`log: ${log}`] : []),
    ...(job.error ? [`error: ${job.error}`] : []),
    "",
    output ? `${job.status === "running" ? "output so far" : "output"}:\n${output}` : "output: (nothing yet)",
  ].join("\n")
}

// Live logs are the running job's raw stdout/stderr, so read only the tail instead
// of loading a dev server's entire history into context.
function readLogTail(job: BackgroundJob.Info) {
  const file = job.metadata?.log
  return Effect.promise(async () => {
    if (typeof file !== "string") return undefined
    const handle = await open(file, "r").catch(() => undefined)
    if (!handle) return undefined
    const stat = await handle.stat().catch(() => undefined)
    if (!stat || stat.size <= 0) {
      await handle.close().catch(() => undefined)
      return undefined
    }
    const size = Math.min(TAIL_BYTES, stat.size)
    const buffer = Buffer.alloc(size)
    const result = await handle.read(buffer, 0, size, stat.size - size).catch(() => undefined)
    await handle.close().catch(() => undefined)
    if (!result || result.bytesRead <= 0) return undefined
    return buffer.subarray(0, result.bytesRead).toString("utf-8")
  })
}
