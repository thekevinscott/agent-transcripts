**Fixed** — Declared `esbuild` under `pnpm.onlyBuiltDependencies`. pnpm 11
exits non-zero on ignored build scripts rather than warning, which failed the
release workflow's npm job at install time with `ERR_PNPM_IGNORED_BUILDS`
before any packaging ran.
