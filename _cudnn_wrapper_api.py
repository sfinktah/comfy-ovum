from __future__ import annotations
from aiohttp import web
from nodes import NODE_CLASS_MAPPINGS
from server import PromptServer
import os
import re
# noinspection PyUnresolvedReferences,PyPackageRequirements
import torch

from .cudnn_wrapper import (
    create_cudnn_wrapped_version,
    convert_to_cudnn_wrapped_inplace,
    is_cudnn_wrapped,
)


@PromptServer.instance.routes.post("/ovum/cudnn_wrap_request")
async def ovum_cudnn_wrap_request(request: web.Request):
    try:
        data = await request.post()
        class_key = data.get("type")
        if not class_key:
            return web.json_response({"response": False})
        ok = bool(convert_to_cudnn_wrapped_inplace(class_key))
        if not ok and not is_cudnn_wrapped(class_key):
            ok = create_cudnn_wrapped_version(class_key) is not None
        return web.json_response({"response": ok})
    except Exception:
        return web.json_response({"response": False})


@PromptServer.instance.routes.post("/ovum/cudnn_wrap_query")
async def ovum_cudnn_wrap_query(request: web.Request):
    try:
        data = await request.post()
        class_key = data.get("type")
        return web.json_response({"response": bool(is_cudnn_wrapped(class_key))})
    except Exception:
        return web.json_response({"response": False})


@PromptServer.instance.routes.post("/ovum/cudnn_wrap_query_bulk")
async def ovum_cudnn_wrap_query_bulk(request: web.Request):
    # Accepts JSON body: { "types": ["ClassA", "ClassB", ...] }
    try:
        try:
            data = await request.json()
        except Exception:
            data = await request.post()
        types = data.get("types") or []
        if isinstance(types, str):
            types = [t.strip() for t in types.split(",") if t.strip()]
        elif not isinstance(types, (list, tuple)):
            types = []
        result = {}
        for t in types:
            try:
                result[t] = bool(is_cudnn_wrapped(t))
            except Exception:
                result[t] = False
        sorted_result = {k: result[k] for k in sorted(result)}
        return web.json_response({"response": sorted_result})
    except Exception:
        return web.json_response({"response": {}})


