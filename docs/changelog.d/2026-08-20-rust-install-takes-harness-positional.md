**Changed** — `install` takes the harness as a positional argument
(`agent-transcripts install claude-code`) rather than a repeatable `--harness`
flag. It is a `ValueEnum` over the harnesses that actually work today —
`claude-code` and `pi` — so an unrecognized name is rejected at parse time
with the valid list, instead of failing later in a runtime lookup.
