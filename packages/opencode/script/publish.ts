#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

// Published npm identity: the wrapper package users install, and the command it
// installs. Platform packages are named by script/build.ts.
const npmName = "openclue"

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

async function publish(dir: string, name: string, version: string) {
  // GitHub artifact downloads can drop the executable bit, and Docker uses the
  // unpacked dist binaries directly rather than the published tarball.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  // Lets a release be inspected (package name, bin, bundled files) without credentials.
  if (process.env.OPENCLUE_PUBLISH_DRY_RUN === "1") {
    const packed = await $`bun pm pack --dry-run`.cwd(dir).nothrow()
    console.log(`dry run ${name}@${version}\n${packed.stdout.toString()}`)
    return
  }
  await $`bun pm pack`.cwd(dir)
  // npm stage publish uploads the version for a maintainer to approve with 2FA,
  // which is the only way to publish with a stage-only token.
  const verb = process.env.OPENCLUE_PUBLISH_MODE === "stage" ? ["stage", "publish"] : ["publish"]
  await $`npm ${verb} *.tgz --access public --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const pkg = await Bun.file(`./dist/${filepath}`).json()
  // dist/<npmName> is the wrapper package this script writes below, not a platform package.
  if (pkg.name === npmName) continue
  binaries[pkg.name] = pkg.version
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]

await $`mkdir -p ./dist/${npmName}`
await $`mkdir -p ./dist/${npmName}/bin`
await $`cp ./script/postinstall.mjs ./dist/${npmName}/postinstall.mjs`
await Bun.file(`./dist/${npmName}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`./dist/${npmName}/bin/${npmName}.exe`).write(
  [
    `echo "Error: ${npmName}'s postinstall script was not run." >&2`,
    'echo "" >&2',
    'echo "This occurs when using --ignore-scripts during installation, or when using a" >&2',
    'echo "package manager like pnpm that does not run postinstall scripts by default." >&2',
    'echo "" >&2',
    'echo "To fix this, run the postinstall script manually:" >&2',
    `echo "  cd node_modules/${npmName} && node postinstall.mjs" >&2`,
    'echo "" >&2',
    `echo "Or reinstall ${npmName} without the --ignore-scripts flag." >&2`,
    "exit 1",
    "",
  ].join("\n"),
)

