declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

// The published identity of this build: the CLI command, the npm package, and the
// package-manager formula name all use it.
export const InstallationName = "openclue"
export const InstallationRepository = "aisaveflower/openclue"

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
