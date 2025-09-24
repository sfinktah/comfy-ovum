import os
import re
import json
from typing import List, Tuple, Dict, Any, Optional
from pathlib import Path
import logging

import numpy as np
# noinspection PyUnresolvedReferences
import torch
from PIL import Image, ImageOps

# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer
# noinspection PyPackageRequirements
from aiohttp import web

from metadata.metadata_file_extractor import MetadataFileExtractor

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
INPUT_ROOT = folder_paths.get_input_directory()


class CustomFilterBase:
    def accept(self, filename: str, full_path: str) -> bool:  # pragma: no cover - interface
        re.match(".*", filename)
        return True


def normalize_path(path: str, forward_slashes: bool = True) -> str:
    """Normalize a path and optionally convert to forward slashes."""
    normalized = os.path.normpath(path)
    if forward_slashes:
        normalized = normalized.replace('\\', '/')
    return normalized


def extract_first_number(s):
    match = re.search(r'_(\d+)', s)
    return int(match.group(1)) if match else float('inf')

sort_methods = [
    "None",
    "None (Reversed)",
    "Alphabetical (ASC)",
    "Alphabetical (DESC)",
    "Numerical (ASC)",
    "Numerical (DESC)",
    "Access Time (ASC)",
    "Access Time (DESC)",
    "Creation Time (ASC)",
    "Creation Time (DESC)",
    "Modification Time (ASC)",
    "Modification Time (DESC)"
]

def sort_by(items, base_path='.', method=None):
    def fullpath(x): return os.path.join(base_path, x)

    def get_atime(path):
        try:
            return os.path.getatime(path)
        except FileNotFoundError:
            return float('-inf')

    def get_ctime(path):
        try:
            return os.path.getctime(path)
        except FileNotFoundError:
            return float('-inf')

    def get_mtime(path):
        try:
            return os.path.getmtime(path)
        except FileNotFoundError:
            return float('-inf')

    if method == "Alphabetical (ASC)":
        return sorted(items)
    elif method == "Alphabetical (DESC)":
        return sorted(items, reverse=True)
    elif method == "Numerical (ASC)":
        return sorted(items, key=lambda x: extract_first_number(os.path.splitext(x)[0]))
    elif method == "Numerical (DESC)":
        return sorted(items, key=lambda x: extract_first_number(os.path.splitext(x)[0]), reverse=True)
    elif method == "Access Time (ASC)":
        return sorted(items, key=lambda x: get_atime(fullpath(x)))
    elif method == "Access Time (DESC)":
        return sorted(items, key=lambda x: get_atime(fullpath(x)), reverse=True)
    elif method == "Creation Time (ASC)":
        return sorted(items, key=lambda x: get_ctime(fullpath(x)))
    elif method == "Creation Time (DESC)":
        return sorted(items, key=lambda x: get_ctime(fullpath(x)), reverse=True)
    elif method == "Modification Time (ASC)":
        return sorted(items, key=lambda x: get_mtime(fullpath(x)))
    elif method == "Modification Time (DESC)":
        return sorted(items, key=lambda x: get_mtime(fullpath(x)), reverse=True)
    elif method == "None (Reversed)":
        return reversed(items)
    else:
        return items