await Bun.file(`./dist/${npmName}/package.json`).write(
  JSON.stringify(
    {
      name: npmName,
      bin: {
        [npmName]: `./bin/${npmName}.exe`,
      },
      scripts: {
        postinstall: "node ./postinstall.mjs",
      },
      version: version,
      license: pkg.license,
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

const tasks = Object.entries(binaries).map(async ([name]) => {
  await publish(`./dist/${name}`, name, binaries[name])
})
await Promise.all(tasks)
await publish(`./dist/${npmName}`, `${npmName}`, version)

const image = "ghcr.io/aisaveflower/openclue"
const platforms = "linux/amd64,linux/arm64"
const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
const tagFlags = tags.flatMap((t) => ["-t", t])

// registries
// Beyond npm: the container image, the AUR package, and the Homebrew formula need
// their own credentials and hosting, so they are opt-in for this fork.
const registries = !Script.preview && process.env.OPENCLUE_PUBLISH_DISTRIBUTION === "1"
if (registries) {
  await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`
  // Calculate SHA values
  const arm64Sha = await $`sha256sum ./dist/openclue-linux-arm64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const x64Sha = await $`sha256sum ./dist/openclue-linux-x64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const macX64Sha = await $`sha256sum ./dist/openclue-darwin-x64.zip | cut -d' ' -f1`.text().then((x) => x.trim())
  const macArm64Sha = await $`sha256sum ./dist/openclue-darwin-arm64.zip | cut -d' ' -f1`.text().then((x) => x.trim())

  const [pkgver, _subver = ""] = Script.version.split(/(-.*)/, 2)

  // arch
  const binaryPkgbuild = [
    "# Maintainer: dax",
    "# Maintainer: adam",
    "",
    "pkgname='openclue-bin'",
    `pkgver=${pkgver}`,
    `_subver=${_subver}`,
    "options=('!debug' '!strip')",
    "pkgrel=1",
    "pkgdesc='The AI coding agent built for the terminal.'",
    "url='https://github.com/aisaveflower/openclue'",
    "arch=('aarch64' 'x86_64')",
    "license=('MIT')",
    "provides=('openclue')",
    "conflicts=('openclue')",
    "depends=('ripgrep')",
    "",
    `source_aarch64=("\${pkgname}_\${pkgver}_aarch64.tar.gz::https://github.com/aisaveflower/openclue/releases/download/v\${pkgver}\${_subver}/openclue-linux-arm64.tar.gz")`,
    `sha256sums_aarch64=('${arm64Sha}')`,

    `source_x86_64=("\${pkgname}_\${pkgver}_x86_64.tar.gz::https://github.com/aisaveflower/openclue/releases/download/v\${pkgver}\${_subver}/openclue-linux-x64.tar.gz")`,
    `sha256sums_x86_64=('${x64Sha}')`,
    "",
    "package() {",
    '  install -Dm755 ./openclue "${pkgdir}/usr/bin/openclue"',
    "}",
    "",
  ].join("\n")

  for (const [pkg, pkgbuild] of [["openclue-bin", binaryPkgbuild]]) {
    for (let i = 0; i < 30; i++) {
      try {
        await $`rm -rf ./dist/aur-${pkg}`
        await $`git clone ssh://aur@aur.archlinux.org/${pkg}.git ./dist/aur-${pkg}`
        await $`cd ./dist/aur-${pkg} && git checkout master`
        await Bun.file(`./dist/aur-${pkg}/PKGBUILD`).write(pkgbuild)
        await $`cd ./dist/aur-${pkg} && makepkg --printsrcinfo > .SRCINFO`
        await $`cd ./dist/aur-${pkg} && git add PKGBUILD .SRCINFO`
        if ((await $`cd ./dist/aur-${pkg} && git diff --cached --quiet`.nothrow()).exitCode === 0) break
        await $`cd ./dist/aur-${pkg} && git commit -m "Update to v${Script.version}"`
        await $`cd ./dist/aur-${pkg} && git push`
        break
      } catch {
        continue
      }
    }
  }

  // Homebrew formula
  const homebrewFormula = [
    "# typed: false",
    "# frozen_string_literal: true",
    "",
    "# This file was generated by GoReleaser. DO NOT EDIT.",
    "class Openclue < Formula",
    `  desc "The AI coding agent built for the terminal."`,
    `  homepage "https://github.com/aisaveflower/openclue"`,
    `  version "${Script.version.split("-")[0]}"`,
    "",
    `  depends_on "ripgrep"`,
    "",
    "  on_macos do",
    "    if Hardware::CPU.intel?",
    `      url "https://github.com/aisaveflower/openclue/releases/download/v${Script.version}/openclue-darwin-x64.zip"`,
    `      sha256 "${macX64Sha}"`,
    "",
    "      def install",
    '        bin.install "openclue"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm?",
    `      url "https://github.com/aisaveflower/openclue/releases/download/v${Script.version}/openclue-darwin-arm64.zip"`,
    `      sha256 "${macArm64Sha}"`,
    "",
    "      def install",
    '        bin.install "openclue"',
    "      end",
    "    end",
    "  end",
    "",
    "  on_linux do",
    "    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/aisaveflower/openclue/releases/download/v${Script.version}/openclue-linux-x64.tar.gz"`,
    `      sha256 "${x64Sha}"`,
    "      def install",
    '        bin.install "openclue"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/aisaveflower/openclue/releases/download/v${Script.version}/openclue-linux-arm64.tar.gz"`,
    `      sha256 "${arm64Sha}"`,
    "      def install",
    '        bin.install "openclue"',
    "      end",
    "    end",
    "  end",
    "end",
    "",
    "",
  ].join("\n")

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error("GITHUB_TOKEN is required to update homebrew tap")
    process.exit(1)
  }
  const tap = `https://x-access-token:${token}@github.com/aisaveflower/homebrew-tap.git`
  await $`rm -rf ./dist/homebrew-tap`
  await $`git clone ${tap} ./dist/homebrew-tap`
  await Bun.file("./dist/homebrew-tap/openclue.rb").write(homebrewFormula)
  await $`cd ./dist/homebrew-tap && git add openclue.rb`
  if ((await $`cd ./dist/homebrew-tap && git diff --cached --quiet`.nothrow()).exitCode !== 0) {
    await $`cd ./dist/homebrew-tap && git commit -m "Update to v${Script.version}"`
    await $`cd ./dist/homebrew-tap && git push`
  }
}
