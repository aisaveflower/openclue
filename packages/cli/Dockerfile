FROM alpine AS base

ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add --no-cache libgcc libstdc++ ripgrep

FROM base AS build-amd64
COPY dist/openclue-linux-x64-baseline-musl/bin/openclue /usr/local/bin/openclue

FROM base AS build-arm64
COPY dist/openclue-linux-arm64-musl/bin/openclue /usr/local/bin/openclue

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN openclue --version
ENTRYPOINT ["opencode"]