class LoadImagesListWithCallback:
    NAME = "Load images list (regex/custom filter + callback)"
    CATEGORY = "ovum/image"
    FUNCTION = "load_images"

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "DICT", "BOOLEAN")
    RETURN_NAMES = ("IMAGE", "MASK", "FILE PATH", "CALLBACK DATA", "PROMPT&WORKFLOW", "exhausted")
    OUTPUT_IS_LIST = (True, True, True, True, True, False)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
            },
            "optional": {
                "directory": ("STRING", {"default": ""}),
                "filenames": ("LIST", {"forceInput": True}),
                "regex": ("STRING", {"default": ""}),
                "custom_filter_class": ("STRING", {"default": ""}),
                "start_index": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "step": 1}),
                "image_load_cap": ("INT", {"default": 0, "min": 0, "step": 1}),
                "recurse": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "load_always": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "sort_method": (sort_methods,),
                "invoke_callback": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "callback_message": ("STRING", {"default": "ovum.image_list.info"}),
            }
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Change on parameters. If always-load requested, force refresh
        if kwargs.get("invoke_callback", False) or kwargs.get("load_always", False):
            return float("NaN")
        # Convert any list inputs (e.g., 'filenames') to tuples so they are hashable
        normalized_items = []
        for k, v in sorted(kwargs.items()):
            if isinstance(v, list):
                try:
                    normalized_items.append((k, tuple(v)))
                except Exception:
                    # Fall back to string representation if elements are unhashable
                    normalized_items.append((k, tuple(map(str, v))))
            else:
                normalized_items.append((k, v))
        return hash(tuple(normalized_items))

    def _setup_filters(self, regex: str, custom_filter_class: str) -> Tuple[re.Pattern[str] | None, Optional[CustomFilterBase]]:
        """set up regex pattern and custom filter instances."""
        pattern = re.compile(regex) if regex else None
        custom: Optional[CustomFilterBase] = None
        if custom_filter_class:
            try:
                # dynamic import path like 'mypkg.MyFilter'
                module_name, class_name = custom_filter_class.rsplit('.', 1)
                mod = __import__(module_name, fromlist=[class_name])
                klass = getattr(mod, class_name)
                custom = klass()
            except Exception:
                custom = None
        return pattern, custom

    def _should_include_file(self, path: Path, pattern: re.Pattern[str] | None, custom: Optional[CustomFilterBase]) -> bool:
        """Check if a file should be included based on extension, regex, and custom filter."""
        # Filter by image extensions
        valid_ext = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'}

        if path.suffix.lower() not in valid_ext:
            return False

        name = path.name
        if pattern and not pattern.search(name):
            return False

        if custom and not bool(custom.accept(name, str(path))):
            return False

        return True

    def _collect_files(self, directory: str, regex: str, custom_filter_class: str, recurse: bool, load_always: bool, sort_method: str) -> List[Path]:
        root = Path(directory)
        if not root.is_dir():
            raise FileNotFoundError(f"Directory '{directory}' cannot be found.")

        pattern, custom = self._setup_filters(regex, custom_filter_class)
        files: List[Path] = []
        iterator = root.rglob('*') if recurse else root.iterdir()

        for p in iterator:
            if p.is_dir():
                continue
            if self._should_include_file(p, pattern, custom):
                files.append(p)

        result = sort_by(files, directory, sort_method)
        return result

    def _collect_from_list(self, filenames: List[Any], regex: str, custom_filter_class: str) -> List[Path]:
        # Accept an explicit list of filenames/paths as an alternative to directory scanning.
        # Resolve relative paths against OUTPUT_ROOT and INPUT_ROOT, and filter to valid images.
        pattern, custom = self._setup_filters(regex, custom_filter_class)

        resolved: List[Path] = []
        for item in filenames or []:
            try:
                s = str(item).strip()
            except Exception:
                s = ""
            if not s:
                continue
            candidates: List[Path] = []
            p = Path(s)
            if p.is_absolute():
                candidates.append(p)
            else:
                candidates.append((OUTPUT_ROOT / s))
                try:
                    candidates.append((INPUT_ROOT / s))  # type: ignore[name-defined]
                except Exception:
                    pass
                candidates.append(Path.cwd() / s)

            chosen: Optional[Path] = None
            for c in candidates:
                if c.exists() and c.is_file():
                    chosen = c
                    break
            if not chosen:
                continue

            if self._should_include_file(chosen, pattern, custom):
                resolved.append(chosen)

        # Do not sort here; preserve the provided order of filenames
        return resolved

    def _load_image_mask(self, path: Path) -> Tuple[torch.Tensor, torch.Tensor]:
        with Image.open(path) as i:
            i = ImageOps.exif_transpose(i)
            image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image_t = torch.from_numpy(image)[None,]
            if 'A' in i.getbands():
                mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask_t = 1. - torch.from_numpy(mask)
            else:
                mask_t = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
        return image_t, mask_t

    def _rel_or_abs(self, p: Path) -> str:
        try:
            rp = p.resolve().relative_to(OUTPUT_ROOT)
            return str(rp).replace('\\', '/')
        except Exception:
            return str(p.resolve())

    def load_images(self, directory: str = "", filenames: Optional[List[Any]] = None, regex: str = "", custom_filter_class: str = "", image_load_cap: int = 0,
                    start_index: int = 0, recurse: bool = False, invoke_callback: bool = False, load_always: bool = False, sort_method: str = "None",
                    callback_message: str = "ovum.image_list.info"):
        # Choose source of files: explicit filenames list (if provided) or scan directory
        if filenames:
            files = self._collect_from_list(filenames, regex, custom_filter_class)
        else:
            files = self._collect_files(directory, regex, custom_filter_class, recurse, load_always, sort_method)
        total_files = len(files)

        # Determine exhaustion state and guard slicing to avoid IndexError when linked inputs produce large indices
        exhausted = False
        try:
            if start_index < 0:
                start_index = 0
            # If start_index exceeds available files, mark exhausted and yield empty slice
            if start_index >= total_files:
                exhausted = True
                files = []
            else:
                files = files[start_index:]
        except IndexError:
            # Be defensive even though slicing normally doesn't raise IndexError
            exhausted = True
            files = []

        if image_load_cap > 0:
            files = files[:image_load_cap]
            # If we weren't already exhausted, check if this batch reaches or passes the end
            if not exhausted and (start_index + image_load_cap) >= total_files:
                exhausted = True
        else:
            # No cap: consider exhausted only if start_index already at/after end or there were no files
            if not exhausted and total_files == 0:
                exhausted = True

        images: List[torch.Tensor] = []
        masks: List[torch.Tensor] = []
        file_paths: List[str] = []
        cb_payloads: List[str] = []
        prompt_workflow_out: List[Dict[str, Any]] = []

        # If callback is requested, prepare batch payload to send to frontend
        cb_data: Optional[Dict[str, Any]] = None
        if invoke_callback and files:
            file_list = [f.name for f in files]
            rel_or_abs = [self._rel_or_abs(f) for f in files]
            cb_data = {"files": file_list, "paths": rel_or_abs}
            try:
                PromptServer.instance.send_sync(callback_message, cb_data)
            except Exception:
                pass

        for filepath in files:
            try:
                img, m = self._load_image_mask(filepath)
                images.append(img)
                masks.append(m)
                # Normalize and use forward slashes for file paths
                file_paths.append(normalize_path(str(filepath), forward_slashes=True))
                if cb_data is not None:
                    cb_payloads.append(json.dumps(cb_data))
                else:
                    cb_payloads.append("")
                # Extract metadata using MetadataFileExtractor
                try:
                    combined_dict = MetadataFileExtractor.extract_both(str(filepath))
                except Exception as e:
                    logger.warning(f"Failed to extract metadata from {filepath}: {e}")
                    combined_dict = {"prompt": {}, "workflow": {}}
                prompt_workflow_out.append(combined_dict)
            except Exception:
                # Skip unreadable image
                continue

        return images, masks, file_paths, cb_payloads, prompt_workflow_out, exhausted


