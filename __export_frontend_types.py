#!/usr/bin/env python3
"""
Standalone CLI to export all 'declare' statements in ComfyUI frontend types.

This script mirrors the --export-frontend-types functionality from __build__.py,
modifying node_modules/@comfyorg/comfyui-frontend-types/index.d.ts so that any
line beginning with optional whitespace followed by 'declare ' is prefixed with
'export '.

Usage examples:
  python export_frontend_types.py -i                   # overwrite default types file in-place
  python export_frontend_types.py -o out.d.ts          # write to a new file
  python export_frontend_types.py -o -                 # write to stdout
  python export_frontend_types.py -t path/to/index.d.ts -i

Exit codes:
  0 - Success (changes made or nothing to change)
  2 - Types file not found
  3 - Read error
  4 - Write error
  5 - Argument error
  6 - Unexpected error
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Callable, Tuple


def transform_content(content: str, verbose: bool, log: Callable[[str], None]) -> Tuple[str, int]:
    """Return transformed content and number of replacements.

    Each line that begins with optional whitespace then 'declare ' is prefixed with 'export '.
    When verbose=True, prints one line per replacement like __build__.py: exporting 'declare …'
    """
    def repl(m: re.Match) -> str:
        indent = m.group(1)
        rest = m.group(2)
        if verbose:
            # Match __build__.py wording
            log(f"exporting '{rest}'")
        return f"{indent}export {rest}"

    new_content, n = re.subn(r'^(\s*)(declare .*)', repl, content, flags=re.MULTILINE)
    return new_content, n


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export 'declare' statements in comfyui-frontend-types index.d.ts", add_help=True)
    parser.add_argument(
        "-t",
        "--types-file",
        default=None,
        help=(
            "Path to index.d.ts. Defaults to node_modules/@comfyorg/comfyui-frontend-types/index.d.ts "
            "relative to this repository root."
        ),
    )
    mx = parser.add_mutually_exclusive_group(required=False)
    mx.add_argument("-i", "--inplace", action="store_true", help="Overwrite the types-file in place")
    mx.add_argument("-o", "--output", default=None, help="Write transformed output to this file, or '-' for stdout")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose: print a line for every replacement made")
    parser.add_argument("-q", "--quiet", action="store_true", help="Quiet: print nothing; failures signaled by exit code only")

    args = parser.parse_args(argv)

    # Determine default types file path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_types = os.path.join(
        script_dir,
        'node_modules',
        '@comfyorg',
        'comfyui-frontend-types',
        'index.d.ts',
    )
    types_file = args.types_file or default_types

    # Validate output mode (one of --inplace or --output required)
    if not args.inplace and args.output is None:
        if not args.quiet:
            print("Error: one of --inplace/-i or --output/-o is required", file=sys.stderr)
        return 5  # argument error

    # Helper for logging that respects quiet and routes to stderr (esp. when stdout is used for data)
    def log(msg: str) -> None:
        if not args.quiet:
            print(msg, file=sys.stderr)

    # Read input file
    try:
        if not os.path.exists(types_file):
            # Missing file
            if not args.quiet:
                print(f"Error: types file not found: {types_file}", file=sys.stderr)
            return 2
        with open(types_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        if not args.quiet:
            print(f"Error: types file not found: {types_file}", file=sys.stderr)
        return 2
    except Exception as e:  # read error
        if not args.quiet:
            print(f"Error reading types file '{types_file}': {e}", file=sys.stderr)
        return 3

    # Transform
    new_content, count = transform_content(content, verbose=args.verbose and not args.quiet, log=log)

    # Output writing
    try:
        if args.output is not None and args.output != "-":
            # Write to a separate file
            out_path = args.output
            # Ensure parent directory exists
            out_dir = os.path.dirname(os.path.abspath(out_path))
            if out_dir and not os.path.exists(out_dir):
                os.makedirs(out_dir, exist_ok=True)
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
        elif args.output == "-":
            # Write to stdout only the transformed content; all logs already to stderr
            sys.stdout.write(new_content)
        else:
            # In-place write
            with open(types_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
    except Exception as e:
        # Write error
        if not args.quiet:
            print(f"Error writing output: {e}", file=sys.stderr)
        return 4

    # Summary messages (stderr), unless quiet or stdout content where we still can log to stderr
    if not args.quiet:
        if count == 0:
            log("No 'declare' lines found to export (file may already be exported or has a different format).")
        else:
            log(f"Exported {count} declaration line(s).")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit as e:
        # Let SystemExit pass through
        raise
    except Exception:
        # Unexpected error; honor quiet flag by avoiding extra prints here
        sys.exit(6)
