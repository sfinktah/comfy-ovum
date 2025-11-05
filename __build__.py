#!/usr/bin/env python3

import subprocess
import os
from shutil import rmtree, copytree, ignore_patterns
from glob import glob
import time
import re
import argparse

# Import/from path prefixes that should be ignored by the build rewriter.
# Any import specifier starting with one of these prefixes will be left unchanged.
IMPORT_IGNORE_PREFIXES = [
    'xtippy',
    'x@pop',
]


def ignore_with_dot(*patterns):
    """Return an ignore function that combines ignore_patterns with ignoring dotfiles/dirs.
    This ensures shutil.copytree will skip any files or directories starting with '.'
    and will not recurse into such directories.
    """
    base_ignore = ignore_patterns(*patterns)

    def _ignore(dir, names):  # pylint: disable=unused-argument
        ignored = set(base_ignore(dir, names))
        # Add all entries that start with '.'
        ignored.update({name for name in names if name.startswith('.')})
        return ignored

    return _ignore

COLORS = {
    'BLACK': '\33[30m',
    'RED': '\33[31m',
    'GREEN': '\33[32m',
    'YELLOW': '\33[33m',
    'BLUE': '\33[34m',
    'MAGENTA': '\33[35m',
    'CYAN': '\33[36m',
    'WHITE': '\33[37m',
    'GREY': '\33[90m',
    'BRIGHT_RED': '\33[91m',
    'BRIGHT_GREEN': '\33[92m',
    'BRIGHT_YELLOW': '\33[93m',
    'BRIGHT_BLUE': '\33[94m',
    'BRIGHT_MAGENTA': '\33[95m',
    'BRIGHT_CYAN': '\33[96m',
    'BRIGHT_WHITE': '\33[97m',
    # Styles.
    'RESET': '\33[0m',  # Note, Portainer doesn't like 00 here, so we'll use 0. Should be fine...
    'BOLD': '\33[01m',
    'NORMAL': '\33[22m',
    'ITALIC': '\33[03m',
    'UNDERLINE': '\33[04m',
    'BLINK': '\33[05m',
    'BLINK2': '\33[06m',
    'SELECTED': '\33[07m',
    # Backgrounds
    'BG_BLACK': '\33[40m',
    'BG_RED': '\33[41m',
    'BG_GREEN': '\33[42m',
    'BG_YELLOW': '\33[43m',
    'BG_BLUE': '\33[44m',
    'BG_MAGENTA': '\33[45m',
    'BG_CYAN': '\33[46m',
    'BG_WHITE': '\33[47m',
    'BG_GREY': '\33[100m',
    'BG_BRIGHT_RED': '\33[101m',
    'BG_BRIGHT_GREEN': '\33[102m',
    'BG_BRIGHT_YELLOW': '\33[103m',
    'BG_BRIGHT_BLUE': '\33[104m',
    'BG_BRIGHT_MAGENTA': '\33[105m',
    'BG_BRIGHT_CYAN': '\33[106m',
    'BG_BRIGHT_WHITE': '\33[107m',
}


def log_node_success(node_name, message, msg_color='RESET'):
    """Logs a success message."""
    _log_node("BRIGHT_GREEN", node_name, message, msg_color=msg_color)


def log_node_info(node_name, message, msg_color='RESET'):
    """Logs an info message."""
    _log_node("CYAN", node_name, message, msg_color=msg_color)


def log_node_error(node_name, message, msg_color='RESET'):
    """Logs an info message."""
    _log_node("RED", node_name, message, msg_color=msg_color)


def log_node_warn(node_name, message, msg_color='RESET'):
    """Logs an warn message."""
    _log_node("YELLOW", node_name, message, msg_color=msg_color)


def log_node(node_name, message, msg_color='RESET'):
    """Logs a message."""
    _log_node("CYAN", node_name, message, msg_color=msg_color)


def _log_node(color, node_name, message, msg_color='RESET'):
    """Logs for a node message."""
    log(message, color=color, prefix=node_name.replace(" (rgthree)", ""), msg_color=msg_color)


