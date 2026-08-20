"""Tests for the inline-script gate."""

from ci.lint_workflow_scripts import find_violations, flag_reasons

CLEAN = """
jobs:
  build:
    steps:
      - run: pnpm install --no-frozen-lockfile
      - name: Stage binary
        run: |
          pkg=@x/linux
          target=node_modules/$pkg
          mkdir -p "$target/bin"
          install -m 755 bin/x "$target/bin/x"
"""

LOOP = """
jobs:
  publish:
    steps:
      - name: Publish stubs
        run: |
          for name in $NAMES; do
            npm publish "$name"
          done
"""

GUARD = """
jobs:
  preflight:
    steps:
      - name: Visibility check
        run: |
          set -euo pipefail
          private=$(gh api repos/x --jq .private)
          if [ "$private" = "true" ]; then
            echo "::error::private"
            exit 1
          fi
          echo "ok"
"""

GH_SCRIPT_LOOP = """
jobs:
  label:
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            for (const item of items) {
              core.info(item)
            }
"""


def test_clean_straight_line_glue_passes():
    assert find_violations(CLEAN, "w.yml") == []


def test_lone_guard_is_allowed():
    # A single if-guard with no iteration and few lines is glue, not a program.
    assert find_violations(GUARD, "w.yml") == []


def test_for_loop_is_flagged():
    violations = find_violations(LOOP, "w.yml")
    assert len(violations) == 1
    assert violations[0].step == "Publish stubs"
    assert "for loop" in violations[0].reasons


def test_github_script_loop_is_flagged():
    violations = find_violations(GH_SCRIPT_LOOP, "w.yml")
    assert len(violations) == 1
    assert violations[0].kind == "github-script"
    assert "for loop" in violations[0].reasons


def test_awk_is_flagged():
    assert "awk" in flag_reasons("echo x | awk -F/ '{print $2}'")


def test_sed_pipeline_is_flagged():
    assert "sed" in flag_reasons("cat f | sed 's/a/b/'")


def test_word_boundary_avoids_false_positives():
    # "before" / "format" must not trip the for/case markers.
    assert flag_reasons("before_hook\nformat_output\ncasements=3") == []


def test_long_straight_line_block_is_flagged():
    # 15 straight-line commands: no logic markers, but past the glue threshold.
    body = "\n".join(f"cmd{i}" for i in range(15))
    assert any("lines" in r for r in flag_reasons(body))


def test_prologue_and_comments_are_not_counted():
    assert flag_reasons("set -euo pipefail\n# a note\n\necho hi") == []
