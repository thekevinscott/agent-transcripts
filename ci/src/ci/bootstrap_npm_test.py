"""Tests for the npm bootstrap-stub publisher."""

import json
from pathlib import Path

from ci.bootstrap_npm import parse_packages, publish, stub_package_json


def test_parse_splits_and_trims_spaces():
    assert parse_packages("a, b ,c") == ["a", "b", "c"]


def test_parse_removes_internal_spaces():
    assert parse_packages("@scope/ name") == ["@scope/name"]


def test_parse_ignores_empty_entries():
    assert parse_packages("a,,b,") == ["a", "b"]
    assert parse_packages("") == []
    assert parse_packages("  ,  ") == []


def test_stub_package_json_shape():
    body = json.loads(stub_package_json("@agent-transcripts/core"))
    assert body["name"] == "@agent-transcripts/core"
    assert body["version"] == "0.0.0-bootstrap"
    assert body["license"] == "MIT"
    assert body["repository"]["type"] == "git"


def test_publish_writes_manifest_and_invokes_npm():
    calls = []

    def fake_runner(cmd, cwd, check):
        # The manifest must exist in the publish dir at invocation time.
        assert (Path(cwd) / "package.json").exists()
        calls.append((cmd, check))

    publish("@agent-transcripts/x", runner=fake_runner)

    assert calls == [
        (["npm", "publish", "--access", "public", "--tag", "bootstrap"], True)
    ]
