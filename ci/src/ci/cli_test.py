"""Tests for the ``ci`` subcommand dispatcher."""

import pytest

from ci import cli


def test_check_changelog_dispatches_and_propagates_exit_code(monkeypatch):
    monkeypatch.setattr(cli.check_changelog, "main", lambda: 3)
    assert cli.main(["check-changelog"]) == 3


def test_lint_workflow_scripts_forwards_paths(monkeypatch):
    seen = {}

    def fake_main(argv):
        seen["argv"] = argv
        return 0

    monkeypatch.setattr(cli.lint_workflow_scripts, "main", fake_main)
    assert cli.main(["lint-workflow-scripts", "a.yml", "b.yml"]) == 0
    assert seen["argv"] == ["a.yml", "b.yml"]


def test_lint_workflow_scripts_defaults_to_empty_argv(monkeypatch):
    # An empty argv makes the gate fall back to its default glob paths.
    monkeypatch.setattr(cli.lint_workflow_scripts, "main", lambda argv: len(argv))
    assert cli.main(["lint-workflow-scripts"]) == 0


def test_bootstrap_npm_dispatches_and_propagates_exit_code(monkeypatch):
    monkeypatch.setattr(cli.bootstrap_npm, "main", lambda: 1)
    assert cli.main(["bootstrap-npm"]) == 1


def test_unknown_subcommand_is_a_usage_error():
    with pytest.raises(SystemExit) as exc:
        cli.main(["no-such-gate"])
    assert exc.value.code == 2
