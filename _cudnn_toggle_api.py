# from .node_cacher import convert_to_caching, is_caching
from server import PromptServer
import os
import torch
from aiohttp import web

@PromptServer.instance.routes.get('/ovum/cudnn-status')
async def status(d):
    try:
        return web.json_response({
            "torch.backends.cudnn.enabled": torch.backends.cudnn.enabled,
            "torch.backends.cudnn.benchmark": torch.backends.cudnn.benchmark
        })
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)})

@PromptServer.instance.routes.post('/ovum/cudnn-set')
async def set_cudnn(d):
    try:
        # Capture previous states
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark

        # Parse body (may be empty/invalid)
        data = {}
        try:
            data = await d.json()
        except Exception:
            # If no/invalid body, keep empty dict and apply no changes
            pass

        def to_bool(v):
            if isinstance(v, bool):
                return v
            if isinstance(v, str):
                return v.strip().lower() in ("1", "true", "yes", "on")
            return bool(v)

        # Determine new values
        enabled_in = data.get("enabled", None)
        benchmark_in = data.get("benchmark", None)

        new_enabled = to_bool(enabled_in) if enabled_in is not None else prev_enabled
        if benchmark_in is not None:
            new_benchmark = to_bool(benchmark_in)
        else:
            # If benchmark is not supplied, assume it is the same as enabled when enabled is provided
            new_benchmark = new_enabled if enabled_in is not None else prev_benchmark

        # Apply changes
        torch.backends.cudnn.enabled = new_enabled
        torch.backends.cudnn.benchmark = new_benchmark

        # Return previous and current states
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
