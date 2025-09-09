# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer
import os
# noinspection PyUnresolvedReferences,PyPackageRequirements
import torch
import json, gzip
# noinspection PyPackageRequirements
from aiohttp import web
import asyncio

# Minimal Memcached (text protocol) async client helpers
MEMCACHED_HOST = os.environ.get("MEMCACHED_HOST", "127.0.0.1")
MEMCACHED_PORT = int(os.environ.get("MEMCACHED_PORT", "11211"))
MEMCACHED_KEY = "ovum-timer-timings"

async def _memcached_open():
    reader, writer = await asyncio.open_connection(MEMCACHED_HOST, MEMCACHED_PORT)
    return reader, writer

async def _memcached_close(writer):
    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass

async def memcached_set(key: str, value: bytes, expire: int = 0) -> bool:
    """
    Store bytes in memcached with given key.
    """
    reader = writer = None
    try:
        reader, writer = await _memcached_open()
        flags = 0
        header = f"set {key} {flags} {expire} {len(value)}\r\n".encode("utf-8")
        writer.write(header)
        writer.write(value + b"\r\n")
        await writer.drain()
        resp = await reader.readuntil(b"\r\n")
        return resp.startswith(b"STORED")
    finally:
        if writer:
            await _memcached_close(writer)

async def memcached_get(key: str) -> bytes | None:
    """
    Retrieve bytes from memcached by key, or None if missing.
    """
    reader = writer = None
    try:
        reader, writer = await _memcached_open()
        writer.write(f"get {key}\r\n".encode("utf-8"))
        await writer.drain()

        # Expected:
        # VALUE <key> <flags> <bytes>\r\n
        # <data>\r\n
        # END\r\n
        line = await reader.readuntil(b"\r\n")
        if line.startswith(b"END"):
            return None
        if not line.startswith(b"VALUE "):
            # Consume remaining until END to keep connection clean (best-effort)
            try:
                while True:
                    l = await reader.readuntil(b"\r\n")
                    if l.startswith(b"END"):
                        break
            except Exception:
                pass
            return None
        parts = line.decode("utf-8").strip().split()
        if len(parts) < 4:
            return None
        size = int(parts[3])
        data = await reader.readexactly(size)
        # consume trailing \r\n
        _ = await reader.readexactly(2)
        # consume END\r\n
        _ = await reader.readuntil(b"\r\n")
        return data
    finally:
        if writer:
            await _memcached_close(writer)

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

@PromptServer.instance.routes.get('/ovum/cudnn-status')
async def status(d):
    try:
        return web.json_response({
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
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
            stored = await memcached_set(MEMCACHED_KEY, payload_bytes, expire=0)
            if not stored:
                return web.json_response({"error": True, "message": "failed to store in memcached"}, status=500)

            return web.json_response({"ok": True, "stored": True, "accepted": "ndjson", "key": MEMCACHED_KEY, "lines": len(items)})

        # Regular JSON, optionally gzipped
        if enc == "gzip":
            raw = await d.read()
            data = json.loads(gzip.decompress(raw).decode("utf-8"))
        else:
            data = await d.json()

        payload_bytes = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        stored = await memcached_set(MEMCACHED_KEY, payload_bytes, expire=0)
        if not stored:
            return web.json_response({"error": True, "message": "failed to store in memcached"}, status=500)

        return web.json_response({
            "ok": True,
            "stored": True,
            "accepted": "json",
            "key": MEMCACHED_KEY,
            "python_type": type(data).__name__
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})

# New GET route to retrieve stored JSON or return error if not defined
@PromptServer.instance.routes.get('/ovum/get-timing')
async def get_uploaded_json(d):
    try:
        data_bytes = await memcached_get(MEMCACHED_KEY)
        if data_bytes is None:
            return web.json_response({"error": True, "message": "not found"}, status=404)
        # Return parsed JSON payload
        return web.json_response(json.loads(data_bytes.decode("utf-8")))
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)}, status=500)