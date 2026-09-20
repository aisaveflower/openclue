#!/usr/bin/env bun
/**
 * Push the current local commit to GitHub through the REST API.
 *
 * Why this exists: on some networks the git transport to github.com is unusable
 * (`git push` fails with "Empty reply from server", `git fetch` hangs after
 * git-upload-pack), while api.github.com keeps working. This mirrors the local commit
 * with the Git Data API instead.
 *
 * GitHub stores the message the API is given but normalises it (it drops a trailing
 * newline, and keeps the author's timezone offset), so the commit it stores can differ
 * from the local object even though the tree is identical. After pushing, this script
 * therefore rebuilds the local commit to match the stored one exactly, which keeps the
 * two histories identical and later pushes fast-forward.
 *
 * Usage:
 *   OC_TOKEN=<fine-grained token with Contents:write> bun run scripts/push-via-api.ts
 * Optional:
 *   OC_REPO=owner/name     (default aisaveflower/openclue)
 *   OC_BRANCH=name         (default: current branch)
 *   OC_FORCE=1             allow replacing remote history instead of refusing
 */
import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"

// Anchor to the repository this script lives in, so it works from any working directory.
const root = path.resolve(import.meta.dir, "..")

const token = process.env.OC_TOKEN
if (!token) {
  console.error("OC_TOKEN is required (fine-grained token with Contents: write)")
  process.exit(1)
}
const repo = process.env.OC_REPO ?? "aisaveflower/openclue"

const headers = {
  Authorization: `Bearer ${token}`,
  "User-Agent": "openclue-push",
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
}

