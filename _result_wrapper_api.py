from __future__ import annotations
from aiohttp import web
from nodes import NODE_CLASS_MAPPINGS
from server import PromptServer
import os

from .result_wrapper import (
    create_result_wrapped_version,
    convert_to_result_wrapped_inplace,
    is_result_wrapped,
)

# Backend endpoints analogous to cg-nodecaching/node_cacher_api.py

@PromptServer.instance.routes.post("/ovum/result_wrap_request")
async def ovum_result_wrap_request(request: web.Request):
    try:
        data = await request.post()
        class_key = data.get("type")
        if not class_key:
            return web.json_response({"response": False})
        # Prefer in-place conversion for seamless replacement; fall back to alt version
        ok = bool(convert_to_result_wrapped_inplace(class_key))
        if not ok and not is_result_wrapped(class_key):
            ok = create_result_wrapped_version(class_key) is not None
        return web.json_response({"response": ok})
    except Exception:
        return web.json_response({"response": False})


@PromptServer.instance.routes.post("/ovum/result_wrap_query")
async def ovum_result_wrap_query(request: web.Request):
    try:
        data = await request.post()
        class_key = data.get("type")
        return web.json_response({"response": bool(is_result_wrapped(class_key))})
    except Exception:
        return web.json_response({"response": False})

@PromptServer.instance.routes.post("/ovum/result_wrap_query_bulk")
async def ovum_result_wrap_query_bulk(request: web.Request):
    # Accepts JSON body: { "types": ["ClassA", "ClassB", ...] }
    try:
        try:
            data = await request.json()
        except Exception:
            # Fallback to form data if JSON not provided
            data = await request.post()
        types = data.get("types") or []
        if isinstance(types, str):
            # Allow comma-separated or single string for robustness
            types = [t.strip() for t in types.split(",") if t.strip()]
        elif not isinstance(types, (list, tuple)):
            types = []
        result = {}
        for t in types:
            try:
                result[t] = bool(is_result_wrapped(t))
            except Exception:
                result[t] = False
        return web.json_response({"response": result})
    except Exception:
        return web.json_response({"response": {}})



@PromptServer.instance.routes.post("/ovum/result_wrap_init")
async def ovum_result_wrap_init(request: web.Request):
    # Auto-convert any classes listed in classes_to_result_wrap.txt (like cg-nodecaching)
    try:
        # Look for config file in project root first, then in this module directory
        root_cfg = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'classes_to_result_wrap.txt'))
        module_cfg = os.path.join(os.path.dirname(__file__), 'classes_to_result_wrap.txt')
        cfg_path = root_cfg if os.path.isfile(root_cfg) else module_cfg
        with open(cfg_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f.readlines():
                if not line.startswith('#'):
                    line = line.strip()
                    if line:
                        try:
                            converted = convert_to_result_wrapped_inplace(line)
                            if converted:
                                print(f"ResultWrapper: Converted {line}")
                        except KeyError:
                            print(f"ResultWrapper: {line} not found to convert")
                        except Exception as e:
                            print(f"ResultWrapper: Failed to convert {line} because {type(e).__name__}")
    except Exception:
        print("ResultWrapper: problem reading classes_to_result_wrap.txt")
    return web.json_response({"response": True})
