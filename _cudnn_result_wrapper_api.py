from __future__ import annotations
from aiohttp import web
from nodes import NODE_CLASS_MAPPINGS
from server import PromptServer

from .cudnn_result_wrapper import (
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
        return web.json_response({"response": result})
    except Exception:
        return web.json_response({"response": {}})