def log(message, color=None, msg_color=None, prefix=None):
    """Basic logging."""
    color = COLORS[color] if color is not None and color in COLORS else COLORS["BRIGHT_GREEN"]
    msg_color = COLORS[msg_color] if msg_color is not None and msg_color in COLORS else ''
    prefix = f'[{prefix}]' if prefix is not None else ''
    msg = f'{color}[{NAME}]{prefix}'
    msg += f'{msg_color} {message}{COLORS["RESET"]}'
    print(msg)

step_msg = ''
step_start = 0
step_infos = []

def log_step(msg=None, status=None):
    """ Logs a step keeping track of timing and initial msg. """
    global step_msg  # pylint: disable=W0601
    global step_start  # pylint: disable=W0601
    global step_infos  # pylint: disable=W0601
    if msg:
        tag = f'{COLORS["YELLOW"]}[ Notice ]' if status == 'Notice' else f'{COLORS["RESET"]}[Starting]'
        step_msg = f'▻ {tag}{COLORS["RESET"]} {msg}...'
        step_start = time.time()
        step_infos = []
        print(step_msg, end="\r")
    elif status:
        if status != 'Error':
            warnings = [w for w in step_infos if w["type"] == 'warn']
            status = "Warn" if warnings else status
        step_time = round(time.time() - step_start, 3)
        if status == 'Error':
            status_msg = f'{COLORS["RED"]}⤫ {status}{COLORS["RESET"]}'
        elif status == 'Warn':
            status_msg = f'{COLORS["YELLOW"]}! {status}{COLORS["RESET"]}'
        else:
            status_msg = f'{COLORS["BRIGHT_GREEN"]}🗸 {status}{COLORS["RESET"]}'
        print(f'{step_msg.ljust(64, ".")} {status_msg} ({step_time}s)')
        for info in step_infos:
            print(info["msg"])

def log_step_info(msg:str, status='info'):
    global step_infos  # pylint: disable=W0601
    step_infos.append({"msg": f'  - {msg}', "type": status})


