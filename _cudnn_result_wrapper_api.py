from __future__ import annotations
from aiohttp import web
from nodes import NODE_CLASS_MAPPINGS
from server import PromptServer
import os
import re
import json, gzip
import asyncio
# noinspection PyUnresolvedReferences,PyPackageRequirements
import torch

from .cudnn_wrapper import (
    create_cudnn_wrapped_version,
    convert_to_cudnn_wrapped_inplace,
    is_cudnn_wrapped,
)

# -------------------------
# Wrap management endpoints
# -------------------------
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

# -------------------------
# General Ovum listing
# -------------------------
@PromptServer.instance.routes.get('/ovum')
async def ovum_index(d):
    try:
        app = getattr(PromptServer.instance, "app", None)
        endpoints = []
        if app is not None:
            for res in app.router.resources():
                info = res.get_info()
                path = info.get("path") or info.get("formatter")
                if not path:
                    continue
                if isinstance(path, str) and path.startswith("/ovum"):
                    endpoints.append(path)
        endpoints = sorted(set(endpoints))
        return web.Response(text="\n".join(endpoints), content_type="text/plain")
    except Exception as e:
        return web.Response(text=f"error: {str(e)}", content_type="text/plain", status=500)


@PromptServer.instance.routes.get('/ovum.json')
async def ovum_index_json(d):
    try:
        app = getattr(PromptServer.instance, "app", None)
        endpoints = []
        if app is not None:
            for res in app.router.resources():
                info = res.get_info()
                path = info.get("path") or info.get("formatter")
                if not path:
                    continue
                if isinstance(path, str) and path.startswith("/ovum"):
                    endpoints.append(path)
        endpoints = sorted(set(endpoints))
        return web.json_response({"endpoints": endpoints})
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})

# -------------------------
# cuDNN status/controls
# -------------------------
@PromptServer.instance.routes.get('/ovum/cudnn/enable')
async def cudnn_enable(d):
    try:
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark
        torch.backends.cudnn.enabled = True
        return web.json_response({
            "previous.torch.backends.cudnn.enabled": prev_enabled,
            "previous.torch.backends.cudnn.benchmark": prev_benchmark,
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


@PromptServer.instance.routes.get('/ovum/cudnn/disable')
async def cudnn_disable(d):
    try:
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark
        torch.backends.cudnn.enabled = False
        return web.json_response({
            "previous.torch.backends.cudnn.enabled": prev_enabled,
            "previous.torch.backends.cudnn.benchmark": prev_benchmark,
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


@PromptServer.instance.routes.get('/ovum/cudnn-benchmark/enable')
async def cudnn_benchmark_enable(d):
    try:
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark
        torch.backends.cudnn.benchmark = True
        return web.json_response({
            "previous.torch.backends.cudnn.enabled": prev_enabled,
            "previous.torch.backends.cudnn.benchmark": prev_benchmark,
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


@PromptServer.instance.routes.get('/ovum/cudnn-benchmark/disable')
async def cudnn_benchmark_disable(d):
    try:
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark
        torch.backends.cudnn.benchmark = False
        return web.json_response({
            "previous.torch.backends.cudnn.enabled": prev_enabled,
            "previous.torch.backends.cudnn.benchmark": prev_benchmark,
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


@PromptServer.instance.routes.get('/ovum/hip-path')
async def get_hip_path(d):
    try:
        return web.json_response({"HIP_PATH": os.environ.get("HIP_PATH")})
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


# -------------------------
# Timing payload storage
# -------------------------
_TIMING_BYTES: bytes | None = None
_TIMING_LOCK = asyncio.Lock()

async def timing_set(value: bytes) -> None:
    global _TIMING_BYTES
    async with _TIMING_LOCK:
        _TIMING_BYTES = value

async def timing_get() -> bytes | None:
    async with _TIMING_LOCK:
        return _TIMING_BYTES


@PromptServer.instance.routes.post('/ovum/update-timing')
async def upload_json(d):
    try:
        enc = (d.headers.get("Content-Encoding") or "").lower()
        content_type = (d.headers.get("Content-Type") or "").lower()

        if "ndjson" in content_type:
            items = []
            buffer = ""
            async for chunk in d.content.iter_chunked(65536):
                buffer += chunk.decode("utf-8")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if line.strip():
                        items.append(json.loads(line))
            if buffer.strip():
                items.append(json.loads(buffer))
            payload_bytes = json.dumps(items, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            await timing_set(payload_bytes)
            return web.json_response({"ok": True, "stored": True, "accepted": "ndjson", "lines": len(items)})

        if enc == "gzip":
            raw = await d.read()
            data = json.loads(gzip.decompress(raw).decode("utf-8"))
        else:
            data = await d.json()
        payload_bytes = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        await timing_set(payload_bytes)
        return web.json_response({
            "ok": True,
            "stored": True,
            "accepted": "json",
            "python_type": type(data).__name__
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})


@PromptServer.instance.routes.get('/ovum/get-timing')
async def get_uploaded_json(d):
    try:
        data_bytes = await timing_get()
        if data_bytes is None:
            return web.json_response({"error": True, "message": "not found"}, status=404)
        return web.json_response(json.loads(data_bytes.decode("utf-8")))
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)}, status=500)


# -------------------------
# Environment status endpoint used by frontend AMD logo indicator
# -------------------------
@PromptServer.instance.routes.get('/ovum/cudnn-status')
async def cudnn_status(d):
    try:
        # Determine AMD-like environment
        amd_like = False
        try:
            v = ""
            if torch.cuda.is_available():
                v = torch.cuda.get_device_name(0)
            hip = getattr(getattr(torch, "version", object()), "hip", None)
            if hip:
                v = (v + " AMD ").strip()
            import os as _os
            if _os.environ.get("ZLUDA", "") or _os.environ.get("ZLUDA_ROOT", ""):
                v = (v + " ZLUDA").strip()
            vl = v.lower()
            amd_like = ("amd " in v) or ("zluda" in vl)
        except Exception:
            amd_like = False
        return web.json_response({
            "amd_like": bool(amd_like),
            "torch.backends.cudnn.enabled": bool(getattr(torch.backends.cudnn, 'enabled', False)),
            "torch.backends.cudnn.benchmark": bool(getattr(torch.backends.cudnn, 'benchmark', False)),
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})
