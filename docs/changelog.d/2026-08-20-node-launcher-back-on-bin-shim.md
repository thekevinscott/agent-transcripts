**Changed** — the npm launcher resolves the platform binary through `bin-shim`
again, rather than the hand-rolled copy #4 introduced. That copy existed only
because `bin-shim` hardcoded a `bin/` path segment and could not see a binary
staged flat at the platform-package root; `bin-shim@0.2.1` added `binaryDir`,
so the layout is now expressible (`binaryDir: ''`). No install-time or runtime
behavior changes, and the not-installed message gets slightly more specific.
