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

from metadata.metadata_file_extractor import MetadataFileExtractor
from prompt_server_routes import folder_paths, OUTPUT_ROOT, INPUT_ROOT
from folder_paths_node import normalize_path

logger = logging.getLogger(__name__)


class CustomFilterBase:
    def accept(self, filename: str, full_path: str) -> bool:  # pragma: no cover - interface
        re.match(".*", filename)
        return True


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

    RETURN_TYPES = ("IMAGE", "MASK", "LIST",          "LIST",               "LIST",                 "LIST",          "BOOLEAN")
    RETURN_NAMES = ("IMAGE", "MASK", "FILEPATH LIST", "CALLBACK DATA LIST", "PROMPT&WORKFLOW LIST", "IMAGE_EX LIST", "exhausted")
    OUTPUT_IS_LIST = (True,   True,   False,           False,                False,                  False,           False)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
            },
            "optional": {
                "prev_image_exs": ("LIST", {"forceInput": True}),
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

    def load_images(self, prev_image_exs: Optional[List[Dict[str, Any]]] = None, directory: str = "", filenames: Optional[List[Any]] = None, regex: str = "", custom_filter_class: str = "", image_load_cap: int = 0,
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

        # Build a list of per-image dictionaries; start with any prev_image_exs passthrough
        image_ex_list: List[Dict[str, Any]] = []
        # Initialize outputs (prev entries will be prepended by adding them first)
        images: List[torch.Tensor] = []
        masks: List[torch.Tensor] = []
        file_paths: List[str] = []
        cb_payloads: List[str] = []
        prompt_workflow_out: List[Dict[str, Any]] = []

        # If callback is requested, prepare batch payload to send to frontend
        cb_data: Optional[Dict[str, Any]] = None
        if invoke_callback and files:
            raise RuntimeError("Technically this bit hasn't been developed/tested yet.")
            file_list = [f.name for f in files]
            rel_or_abs = [self._rel_or_abs(f) for f in files]
            cb_data = {"files": file_list, "paths": rel_or_abs}
            try:
                PromptServer.instance.send_sync(callback_message, cb_data)
            except Exception:
                pass

        # Start by copying through any prev_image_exs items (unknown keys preserved)
        # IMPORTANT: Do not reprocess or filter these. Simply prepend to outputs.
        try:
            for item in (prev_image_exs or []):
                if not isinstance(item, dict):
                    continue
                # Always keep the original dict in IMAGE_EX LIST
                image_ex_list.append(dict(item))

                # Try to also prepend to the parallel outputs without altering the data
                img = item.get("image")
                m = item.get("mask")
                # Only add to parallel arrays if the basic pair is present to keep lengths consistent
                if img is not None and m is not None:
                    images.append(img)
                    masks.append(m)
                    file_paths.append(str(item.get("filepath", "")))
                    cb_payloads.append(str(item.get("callback", "")))
                    # Combine to preserve previous structure used by callers
                    prompt_workflow_out.append({
                        "prompt": item.get("prompt", {}),
                        "workflow": item.get("workflow", {})
                    })
        except Exception:
            pass

        for filepath in files:
            try:
                img, m = self._load_image_mask(filepath)
                path_str = normalize_path(str(filepath), forward_slashes=True)
                if cb_data is not None:
                    cb_payload = json.dumps(cb_data)
                else:
                    cb_payload = ""
                try:
                    combined_dict = MetadataFileExtractor.extract_both(str(filepath))
                except Exception as e:
                    logger.warning(f"Failed to extract metadata from {filepath}: {e}")
                    combined_dict = {"prompt": {}, "workflow": {}}
                # Build the IMAGE_EX dict entry and keep fields also in parallel lists for backward compat
                image_ex = {
                    "image": img,
                    "mask": m,
                    "filepath": path_str,
                    "callback": cb_payload,
                    "prompt": combined_dict.get("prompt", {}),
                    "workflow": combined_dict.get("workflow", {}),
                }
                image_ex_list.append(image_ex)
                images.append(img)
                masks.append(m)
                file_paths.append(path_str)
                cb_payloads.append(cb_payload)
                prompt_workflow_out.append(combined_dict)
            except Exception:
                continue

        if not (len(images) == len(masks) == len(file_paths) == len(cb_payloads) == len(prompt_workflow_out)):
            logger.warning(
                "[ovum] Mismatch in output lengths: images=%d masks=%d file_paths=%d cb_payloads=%d prompt_workflow=%d; files=%s",
                len(images), len(masks), len(file_paths), len(cb_payloads), len(prompt_workflow_out),
                [str(f) for f in files]
            )

        return images, masks, file_paths[:], cb_payloads, prompt_workflow_out, image_ex_list, exhausted


CLAZZES = [LoadImagesListWithCallback]
