export * as ConfigExperimental from "./experimental.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"
import { ConfigPolicy } from "./policy.js"

export class Info extends Schema.Class<Info>("ConfigExperimental.Info")({
  portable_shell_scanner: Schema.Boolean.pipe(optional).annotate({
    description: "Enable the experimental portable shell permission scanner. Defaults to false.",
  }),
  subagent_depth: NonNegativeInt.pipe(optional).annotate({
    description: "Maximum subagent nesting depth. Defaults to 1.",
  }),
  mulitagent_agents: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))
    .pipe(optional)
    .annotate({
      description: "Number of parallel workers used by Mulitagent mode. Defaults to 3 (range: 1-8).",
    }),
  policies: ConfigPolicy.Info.pipe(Schema.Array, optional).annotate({
    description: "Ordered policies controlling access to configured resources",
  }),
}) {}
