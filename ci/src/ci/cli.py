"""Repo-internal CI gate CLI (``ci``): one subcommand per gate.

Never published — this package exists so CI logic is real, tested source
instead of inline workflow YAML. Workflows and the justfile invoke it as
one-line wiring, e.g. ``uv run --project ci ci check-changelog``. The bright
line for what must live here is in ``docs/internals/repo.md``.
"""

from __future__ import annotations

import argparse
import sys

from ci import bootstrap_npm, check_changelog, lint_workflow_scripts


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ci",
        description="Repo-internal CI gates; one subcommand per gate.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser(
        "check-changelog",
        help="Enforce that package changes add a changelog fragment "
        "(reads BASE_SHA / HEAD_SHA from the environment).",
    )
    check.set_defaults(entry=check_changelog.run)

    lint = sub.add_parser(
        "lint-workflow-scripts",
        help="Fail on non-trivial inline scripts in workflow / action YAML.",
    )
    lint.add_argument(
        "paths",
        nargs="*",
        help="YAML files to scan (default: .github/workflows/ and "
        ".github/actions/ relative to the current directory — run from the "
        "repo root).",
    )
    lint.set_defaults(entry=lint_workflow_scripts.run)

    bootstrap = sub.add_parser(
        "bootstrap-npm",
        help="Publish 0.0.0-bootstrap npm stubs "
        "(reads PACKAGES from the environment).",
    )
    bootstrap.set_defaults(entry=bootstrap_npm.run)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    return args.entry(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
