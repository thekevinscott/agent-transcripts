"""Publish ``0.0.0-bootstrap`` stubs for new npm package names.

Lives in the repo-internal ``ci`` CLI (``ci bootstrap-npm``) so the
package-list parsing and stub generation are unit-testable instead of frozen
in an inline shell ``for`` loop. ``.github/workflows/bootstrap-npm.yml``
invokes it as a one-line ``run:`` step with the package list in the
``PACKAGES`` env var.

npm Trusted Publishing binds to an already-published package, so the first
publish of each name needs a classic token (exported by the workflow as
``NODE_AUTH_TOKEN``). This one-shot helper pushes the stub that later real
publishes replace via OIDC.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPOSITORY_URL = "git+https://github.com/thekevinscott/agent-transcripts.git"


def parse_packages(raw: str) -> list[str]:
    """Split a comma-separated list, strip spaces, drop empty entries."""
    return [name.replace(" ", "") for name in raw.split(",") if name.replace(" ", "")]


def stub_package_json(name: str) -> str:
    """The ``0.0.0-bootstrap`` package.json body for ``name``."""
    return json.dumps(
        {
            "name": name,
            "version": "0.0.0-bootstrap",
            "description": (
                "Bootstrap stub; replaced on first real publish via OIDC "
                "trusted publisher."
            ),
            "license": "MIT",
            "repository": {"type": "git", "url": REPOSITORY_URL},
        },
        indent=2,
    )


def publish(name: str, *, runner=subprocess.run) -> None:
    """Write a stub package.json for ``name`` and ``npm publish`` it."""
    with tempfile.TemporaryDirectory() as workdir:
        (Path(workdir) / "package.json").write_text(stub_package_json(name) + "\n")
        # --tag bootstrap: 0.0.0-bootstrap is a prerelease, which npm refuses to
        # publish as `latest`; the real 0.0.1 publish becomes `latest` instead.
        runner(
            ["npm", "publish", "--access", "public", "--tag", "bootstrap"],
            cwd=workdir,
            check=True,
        )


def main() -> int:
    names = parse_packages(os.environ.get("PACKAGES", ""))
    if not names:
        print("::error::No package names given in PACKAGES.", file=sys.stderr)
        return 1
    for name in names:
        print(f"::group::publish 0.0.0-bootstrap for {name}")
        publish(name)
        print("::endgroup::")
    return 0


def run(_args: argparse.Namespace) -> int:
    """Entry point for ``ci bootstrap-npm``; same exit codes as ``main()``."""
    return main()


if __name__ == "__main__":
    raise SystemExit(main())
