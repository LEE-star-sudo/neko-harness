# Bun migration verification

## Environment and dependency integrity

- macOS arm64; Bun 1.4.2; original Node baseline v24.15.0.
- Migrated the existing npm lock before changing dependencies. All existing package names retain versions present in the original dependency tree; workspace placement/deduplication can differ. All Pi packages remain 1.1.0. Added @types/bun 1.4.2 and its required types; removed tsx/Vitest.
- Clean `bun install --frozen-lockfile`: 164 installed packages, with `trustedDependencies: []`; no dependency lifecycle scripts required. Lockfile unchanged after verification.
- A separate temporary checkout used PATH containing only the fixed Bun executable plus /usr/bin and /bin. Verified those directories contained no node/npm/npx/tsx executable. All install/test/check/build commands below succeeded there.

## Automated checks

| Check | Result |
| --- | --- |
| Original `npm test` baseline | 34 passed across 14 files |
| `bun run test` on fresh install, before build | 38 passed across 15 files; 148 assertions |
| `bun run build` without existing dist | All five workspaces and Vite build passed |
| `bun run check` | Biome, root types, Web client types passed |
| `git diff --check` | Passed |
| SQLite Node → Bun → Node fixture | Original submission id 8 retained; Bun appended id 13; Node reopened with two user entries, no duplicate requestId |
| Built runtime write/edit/read/bash tools under Bun-only PATH | All four succeeded with faux provider and temporary files |

Gateway tests require local Unix socket/TCP listeners. Sandbox-only baseline initially failed with EPERM; rerunning with local-listener permissions passed. These were environment failures, not waived assertions.

Bun's isolated test environment did not make an in-test HOME assignment visible to os.homedir. The home-config test now creates a fresh subprocess with an isolated HOME and retains absent/present config assertions. Application config semantics are unchanged.

## Source and compiled startup

- New integration tests cover TUI owned gateway startup/reuse/close, Web Bun executable and argument forwarding, WebSocket reconnect, startup timeout cleanup, and missing-credential failure.
- Separate smoke checks ran CLI serve, Unix/WS handshakes, Web HTTP index and generated JS asset requests, TUI reuse/spawn, and child/socket cleanup in both source and compiled modes.
- For compiled checks, all five package src directories were moved outside the temporary checkout; no source conditions were enabled. The checks still passed without Node/tsx.
- CLI source and compiled help/argument forwarding passed. After a post-build frozen install, the local `neko` bin link also passed. README documents the link step for cold installs without dist.
- Real PTY: submitted `hello bun`, observed faux response `Bun TTY verified`, resized from 80x24 to 100x30, then exited with Ctrl-C. Verified `process.stdin.isRaw === false` after return.
- Existing protocol tests verify multi-frontend state synchronization, stream delivery, attach idempotency and disconnect recovery. HTTP/assets and protocol were exercised programmatically; no separate browser visual review was performed.

## Limits and scope

- No real model API was called. Model behavior used faux provider; child startup checks used an inert test credential and made no model requests.
- Vite emits its existing >500 kB chunk-size advisory; build succeeds. Bundle splitting is outside this migration.
- No database schema, Pi dependency implementation, real user data, reference checkout, or historical OpenSpec archive changed. Existing Web HTTP/gateway topology is preserved; its historical spec discrepancy is recorded in proposal/design.
- No commit or archive performed. Temporary fixtures and smoke scripts are outside the repository.
