import { describe, expect, test } from "bun:test"
import type { SessionPrompt } from "@opencode/plugin/effect/session"
import { Agent } from "@opencode/schema/agent"
import { Money } from "@opencode/schema/money"
import { Session } from "@opencode/schema/session"
import { Config } from "@opencode/core/config"
import { Location } from "@opencode/core/location"
import { Permission } from "@opencode/core/permission"
import { MulitagentPlugin } from "@opencode/core/plugin/mulitagent"
import { Project } from "@opencode/core/project"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionMessage } from "@opencode/core/session/message"
import { DateTime, Deferred, Effect, Types } from "effect"
import { host } from "./host"

const parentID = Session.ID.make("ses_mulitagent_parent")
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const parent = Session.Info.make({
  id: parentID,
  projectID: Project.ID.make("project_mulitagent"),
  agent: MulitagentPlugin.id,
  cost: Money.USD.zero,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
  location,
})

describe("MulitagentPlugin", () => {
  test("parses exactly the configured number of implementation paths", () => {
    expect(MulitagentPlugin.parsePaths('{"paths":["direct","adapter","rewrite"]}', 3)).toEqual([
      "direct",
      "adapter",
      "rewrite",
    ])
    expect(MulitagentPlugin.parsePaths('{"paths":["only one"]}', 3)).toHaveLength(3)
    expect(MulitagentPlugin.parsePaths("not json", 4)).toHaveLength(4)
  })

  test("registers an automatic primary agent and implementation worker", async () => {
    const agents = new Map<Agent.ID, Types.DeepMutable<Agent.Info>>()
    await Effect.runPromise(
      Effect.scoped(
        MulitagentPlugin.Plugin.effect(
          host({
            agent: {
              get: () => Effect.die("unused agent.get"),
              list: () => Effect.die("unused agent.list"),
              reload: () => Effect.die("unused agent.reload"),
              transform: (callback) => {
                callback({
                  list: () => Array.from(agents.values()),
                  get: (id) => agents.get(Agent.ID.make(id)),
                  default: () => {},
                  update: (id, update) => {
                    const key = Agent.ID.make(id)
                    const item =
                      agents.get(key) ?? (structuredClone(Agent.Info.default(key)) as Types.DeepMutable<Agent.Info>)
                    agents.set(key, item)
                    update(item)
                  },
                  remove: (id) => agents.delete(Agent.ID.make(id)),
                })
                return Effect.succeed({ dispose: Effect.void })
              },
            },
            session: { hook: () => Effect.succeed({ dispose: Effect.void }) },
          }),
        ),
      ).pipe(Effect.provide(Config.testLayer())),
    )

    const primary = agents.get(MulitagentPlugin.id)
    const worker = agents.get(MulitagentPlugin.workerID)
    expect(primary).toMatchObject({ name: "Mulitagent", mode: "primary", hidden: false })
    expect(worker).toMatchObject({ name: "Mulitagent Worker", mode: "subagent", hidden: true })
    expect(Permission.evaluate("question", "*", primary?.permissions ?? []).effect).toBe("deny")
    expect(Permission.evaluate("edit", "source.ts", primary?.permissions ?? []).effect).toBe("allow")
    expect(Permission.evaluate("question", "*", worker?.permissions ?? []).effect).toBe("deny")
    expect(Permission.evaluate("edit", "source.ts", worker?.permissions ?? []).effect).toBe("allow")
  })

  test("runs three isolated implementation workers concurrently and injects their diffs", async () => {
    let promptHook: ((event: SessionPrompt) => Effect.Effect<void>) | undefined
    let childNumber = 0
    let waiting = 0
    let maximumWaiting = 0
    const prompted = new Array<string>()
    const allWaiting = await Effect.runPromise(Deferred.make<void>())
    const child = (id: Session.ID, directory: AbsolutePath) =>
      Session.Info.make({
        ...parent,
        id,
        agent: MulitagentPlugin.workerID,
        location: Location.Ref.make({ directory }),
      })

    const program = Effect.scoped(
      Effect.gen(function* () {
        yield* MulitagentPlugin.Plugin.effect(
          host({
            agent: {
              get: () => Effect.die("unused agent.get"),
              list: () => Effect.die("unused agent.list"),
              reload: () => Effect.die("unused agent.reload"),
              transform: () => Effect.succeed({ dispose: Effect.void }),
            },
            session: {
              hook: (name, callback) => {
                if (name === "prompt") promptHook = callback as (event: SessionPrompt) => Effect.Effect<void>
                return Effect.succeed({ dispose: Effect.void })
              },
              get: () => Effect.succeed(parent),
              generate: () => Effect.succeed({ text: '{"paths":["method A","method B","method C"]}' }),
              create: (input) => {
                childNumber++
                return Effect.succeed(
                  child(
                    Session.ID.make(`ses_mulitagent_child_${childNumber}`),
                    AbsolutePath.make(input?.location?.directory ?? `/worktree/${childNumber}`),
                  ),
                )
              },
              prompt: (input) => {
                prompted.push(input.text)
                return Effect.succeed(
                  SessionInbox.User.make({
                    id: SessionMessage.ID.create(),
                    sessionID: input.sessionID,
                    time: { created: DateTime.makeUnsafe(0) },
                    type: "user",
                    payload: { text: input.text },
                    delivery: "steer",
                  }),
                )
              },
              wait: () =>
                Effect.gen(function* () {
                  waiting++
                  maximumWaiting = Math.max(maximumWaiting, waiting)
                  if (waiting === 3) yield* Deferred.succeed(allWaiting, undefined)
                  yield* Deferred.await(allWaiting)
                  waiting--
                }),
              context: () => Effect.succeed([]),
            },
            worktree: {
              list: () => Effect.die("unused worktree.list"),
              create: (input) =>
                Effect.succeed({ directory: AbsolutePath.make(`/worktree/${input?.name ?? "candidate"}`) }),
              remove: () => Effect.die("unused worktree.remove"),
              refresh: () => Effect.die("unused worktree.refresh"),
              transform: () => Effect.die("unused worktree.transform"),
              reload: () => Effect.die("unused worktree.reload"),
            },
            vcs: {
              base: () => Effect.die("unused vcs.base"),
              get: () => Effect.die("unused vcs.get"),
              branch: { list: () => Effect.die("unused vcs.branch.list") },
              status: () => Effect.die("unused vcs.status"),
              diff: (input) =>
                Effect.succeed({
                  location,
                  data:
                    input.location?.directory === parent.location.directory
                      ? []
                      : [
                          {
                            file: "src/example.ts",
                            status: "modified" as const,
                            additions: 1,
                            deletions: 0,
                            patch: "+implemented",
                          },
                        ],
                }),
              transform: () => Effect.die("unused vcs.transform"),
              reload: () => Effect.die("unused vcs.reload"),
            },
          }),
        )
        if (!promptHook) return yield* Effect.die("Mulitagent prompt hook was not registered")
        const event: SessionPrompt = {
          sessionID: parentID,
          messageID: SessionMessage.ID.create(),
          prompt: { text: "Implement the feature" },
          delivery: "steer",
        }
        yield* promptHook(event)
        expect(maximumWaiting).toBe(3)
        expect(prompted).toHaveLength(3)
        expect(prompted[0]).toContain("method A")
        expect(prompted[1]).toContain("method B")
        expect(prompted[2]).toContain("method C")
        expect(event.prompt.text).toContain('<mulitagent-results count="3">')
        expect(event.prompt.text).toContain("+implemented")
      }),
    ).pipe(Effect.provide(Config.testLayer()))

    await Effect.runPromise(program)
  })
})
