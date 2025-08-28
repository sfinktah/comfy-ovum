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
