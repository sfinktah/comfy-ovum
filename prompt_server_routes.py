import os
import re
import json
from typing import List, Any, Optional, Dict
from pathlib import Path
import logging

from PIL import Image
# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer
# noinspection PyPackageRequirements
from aiohttp import web

logger = logging.getLogger(__name__)

try:
    # ComfyUI utilities if available
    import folder_paths  # type: ignore
except Exception:
    logger.warning("[ovum] Warning: folder_paths not found, using default paths.")
    class _FolderPaths:
        @staticmethod
        def get_output_directory():
            return os.path.abspath(os.path.join(os.getcwd(), 'output'))
    folder_paths = _FolderPaths()  # type: ignore

OUTPUT_ROOT = Path(getattr(folder_paths, 'get_output_directory', lambda: os.path.abspath('output'))()).resolve()
try:
    INPUT_ROOT = folder_paths.get_input_directory()
except AttributeError:
    # Fallback if get_input_directory doesn't exist
    INPUT_ROOT = os.path.abspath(os.path.join(os.getcwd(), 'input'))


# Routes to provide data to the callback via fetch

API_BASE = '/ovum/image-list'


def _is_subpath(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except Exception:
        return False


@PromptServer.instance.routes.get(f'{API_BASE}/file')
async def get_file(request: web.Request):
    """Return raw file content by path query (supports relative to output root)."""
    q = request.query
    p = q.get('path') or ''
    if not p:
        return web.Response(status=400, text='missing path')
    path = Path(p)
    if not path.is_absolute():
        path = OUTPUT_ROOT / p
    path = path.resolve()
    if not _is_subpath(path, OUTPUT_ROOT):
        return web.Response(status=403, text='forbidden')
    if not path.exists() or not path.is_file():
        return web.Response(status=404, text='not found')
    data = path.read_bytes()
    return web.Response(body=data)


@PromptServer.instance.routes.get(f'{API_BASE}/meta')
async def get_meta(request: web.Request):
    """Return dimensions and basic info of a file."""
    p = request.query.get('path') or ''
    if not p:
        return web.json_response({"error": True, "message": "missing path"}, status=400)
    path = Path(p)
    if not path.is_absolute():
        path = OUTPUT_ROOT / p
    path = path.resolve()
    if not _is_subpath(path, OUTPUT_ROOT):
        return web.json_response({"error": True, "message": "forbidden"}, status=403)
    if not path.exists() or not path.is_file():
        return web.json_response({"error": True, "message": "not found"}, status=404)
    try:
        suffix = path.suffix.lower()
        workflow_data: Optional[Any] = None
        width: Optional[int] = None
        height: Optional[int] = None

        if suffix == '.mp4':
            # Attempt to extract embedded workflow JSON-like blob from MP4 bytes.
            # Strategy: search for a JSON object containing "workflow" (or "prompt")
            # in the beginning or end chunks of the file to avoid loading very large files.
            def _extract_json_fragment(data: bytes, anchors=(b'"workflow"', b'"prompt"')) -> Optional[Any]:
                def _parse_object_from(data_bytes: bytes, start_idx: int) -> Optional[str]:
                    depth = 0
                    in_str = False
                    escaped = False
                    for i in range(start_idx, len(data_bytes)):
                        c = data_bytes[i]
                        if in_str:
                            if escaped:
                                escaped = False
                            elif c == 0x5C:  # backslash
                                escaped = True
                            elif c == 0x22:  # quote
                                in_str = False
                        else:
                            if c == 0x22:  # quote
                                in_str = True
                            elif c == 0x7B:  # {
                                depth += 1
                            elif c == 0x7D:  # }
                                depth -= 1
                                if depth == 0:
                                    try:
                                        frag = data_bytes[start_idx:i + 1].decode('utf-8', errors='ignore')
                                        return frag
                                    except Exception:
                                        return None
                    return None

                for anchor in anchors:
                    pos = data.find(anchor)
                    while pos != -1:
                        start = data.rfind(b'{', 0, pos)
                        if start == -1:
                            break
                        frag = _parse_object_from(data, start)
                        if frag:
                            try:
                                obj = json.loads(frag)
                                if isinstance(obj, dict):
                                    # Prefer explicit 'workflow', else 'prompt', else the whole object
                                    if 'workflow' in obj:
                                        val = obj['workflow']
                                    elif 'prompt' in obj:
                                        val = obj['prompt']
                                    else:
                                        val = obj
                                    # If the value is a JSON string, try parsing again
                                    if isinstance(val, str):
                                        try:
                                            return json.loads(val)
                                        except Exception:
                                            return val
                                    return val
                                return obj
                            except Exception:
                                # If not valid JSON, return the raw fragment
                                return frag
                        pos = data.find(anchor, pos + 1)
                return None

            try:
                file_size = path.stat().st_size
                chunk_size = 10 * 1024 * 1024  # 10MB
                data_head = b''
                data_tail = b''
                with path.open('rb') as f:
                    data_head = f.read(min(file_size, chunk_size))
                    if file_size > chunk_size:
                        try:
                            f.seek(max(0, file_size - chunk_size))
                            data_tail = f.read(chunk_size)
                        except Exception:
                            data_tail = b''
                workflow_data = _extract_json_fragment(data_head) or _extract_json_fragment(data_tail)
            except Exception:
                workflow_data = None

        else:
            # Image types: read dimensions with Pillow and, for PNG, try to extract workflow
            with Image.open(path) as im:
                w, h = im.size
                width, height = w, h

                if suffix == '.png':
                    try:
                        info = getattr(im, "info", {}) or {}
                        try:
                            text_chunks = getattr(im, "text", {}) or {}
                        except Exception:
                            text_chunks = {}

                        merged = {}
                        try:
                            for k in getattr(info, "keys", lambda: [])():
                                merged[str(k)] = info.get(k)
                        except Exception:
                            pass
                        try:
                            for k in getattr(text_chunks, "keys", lambda: [])():
                                merged[str(k)] = text_chunks.get(k)
                        except Exception:
                            pass

                        workflow_value = None
                        for k, v in merged.items():
                            if isinstance(k, str) and k.lower() == 'workflow':
                                workflow_value = v
                                break
                        if workflow_value is None:
                            for k, v in merged.items():
                                if isinstance(k, str) and k.lower() == 'prompt':
                                    workflow_value = v
                                    break

                        if isinstance(workflow_value, (bytes, bytearray)):
                            try:
                                workflow_value = workflow_value.decode('utf-8', errors='replace')
                            except Exception:
                                workflow_value = None

                        if isinstance(workflow_value, str):
                            try:
                                workflow_data = json.loads(workflow_value)
                            except Exception:
                                workflow_data = workflow_value
                    except Exception:
                        workflow_data = None

        payload: Dict[str, Any] = {"width": width, "height": height, "name": path.name, "path": str(path)}
        if workflow_data is not None:
            payload["workflow"] = workflow_data
        return web.json_response(payload)
    except Exception as e:
        return web.json_response({"error": True, "message": str(e)}, status=500)


@PromptServer.instance.routes.get(f'{API_BASE}/search')
async def search(request: web.Request):
    """Recursive search under OUTPUT_ROOT for files matching regex pattern."""
    pattern = request.query.get('pattern') or ''
    base = request.query.get('base') or ''
    try:
        regex = re.compile(pattern) if pattern else None
    except re.error as e:
        return web.json_response({"error": True, "message": f"bad regex: {e}"}, status=400)

    start_dir = OUTPUT_ROOT if not base else (OUTPUT_ROOT / base)
    start_dir = start_dir.resolve()
    if not _is_subpath(start_dir, OUTPUT_ROOT):
        return web.json_response({"error": True, "message": "forbidden"}, status=403)
    if not start_dir.exists() or not start_dir.is_dir():
        return web.json_response({"error": True, "message": "base not found"}, status=404)

    results: List[str] = []
    for p in start_dir.rglob('*'):
        if p.is_file():
            name = p.name
            if not regex or regex.search(name):
                try:
                    rp = p.resolve().relative_to(OUTPUT_ROOT)
                    results.append(str(rp).replace('\\', '/'))
                except Exception:
                    results.append(str(p.resolve()))
    return web.json_response({"results": results, "base": str(start_dir)})
