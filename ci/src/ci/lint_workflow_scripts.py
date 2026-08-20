"""Gate: no non-trivial scripts encoded in GitHub Actions YAML.

``run:`` and ``actions/github-script`` blocks should be trivial glue — a few
straight-line commands, or a lone guard around an early exit. Anything with
iteration, multi-branch dispatch, or text-munging belongs in this repo-internal
``ci`` CLI (a subcommand with a colocated test) invoked as a one-line ``run:``.
Rationale and the full bright line live in ``docs/internals/repo.md``. Invoked
as ``ci lint-workflow-scripts``.

This is a pragmatic scanner, not a shell parser: it flags the high-signal
markers of "this is a program" and tolerates straight-line glue. It favors
precision over recall — when a borderline body slips through, extract it anyway;
an extracted script is always testable. Run from the repository root.
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
from typing import NamedTuple

import yaml

# Straight-line bodies longer than this must be extracted, even branch-free.
MAX_GLUE_LINES = 12

# Iteration / dispatch / text-munging at a command position = real logic.
_LOGIC_MARKERS = {
    "for loop": re.compile(r"(?m)^\s*for\b"),
    "while loop": re.compile(r"(?m)^\s*while\b"),
    "until loop": re.compile(r"(?m)^\s*until\b"),
    "select loop": re.compile(r"(?m)^\s*select\b"),
    "case dispatch": re.compile(r"(?m)^\s*case\b"),
    "awk": re.compile(r"(?:^|\||;|&&|\$\()\s*awk\b"),
    "sed": re.compile(r"(?:^|\||;|&&|\$\()\s*sed\b"),
}


class Violation(NamedTuple):
    path: str
    step: str
    kind: str
    reasons: list[str]


def _significant_lines(body: str) -> list[str]:
    """Body lines excluding blanks, comments, and the ``set -…`` prologue."""
    keep = []
    for raw in body.splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and not line.startswith("set -"):
            keep.append(line)
    return keep


def flag_reasons(body: str) -> list[str]:
    """Why ``body`` is too complex to live inline (empty list = fine)."""
    reasons = [name for name, pat in _LOGIC_MARKERS.items() if pat.search(body)]
    count = len(_significant_lines(body))
    if count > MAX_GLUE_LINES:
        reasons.append(f"{count} lines (> {MAX_GLUE_LINES})")
    return reasons


def _steps(doc: object):
    """Yield every step mapping from a workflow or composite-action doc."""
    if not isinstance(doc, dict):
        return
    jobs = doc.get("jobs")
    if isinstance(jobs, dict):
        for job in jobs.values():
            if isinstance(job, dict):
                yield from (s for s in (job.get("steps") or []) if isinstance(s, dict))
    runs = doc.get("runs")  # composite action.yml
    if isinstance(runs, dict):
        yield from (s for s in (runs.get("steps") or []) if isinstance(s, dict))


def _bodies(step: dict):
    """Yield ``(kind, body)`` for each shell/script body in a step."""
    run = step.get("run")
    if isinstance(run, str):
        yield "run", run
    uses = step.get("uses")
    if isinstance(uses, str) and uses.startswith("actions/github-script"):
        script = (step.get("with") or {}).get("script")
        if isinstance(script, str):
            yield "github-script", script


def find_violations(yaml_text: str, path: str) -> list[Violation]:
    """All inline-script violations in one workflow/action document."""
    doc = yaml.safe_load(yaml_text)
    violations = []
    for step in _steps(doc):
        label = step.get("name") or step.get("uses") or "<unnamed step>"
        for kind, body in _bodies(step):
            reasons = flag_reasons(body)
            if reasons:
                violations.append(Violation(path, label, kind, reasons))
    return violations


def scan(paths: list[str]) -> list[Violation]:
    violations = []
    for path in sorted(paths):
        with open(path, encoding="utf-8") as fh:
            violations.extend(find_violations(fh.read(), path))
    return violations


def _default_paths() -> list[str]:
    return [
        *glob.glob(".github/workflows/*.yml"),
        *glob.glob(".github/workflows/*.yaml"),
        *glob.glob(".github/actions/**/action.yml", recursive=True),
        *glob.glob(".github/actions/**/action.yaml", recursive=True),
    ]


def main(argv: list[str]) -> int:
    violations = scan(argv or _default_paths())
    for v in violations:
        print(
            f"::error file={v.path}::{v.kind} step '{v.step}' encodes logic inline "
            f"({'; '.join(v.reasons)}). Move it into a subcommand of the internal "
            f"CLI at ci/ (with a colocated test) invoked as a one-line `run:`. "
            f"See docs/internals/repo.md."
        )
    if violations:
        print(f"\n{len(violations)} inline-script violation(s).", file=sys.stderr)
        return 1
    print("No inline-script violations.")
    return 0


def run(args: argparse.Namespace) -> int:
    """Entry point for ``ci lint-workflow-scripts``; same semantics as ``main()``."""
    return main(args.paths)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
