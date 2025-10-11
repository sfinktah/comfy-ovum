# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer
import os
# noinspection PyUnresolvedReferences,PyPackageRequirements
import torch
import json, gzip
# noinspection PyPackageRequirements
from aiohttp import web
import asyncio

# In-memory storage for uploaded timing payload
_TIMING_BYTES: bytes | None = None
_TIMING_LOCK = asyncio.Lock()

async def timing_set(value: bytes) -> None:
    """
    Store bytes in an in-memory global variable.
    """
    global _TIMING_BYTES
    async with _TIMING_LOCK:
        _TIMING_BYTES = value

async def timing_get() -> bytes | None:
    """
    Retrieve bytes from in-memory storage.
    """
    async with _TIMING_LOCK:
        return _TIMING_BYTES

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

@PromptServer.instance.routes.get('/ovum/cudnn/enable')
async def cudnn_enable(d):
    try:
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark

        # Change only 'enabled'
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

        # Change only 'enabled'
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

        # Change only 'benchmark'
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

        # Change only 'benchmark'
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

@PromptServer.instance.routes.post('/ovum/update-timing')
async def upload_json(d):
    """
    Accepts large JSON payloads from the frontend.

    Supported:
    - Content-Type: application/json (regular JSON)
    - Content-Type: application/json with Content-Encoding: gzip (compressed JSON)
    - Content-Type: application/x-ndjson (newline-delimited JSON, streamed)

    Response is a small confirmation payload to avoid echoing large data back.
    """
    try:
        enc = (d.headers.get("Content-Encoding") or "").lower()
        content_type = (d.headers.get("Content-Type") or "").lower()

        # Stream NDJSON and store as list of parsed JSON objects
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

        # Regular JSON, optionally gzipped
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

# New GET route to retrieve stored JSON or return error if not defined
@PromptServer.instance.routes.get('/ovum/get-timing')
async def get_uploaded_json(d):
    try:
        data_bytes = await timing_get()
        if data_bytes is None:
            return web.json_response({"error": True, "message": "not found"}, status=404)
        # Return parsed JSON payload
        return web.json_response(json.loads(data_bytes.decode("utf-8")))
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)}, status=500)