@PromptServer.instance.routes.post("/ovum/cudnn_wrap_init")
async def ovum_cudnn_wrap_init(request: web.Request):
    """
    Auto-convert classes listed in classes_to_cudnn_wrap.txt.
    Supports exact class keys and regex patterns.
    Regex syntax:
      - Lines starting with "re:" treat the remainder as a Python regex.
        Flags can be specified as: re:i:pattern (letters among imsxauL), or using inline (?i) etc.
      - Lines wrapped in slashes like "/.../" are also treated as regex. Trailing flags are allowed: /pattern/imx
    Other non-empty, non-comment lines are treated as exact NODE_CLASS_MAPPINGS keys.
    """
    try:
        root_cfg = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'classes_to_cudnn_wrap.txt'))
        module_cfg = os.path.join(os.path.dirname(__file__), 'classes_to_cudnn_wrap.txt')
        cfg_path = root_cfg if os.path.isfile(root_cfg) else module_cfg
        exact_keys = []
        regex_patterns = []  # list of tuples (pattern_str_display, compiled_pattern)

        def _flags_from_letters(letters: str) -> int:
            flag_map = {
                'i': re.IGNORECASE,
                'm': re.MULTILINE,
                's': re.DOTALL,
                'x': re.VERBOSE,
                'a': re.ASCII,
                'u': re.UNICODE,
                'L': re.LOCALE,
            }
            flags = 0
            for ch in letters:
                if ch in flag_map:
                    flags |= flag_map[ch]
            return flags

        with open(cfg_path, 'r', encoding='utf-8', errors='ignore') as f:
            for raw in f.readlines():
                if raw.startswith('#'):
                    continue
                line = raw.strip()
                if not line:
                    continue
                pat_disp = None
                if line.startswith('re:'):
                    rest = line[3:].strip()
                    flags_val = 0
                    # Support re:flags:pattern where flags are letters [imsxauL]
                    if ':' in rest:
                        maybe_flags, _, remainder = rest.partition(':')
                        if maybe_flags and all(c.isalpha() for c in maybe_flags):
                            flags_val = _flags_from_letters(maybe_flags)
                            pat = remainder
                            pat_disp = f"re:{maybe_flags}:{pat}"
                        else:
                            pat = rest
                    else:
                        pat = rest
                    # Also support re:/pattern/flags
                    if pat.startswith('/') and pat.endswith('/') and len(pat) >= 2:
                        # no trailing flags here because of endswith('/'), treat as pure /.../
                        inner = pat[1:-1]
                        pat_disp = pat_disp or f'/{inner}/'
                        try:
                            regex_patterns.append((pat_disp, re.compile(inner, flags_val)))
                        except re.error as e:
                            print(f"CUDNNWrapper: invalid regex {pat_disp}: {e}")
                    else:
                        pat_disp = pat_disp or f're:{pat}'
                        try:
                            regex_patterns.append((pat_disp, re.compile(pat, flags_val)))
                        except re.error as e:
                            print(f"CUDNNWrapper: invalid regex {pat_disp}: {e}")
                elif line.startswith('/') and len(line) >= 2:
                    # Support /pattern/flags (flags optional)
                    last_slash = line.rfind('/')
                    if last_slash == 0:
                        # malformed like '/...'
                        continue
                    pat = line[1:last_slash]
                    trailing = line[last_slash+1:]
                    flags_val = _flags_from_letters(trailing)
                    pat_disp = f'/{pat}/{trailing}' if trailing else f'/{pat}/'
                    try:
                        regex_patterns.append((pat_disp, re.compile(pat, flags_val)))
                    except re.error as e:
                        print(f"CUDNNWrapper: invalid regex {pat_disp}: {e}")
                else:
                    exact_keys.append(line)
        # Apply exact matches first
        for key in exact_keys:
            try:
                wrapped = convert_to_cudnn_wrapped_inplace(key)
                if wrapped:
                    print(f"CUDNNWrapper: Wrapped '{key}'")
            except KeyError:
                print(f"CUDNNWrapper: '{key}' not found to wrap")
            except Exception as e:
                print(f"CUDNNWrapper: Failed to wrap '{key}' because {type(e).__name__}")
        # Apply regex matches
        mapping_keys = list(NODE_CLASS_MAPPINGS.keys())
        for disp, pat in regex_patterns:
            matched_any = False
            for key in mapping_keys:
                try:
                    if pat.search(key):
                        matched_any = True
                        try:
                            wrapped = convert_to_cudnn_wrapped_inplace(key)
                            if wrapped:
                                print(f"CUDNNWrapper: Wrapped via regex {disp} -> '{key}'")
                        except Exception as e:
                            print(f"CUDNNWrapper: Failed regex-wrap '{key}' for {disp} because {type(e).__name__}")
                except Exception as e:
                    print(f"CUDNNWrapper: Error testing regex {disp} on '{key}': {type(e).__name__}")
            if not matched_any:
                print(f"CUDNNWrapper: regex {disp} matched no classes")
    except Exception:
        print("CUDNNWrapper: problem reading classes_to_cudnn_wrap.txt")
    return web.json_response({"response": True})

@PromptServer.instance.routes.get('/ovum/cudnn-status')
async def status(d):
    try:
        # Detect AMD-like environment (AMD HIP build or ZLUDA) similar to cudnn_wrapper logic
        amd_like = False
        try:
            vstr = ""
            try:
                if torch.cuda.is_available():
                    vstr = torch.cuda.get_device_name(0)
            except Exception:
                pass
            try:
                hip = getattr(getattr(torch, "version", object()), "hip", None)
                if hip:
                    vstr = (vstr + " AMD ").strip()
            except Exception:
                pass
            import os
            vlow = vstr.lower()
            if ("amd " in vstr) or ("zluda" in vlow) or os.environ.get("ZLUDA") or os.environ.get("ZLUDA_ROOT"):
                amd_like = True
        except Exception:
            amd_like = False
        return web.json_response({
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark,
            "amd_like": amd_like
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})