class FolderPathsNode:
    NAME = "Folder Paths"
    CATEGORY = "ovum/utils"
    FUNCTION = "get_paths"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path",)
    OUTPUT_IS_LIST = (False,)

    @classmethod
    def INPUT_TYPES(cls):
        # Dynamically get available methods from folder_paths
        available_methods = []
        if hasattr(folder_paths, '__dict__'):
            for attr_name in dir(folder_paths):
                if attr_name.startswith('get') and callable(getattr(folder_paths, attr_name, None)):
                    # Check if it's a method that returns a path or list of paths
                    try:
                        method = getattr(folder_paths, attr_name)
                        # Try to call it to see if it returns something path-like
                        # We'll be conservative and only include methods that don't require parameters
                        import inspect
                        sig = inspect.signature(method)
                        # Only include methods with no required parameters
                        if len([p for p in sig.parameters.values() if p.default == inspect.Parameter.empty]) == 0:
                            available_methods.append(attr_name)
                    except Exception:
                        continue

        # Add some known common methods if not found dynamically
        # common_methods = ['get_input_directory', 'get_output_directory', 'get_temp_directory',
        #                  'get_user_directory', 'get_models_directory']
        # for method in common_methods:
        #     if hasattr(folder_paths, method) and method not in available_methods:
        #         available_methods.append(method)
        #
        # if not available_methods:
        #     available_methods = ['get_output_directory']  # fallback

        return {
            "required": {
                "method": (available_methods, {"default": available_methods[0]}),
            },
            "optional": {
                "absolute_paths": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "normalize_paths": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
                "forward_slashes": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
            }
        }

    def get_paths(self, method: str, absolute_paths: bool = True, normalize_paths: bool = True, forward_slashes: bool = True):
        try:
            # Get the method from folder_paths
            if not hasattr(folder_paths, method):
                return (f"Error: Method '{method}' not found in folder_paths",)

            method_func = getattr(folder_paths, method)
            if not callable(method_func):
                return (f"Error: '{method}' is not callable",)

            # Call the method
            result = method_func()

            # Convert result to string
            if isinstance(result, (str, Path)):
                path_str = str(result)
            else:
                path_str = str(result)

            if not path_str:
                return ("",)

            path = Path(path_str)

            # Convert to absolute if requested
            if absolute_paths:
                path = path.resolve()

            final_path = str(path)

            # Normalize if requested
            if normalize_paths:
                final_path = normalize_path(final_path, forward_slashes=forward_slashes)
            elif forward_slashes:
                final_path = final_path.replace('\\', '/')

            return (final_path,)

        except Exception as e:
            return (f"Error calling {method}: {str(e)}",)


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


CLAZZES = [LoadImagesListWithCallback, FolderPathsNode]
