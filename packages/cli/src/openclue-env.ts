// OpenClue owns the OPENCLUE_* namespace while retaining compatibility with
// inherited OpenCode internals. Explicit OPENCODE_* values still win.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("OPENCLUE_") || value === undefined) continue
  const inherited = `OPENCODE_${name.slice("OPENCLUE_".length)}`
  process.env[inherited] ??= value
}
