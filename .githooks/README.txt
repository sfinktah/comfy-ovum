Git hooks to auto-bump versions on commit (Windows)

This repository includes a post-commit hook that automatically increments the patch version in the following files after every commit and amends the commit to include the change:

- pyproject.toml

How it works
- The hook runs three per-project scripts:
  - tools/auto_bump_version.py
- Each script prints which file changed (if any). The hook stages those files and then runs: git commit --amend --no-edit
- A guard environment variable prevents infinite recursion when the amend triggers hooks again.

Enable the hook (one-time)
- Option A (Windows, easy): Double-click .githooks/enable-hooks.cmd
  - Or run from a terminal at the repo root: .githooks\enable-hooks.cmd
- Option B (manual): From the root of your git repository (the folder that has the .git directory):

  git config core.hooksPath .githooks

Requirements
- Python must be available on PATH (python command).
- Git for Windows will execute .cmd files as hooks.

Disable temporarily
- Use the standard --no-verify flag when committing to skip all hooks:

  git commit -m "message" --no-verify

Troubleshooting
- If versions don't bump:
  1) Verify the hook path is set: git config --get core.hooksPath
  2) Ensure Python is installed and python runs from a terminal.
  3) Confirm the three pyproject.toml files have a version = "X.Y.Z" line within the [project] table.