function git(args: string[], env?: Record<string, string>) {
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(env ?? {}) },
  })
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString()}`)
  return proc.stdout.toString().trim()
}

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : undefined
}

// "epoch +0800" -> "2026-09-19T23:38:33+08:00"
function isoFromRaw(raw: string) {
  const [epoch, offset] = raw.split(" ")
  const shifted = new Date(Number(epoch) * 1000 + Number(offset.slice(1, 3)) * 3600000 + Number(offset.slice(3, 5)) * 60000)
  return `${shifted.toISOString().slice(0, 19)}${offset.slice(0, 3)}:${offset.slice(3, 5)}`
}

const offsets: string[] = []
for (let minutes = -14 * 60; minutes <= 14 * 60; minutes += 30) {
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  offsets.push(`${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`)
}

/** Rebuild one remote commit locally so its SHA matches, then move the branch to it. */
function alignLocal(commit: any, parent: string) {
  const flatten = (value: string) => [value, `${value}\n`]
  // Author and committer are separate instants (a commit usually happens a moment after
  // it is written), so each gets its own epoch while both share the stored UTC offset.
  const authorEpoch = Math.floor(new Date(commit.author.date).getTime() / 1000)
  const committerEpoch = Math.floor(new Date(commit.committer.date).getTime() / 1000)
  for (const message of flatten(commit.message)) {
    for (const offset of offsets) {
      writeFileSync(`${root}/.git/COMMIT_MSG`, message)
      const sha = git(
        ["commit-tree", commit.tree.sha, ...(parent ? ["-p", parent] : []), "-F", `${root}/.git/COMMIT_MSG`],
        {
          GIT_AUTHOR_NAME: commit.author.name,
          GIT_AUTHOR_EMAIL: commit.author.email,
          GIT_AUTHOR_DATE: `${authorEpoch} ${offset}`,
          GIT_COMMITTER_NAME: commit.committer.name,
          GIT_COMMITTER_EMAIL: commit.committer.email,
          GIT_COMMITTER_DATE: `${committerEpoch} ${offset}`,
        },
      )
      if (sha === commit.sha) {
        git(["update-ref", `refs/heads/${branchName}`, sha])
        git(["reset", "--hard", "-q", `refs/heads/${branchName}`])
        return `local realigned to ${sha.slice(0, 9)} (offset ${offset}, newline=${message.endsWith("\n")})`
      }
    }
  }
  return "could not reproduce the stored commit locally; histories now differ (use OC_FORCE=1 next time)"
}

const branchName = process.env.OC_BRANCH ?? git(["rev-parse", "--abbrev-ref", "HEAD"])
const head = git(["rev-parse", "HEAD"])
const parent = git(["rev-list", "--parents", "-n", "1", "HEAD"]).split(" ")[1] ?? ""
const fields = git(["log", "-1", "--format=%T%x00%an%x00%ae%x00%ad%x00%cn%x00%ce%x00%cd%x00%B", "--date=raw"]).split("\0")
const [tree, an, ae, ad, cn, ce, cd, message] = fields

const remoteRef = await api("GET", `/repos/${repo}/git/ref/heads/${branchName}`)
const remoteHead: string | undefined = remoteRef?.object?.sha
console.log(`local  ${branchName} = ${head}`)
console.log(`remote ${branchName} = ${remoteHead ?? "(absent)"}`)

if (remoteHead === head) {
  console.log("already up to date")
  process.exit(0)
}
if (remoteHead && remoteHead !== parent && process.env.OC_FORCE !== "1") {
  console.error(`refusing: remote is at ${remoteHead} but the local parent is ${parent}`)
  console.error("re-run with OC_FORCE=1 if you really mean to replace remote history")
  process.exit(1)
}

const parseTree = (raw: string) =>
  raw
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [metadata, file] = line.split("\t")
      const [mode, type, sha] = metadata.split(" ")
      return { path: file, mode, type, sha }
    })

const localTree = parseTree(git(["ls-tree", "-r", "-z", "HEAD"]))
const remoteCommit = remoteHead ? await api("GET", `/repos/${repo}/git/commits/${remoteHead}`) : undefined
const remoteTree = remoteCommit
  ? await api("GET", `/repos/${repo}/git/trees/${remoteCommit.tree.sha}?recursive=1`)
  : undefined
if (remoteTree?.truncated) throw new Error("remote recursive tree is truncated; refusing an incomplete comparison")

const remoteFiles = new Map<string, { mode: string; sha: string }>(
  (remoteTree?.tree ?? [])
    .filter((entry: any) => entry.type === "blob")
    .map((entry: any) => [entry.path, { mode: entry.mode, sha: entry.sha }]),
)
const localFiles = new Map(localTree.map((entry) => [entry.path, entry]))
const changed = localTree.filter((entry) => {
  const remote = remoteFiles.get(entry.path)
  return !remote || remote.mode !== entry.mode || remote.sha !== entry.sha
})
const deleted = [...remoteFiles.keys()].filter((file) => !localFiles.has(file))
console.log(`changed files: ${changed.length}; deleted files: ${deleted.length}`)

const entries: { path: string; mode: string; type: "blob"; sha: string | null }[] = []
for (const file of changed) {
  const absolute = path.join(root, file.path)
  if (!existsSync(absolute)) throw new Error(`tracked file is missing: ${file.path}`)
  const content = Buffer.from(await Bun.file(absolute).arrayBuffer())
  const blob = await api("POST", `/repos/${repo}/git/blobs`, {
    content: content.toString("base64"),
    encoding: "base64",
  })
  entries.push({ path: file.path, mode: file.mode, type: "blob", sha: blob.sha })
}
for (const file of deleted) entries.push({ path: file, mode: "100644", type: "blob", sha: null })

const baseTree = remoteCommit?.tree.sha
const newTree = await api("POST", `/repos/${repo}/git/trees`, {
  ...(baseTree ? { base_tree: baseTree } : {}),
  tree: entries,
})
if (newTree.sha !== tree) throw new Error(`tree mismatch: api ${newTree.sha} vs local ${tree}`)
console.log(`tree ${newTree.sha} matches local`)

const created = await api("POST", `/repos/${repo}/git/commits`, {
  message,
  tree: newTree.sha,
  parents: parent && remoteHead ? [remoteHead] : [],
  author: { name: an, email: ae, date: isoFromRaw(ad) },
  committer: { name: cn, email: ce, date: isoFromRaw(cd) },
})
console.log(`stored commit ${created.sha}${created.sha === head ? " (matches local)" : " (differs from local)"}`)
if (created.sha !== head) console.log(alignLocal(created, parent && remoteHead ? remoteHead : ""))
if (created.sha !== head && git(["rev-parse", "HEAD"]) !== created.sha) {
  console.error("local history does not match the stored commit; aborting before moving the branch")
  process.exit(1)
}

if (remoteHead) {
  await api("PATCH", `/repos/${repo}/git/refs/heads/${branchName}`, {
    sha: created.sha,
    force: process.env.OC_FORCE === "1",
  })
} else {
  await api("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branchName}`, sha: created.sha })
}
console.log(`pushed ${branchName} -> https://github.com/${repo}/commit/${created.sha}`)
console.log(`local HEAD is now ${git(["rev-parse", "HEAD"])}`)