def build(without_tests = True, fix = False, quiet_tsc: bool = False):

    THIS_DIR = os.path.dirname(os.path.abspath(__file__))
    DIR_SRC_WEB = os.path.abspath(os.path.join(THIS_DIR, 'src_js'))
    DIR_WEB = os.path.abspath(os.path.join(THIS_DIR, 'js'))
    DIR_WEB_COMFYUI = os.path.abspath(os.path.join(DIR_WEB, 'comfyui'))
    DIST_WEB = os.path.join('/ovum', 'web', 'dist', 'node_modules').replace('\\', '/')
    
    log_step(msg='Copying web directory')
    try:
        rmtree(DIR_WEB, ignore_errors=True)
        copytree(DIR_SRC_WEB, DIR_WEB, ignore=ignore_with_dot("typings*", "*.ts", "*.scss"))
        log_step(status="Done")
    except Exception as e:
        log_step_info(f'Error copying web directory: {e}', 'warn')
        log_step(status="Error")
        raise

    if not without_tests:
        log_step(msg='Removing directories (KEEPING TESTING)', status="Notice")
    else:
        log_step(msg='Removing unneeded directories')
        test_path = os.path.join(DIR_WEB, 'comfyui', 'tests')
        rmtree(test_path, ignore_errors=True)
        testing_path = os.path.join(DIR_WEB, 'comfyui', 'testing')
        rmtree(testing_path, ignore_errors=True)
    # Always remove the dummy scripts_comfy directory
    scripts_comfy_path = os.path.join(DIR_WEB, 'scripts_comfy')
    rmtree(scripts_comfy_path, ignore_errors=True)
    log_step(status="Done")

    # Handle the common directories. Because ComfyUI loads under /extensions/rgthree-comfy we can't
    # easily share sources outside of the `DIR_WEB_COMFYUI` _and_ allow typescript to resolve them in
    # src view, so we set the path in the tsconfig to map an import of "rgthree/common" to the
    # "src_js/common" directory, but then need to rewrite the comfyui JS files to load from
    # "../../rgthree/common" (which we map correctly in rgthree_server.py).
    log_step(msg='Cleaning Imports')
    # Collect .js files while ignoring any directories or files starting with '.'
    js_files = []
    for root, dirs, files in os.walk(DIR_WEB):
        # Do not recurse into dot-directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for name in files:
            # Skip dot-files
            if name.startswith('.'):
                continue
            if name.lower().endswith('.js'):
                js_files.append(os.path.join(root, name))

    for file in js_files:
        try:
            with open(file, 'r', encoding="utf-8") as f:
                filedata = f.read()

            # Build ignored prefixes pattern for bare specifiers we should not rewrite (e.g., tippy, @pop)
            ignored_pattern = '|'.join(re.escape(p) for p in IMPORT_IGNORE_PREFIXES) or '$a'

            # Replace imports using an ignore list and path normalization
            def _rewrite_spec(spec: str) -> str:
                for pref in IMPORT_IGNORE_PREFIXES:
                    if spec.startswith(pref):
                        return spec
                # Prepend '/ovum/web/' to bare specifiers (not starting with '/' or '.')
                if not (spec.startswith('/') or spec.startswith('.')):
                    spec = os.path.join(DIST_WEB, spec).replace('\\', '/')
                # Append '.js' if missing for path-like imports
                if not spec.endswith('.js') and (
                    spec.startswith(DIST_WEB) or spec.startswith('./') or spec.startswith('../') or spec.startswith('/')
                ):
                    spec = spec + '.js'
                return spec

            # 1) from "spec"
            filedata = re.sub(r'(\bfrom\s+[\'\"])([^\'\"]+)([\'\"])', lambda m: m.group(1) + _rewrite_spec(m.group(2)) + m.group(3), filedata)
            # 2) dynamic import("spec")
            filedata = re.sub(r'(\bimport\(\s*[\'\"])([^\'\"]+)([\'\"]\s*\))', lambda m: m.group(1) + _rewrite_spec(m.group(2)) + m.group(3), filedata)
            # 3) side-effect import "spec"
            filedata = re.sub(r'(\bimport\s+[\'\"])([^\'\"]+)([\'\"])', lambda m: m.group(1) + _rewrite_spec(m.group(2)) + m.group(3), filedata)

            with open(file, 'w', encoding="utf-8") as f:
                f.write(filedata)
        except Exception as e:
            log_step_info(f'Failed processing JS file {file}: {e}', 'warn')
            log_step(status="Error")
            raise
    log_step(status="Done")

    # Post-build cleanup of unnecessary directories
    log_step(msg='Removing post-build directories')
    try:
        dirs_to_remove = [
            os.path.join(THIS_DIR, 'js', 'vendor'),
            os.path.join(THIS_DIR, 'web', 'dist', 'node_modules', '@comfyorg'),
            os.path.join(THIS_DIR, 'web', 'dist', 'node_modules', '@popperjs'),
            os.path.join(THIS_DIR, 'web', 'dist', 'node_modules', 'tippy.js'),
        ]
        for d in dirs_to_remove:
            rmtree(d, ignore_errors=True)
        log_step(status='Done')
    except Exception as e:
        log_step_info(f'Error removing post-build directories: {e}', 'warn')
        log_step(status='Error')
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-t", "--no-tests", default=False, action="store_true", help="Do not remove test directories from web output")
    parser.add_argument("-f", "--fix", default=False, action="store_true", help="Auto-fix .ts import statements to end with .js")
    parser.add_argument("-q", "--quiet-tsc", default=False, action="store_true", help="Suppress tsc warnings and errors output")
    args = parser.parse_args()

    start = time.time()
    build(without_tests=args.no_tests, fix=args.fix, quiet_tsc=args.quiet_tsc)
    print(f'Finished all in {round(time.time() - start, 3)}s')
