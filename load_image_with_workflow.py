from __future__ import annotations
from typing import Any, Dict, Tuple

import json
import os

import torch

# Comfy core
from nodes import LoadImage  # required by issue statement
import folder_paths
import node_helpers
from PIL import Image, ImageOps, ImageSequence
import numpy as np

# Reuse the metadata extractor used by ovum image list node
from metadata.metadata_file_extractor import MetadataFileExtractor


class LoadImageWithWorkflowOvum(LoadImage):
    CATEGORY = "ovum/image"
    DESCRIPTION = "Load an image from the input folder and additionally output filepath and extracted prompt/workflow metadata."

    # Extend the outputs of LoadImage (IMAGE, MASK)
    # Add: FILEPATH (STRING), PROMPT&WORKFLOW (DICT), IMAGE_EX (DICT)
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "DICT", "DICT")
    RETURN_NAMES = ("IMAGE", "MASK", "FILEPATH", "PROMPT&WORKFLOW", "IMAGE_EX")
    FUNCTION = "load_image_ex"

    @classmethod
    def INPUT_TYPES(s):  # keep the same UI as base LoadImage
        base = dict(super().INPUT_TYPES())
        # Ensure we have a 'hidden' section and add loaded_path
        hidden = dict(base.get("hidden", {}))
        hidden.update({
            "loaded_path": ("STRING", {}),
        })
        base["hidden"] = hidden
        return base

    def load_image_ex(self, image):
        # Largely mirrors LoadImage.load_image and augments with metadata and path
        image_path = folder_paths.get_annotated_filepath(image)
        pil = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        w, h = None, None
        excluded_formats = ['MPO']

        for i in ImageSequence.Iterator(pil):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)
            if i.mode == 'I':
                i = i.point(lambda ii: ii * (1 / 255))
            img = i.convert("RGB")
            if len(output_images) == 0:
                w, h = img.size
            if img.size[0] != w or img.size[1] != h:
                continue
            arr = np.array(img).astype(np.float32) / 255.0
            tensor = torch.from_numpy(arr)[None,]
            if 'A' in i.getbands():
                mask_np = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask_t = 1. - torch.from_numpy(mask_np)
            elif i.mode == 'P' and 'transparency' in i.info:
                mask_np = np.array(i.convert('RGBA').getchannel('A')).astype(np.float32) / 255.0
                mask_t = 1. - torch.from_numpy(mask_np)
            else:
                mask_t = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(tensor)
            output_masks.append(mask_t.unsqueeze(0))

        if len(output_images) > 1 and getattr(pil, 'format', None) not in excluded_formats:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        # Metadata
        try:
            prompt_workflow = MetadataFileExtractor.extract_both(str(image_path))
        except Exception:
            prompt_workflow = {"prompt": {}, "workflow": {}}

        file_path_str = str(image_path)
        image_ex: Dict[str, Any] = {
            "image": output_image,
            "mask": output_mask,
            "filepath": file_path_str.replace('\\', '/'),
            "prompt": prompt_workflow.get("prompt", {}),
            "workflow": prompt_workflow.get("workflow", {}),
        }

        ui = {
            "loaded_path": [file_path_str.replace('\\', '/')],
            "loaded_basename": [os.path.basename(file_path_str).replace('\\', '/')],
        }
        return {"ui": ui, "result": (output_image, output_mask, file_path_str.replace('\\', '/'), prompt_workflow, image_ex)}


class LoadImageFromOutputWithWorkflowOvum(LoadImageWithWorkflowOvum):
    DESCRIPTION = "Load an image from the output folder with workflow metadata."
    EXPERIMENTAL = True

    @classmethod
    def INPUT_TYPES(cls):
        # Mirror nodes.LoadImageOutput INPUT_TYPES but we still want to keep LoadImage behavior
        base = {
            "required": {
                "image": ("COMBO", {
                    "image_upload": True,
                    "image_folder": "output",
                    "remote": {
                        "route": "/internal/files/output",
                        "refresh_button": True,
                        "control_after_refresh": "first",
                    },
                }),
            }
        }
        # Add the same hidden loaded_path as base class
        base["hidden"] = {"loaded_path": ("STRING", {})}
        return base


class LoadImageFromOutputSubdirectoryWithWorkflowOvum(LoadImageWithWorkflowOvum):
    DESCRIPTION = "Load an image from a subdirectory under the output folder with workflow metadata."
    EXPERIMENTAL = True

    @classmethod
    def INPUT_TYPES(cls):
        base = {
            "required": {
                "image": ("COMBO", {
                    "image_upload": True,
                    "image_folder": "output",
                    "remote": {
                        "route": "/internal/files/output",
                        "refresh_button": True,
                        "control_after_refresh": "first",
                    },
                }),
            },
            "optional": {
                "output_subdir": ("STRING", {"default": "", "placeholder": "e.g. my_subdir/nested"}),
            },
        }
        base["hidden"] = {"loaded_path": ("STRING", {})}
        return base

    def load_image_ex(self, image, output_subdir: str = ""):
        # Resolve path under a provided subdirectory of the output folder, if specified
        try:
            subdir = str(output_subdir or "").strip().strip("/\\")
        except Exception:
            subdir = ""
        default_dir = None
        if subdir:
            try:
                default_dir = os.path.join(folder_paths.get_output_directory(), subdir)
            except Exception:
                default_dir = None
        image_path = folder_paths.get_annotated_filepath(image, default_dir)

        # The following mirrors LoadImageWithWorkflowOvum.load_image_ex but starts from image_path
        pil = node_helpers.pillow(Image.open, image_path)

        output_images = []
        output_masks = []
        w, h = None, None
        excluded_formats = ['MPO']

        for i in ImageSequence.Iterator(pil):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)
            if i.mode == 'I':
                i = i.point(lambda ii: ii * (1 / 255))
            img = i.convert("RGB")
            if len(output_images) == 0:
                w, h = img.size
            if img.size[0] != w or img.size[1] != h:
                continue
            arr = np.array(img).astype(np.float32) / 255.0
            tensor = torch.from_numpy(arr)[None,]
            if 'A' in i.getbands():
                mask_np = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask_t = 1. - torch.from_numpy(mask_np)
            elif i.mode == 'P' and 'transparency' in i.info:
                mask_np = np.array(i.convert('RGBA').getchannel('A')).astype(np.float32) / 255.0
                mask_t = 1. - torch.from_numpy(mask_np)
            else:
                mask_t = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(tensor)
            output_masks.append(mask_t.unsqueeze(0))

        if len(output_images) > 1 and getattr(pil, 'format', None) not in excluded_formats:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        # Metadata
        try:
            prompt_workflow = MetadataFileExtractor.extract_both(str(image_path))
        except Exception:
            prompt_workflow = {"prompt": {}, "workflow": {}}

        file_path_str = str(image_path)
        image_ex: Dict[str, Any] = {
            "image": output_image,
            "mask": output_mask,
            "filepath": file_path_str.replace('\\', '/'),
            "prompt": prompt_workflow.get("prompt", {}),
            "workflow": prompt_workflow.get("workflow", {}),
        }

        ui = {
            "loaded_path": [file_path_str.replace('\\', '/')],
            "loaded_basename": [os.path.basename(file_path_str).replace('\\', '/')],
        }
        return {"ui": ui, "result": (output_image, output_mask, file_path_str.replace('\\', '/'), prompt_workflow, image_ex)}


# The concept is that the context (in our case, the IMAGE_EX muxed data) is allowed to input
# and output from any instance of a context node, with the separate input links taking precedence
# over the context (which is passed in and out as the first input/output)
_all_context_input_output_data = ["image", "mask", "filepath", "prompt", "workflow"]


def new_context(base_ctx, **kwargs):
    """Creates a new context from the provided data, with an optional base ctx to start."""
    context = base_ctx if base_ctx is not None else None
    new_ctx = {}
    for key in _all_context_input_output_data:
        if key == "base_ctx":
            continue
        v = kwargs[key] if key in kwargs else None
        new_ctx[key] = v if v is not None else context[
            key] if context is not None and key in context else None
    return new_ctx


def get_context_return_tuple(ctx):
    return (
        ctx,
        ctx.get("image"),
        ctx.get("mask"),
        ctx.get("filepath") or "",
        ctx.get("prompt") or {},
        ctx.get("workflow") or {},
        ctx.get("edits") or [],
    )


def _copy_image_ex_safely(image_ex: Dict[str, Any] | None) -> Dict[str, Any] | None:
    """Return a copy of the IMAGE_EX dict to avoid mutating the original.
    - Shallow copy the top-level dict.
    - Deep copy mutable sub-objects like prompt/workflow/edits.
    - Keep image/mask references (tensors) to avoid heavy duplication.
    """
    if image_ex is None:
        return None
    import copy
    copied = dict(image_ex)
    if copied.get("prompt") is not None:
        copied["prompt"] = copy.deepcopy(copied["prompt"])
    if copied.get("workflow") is not None:
        copied["workflow"] = copy.deepcopy(copied["workflow"])
    if copied.get("edits") is not None:
        copied["edits"] = copy.deepcopy(copied["edits"])
    return copied


ALL_CTX_OPTIONAL_INPUTS = {
    # The first (optional) input is the context pass-through.
    "image_ex": ("DICT",),
    # The rest are overrides.
    "image": ("IMAGE",),
    "mask": ("MASK",),
    "filepath": ("STRING", {"multiline": False, "forceInput": True}),
    "prompt": ("DICT",),
    "workflow": ("DICT",),
    "edit_list": ("LIST",),
}
ALL_CTX_RETURN_TYPES = ("DICT",     "IMAGE", "MASK", "STRING",   "DICT",   "DICT",     "LIST")
ALL_CTX_RETURN_NAMES = ("IMAGE_EX", "IMAGE", "MASK", "FILEPATH", "PROMPT", "WORKFLOW", "EDIT_LIST")


class ImageExContextOvum:
    NAME = "IMAGE_EX Context"
    CATEGORY = "ovum/image"
    DESCRIPTION = """A context node for IMAGE_EX data. It passes through
IMAGE_EX data, allowing individual fields to be overridden by
explicit inputs. This can be used to modify parts of an
IMAGE_EX data structure without needing to demux and remux it
completely."""

    @classmethod
    def INPUT_TYPES(cls):  # pylint: disable = invalid-name,missing-function-docstring
        return {
            "required": {},
            "optional": ALL_CTX_OPTIONAL_INPUTS,
            "hidden": {},
        }

    RETURN_TYPES = ALL_CTX_RETURN_TYPES
    RETURN_NAMES = ALL_CTX_RETURN_NAMES
    FUNCTION = "convert"

    @classmethod
    def convert(cls, image_ex=None, **kwargs):  # pylint: disable = missing-function-docstring
        ctx = new_context(image_ex, **kwargs)
        ctx = _copy_image_ex_safely(ctx)
        return get_context_return_tuple(ctx)


def _ensure_same_length_active_lists(active_lists: Dict[str, Any]) -> int:
    """Ensure all provided (non-None) inputs are lists and have identical lengths.
    Returns the common length, raises ValueError if mismatch or wrong type."""
    lengths = {}
    for key, val in active_lists.items():
        if val is None:
            continue
        if not isinstance(val, (list, tuple)):
            raise ValueError(f"Input '{key}' must be a list, got {type(val).__name__}")
        lengths[key] = len(val)

    if not lengths:
        return 0

    unique_lengths = set(lengths.values())
    if len(unique_lengths) != 1:
        details = ", ".join([f"{k}={v}" for k, v in lengths.items()])
        raise ValueError(f"All active list inputs must have the same length; got: {details}")

    return next(iter(unique_lengths))


def new_context_list(base_ctx_list=None, **kwargs_lists):
    """Creates a list of contexts from the provided list data, mirroring new_context per element."""
    # Determine active lists (including base image_ex if provided)
    active_lists = {}
    if base_ctx_list is not None:
        active_lists["image_ex"] = base_ctx_list
    for k in _all_context_input_output_data:
        if k in kwargs_lists and kwargs_lists[k] is not None:
            active_lists[k] = kwargs_lists[k]
    # include edit_list in the validation if provided
    if "edit_list" in kwargs_lists and kwargs_lists["edit_list"] is not None:
        active_lists["edit_list"] = kwargs_lists["edit_list"]

    n = _ensure_same_length_active_lists(active_lists)
    if n == 0:
        return []

    ctx_list = []
    for i in range(n):
        base_ctx = base_ctx_list[i] if base_ctx_list is not None else None
        per_item_kwargs = {}
        for key in _all_context_input_output_data:
            lst = kwargs_lists.get(key, None)
            per_item_kwargs[key] = (lst[i] if lst is not None else None)
        # Note: edit_list is intentionally not merged into ctx to mirror single-context behavior.
        ctx_list.append(new_context(base_ctx, **per_item_kwargs))
    return ctx_list


def get_context_return_tuple_list(ctx_list):
    """Return tuple of lists mirroring get_context_return_tuple but for list contexts."""
    images = [ctx.get("image") for ctx in ctx_list]
    masks = [ctx.get("mask") for ctx in ctx_list]
    filepaths = [(ctx.get("filepath") or "") for ctx in ctx_list]
    prompts = [(ctx.get("prompt") or {}) for ctx in ctx_list]
    workflows = [(ctx.get("workflow") or {}) for ctx in ctx_list]
    edits = [(ctx.get("edits") or []) for ctx in ctx_list]
    return (ctx_list, images, masks, filepaths, prompts, workflows, edits)


ALL_CTX_LIST_OPTIONAL_INPUTS = {
    # Pass-through list of IMAGE_EX dicts
    "image_ex": ("LIST",),
    # Overrides as lists
    "image": ("LIST",),
    "mask": ("LIST",),
    "filepath": ("LIST",),
    "prompt": ("LIST",),
    "workflow": ("LIST",),
    "edit_list": ("LIST",),
}
ALL_CTX_LIST_RETURN_TYPES = ("LIST", "LIST", "LIST", "LIST", "LIST", "LIST", "LIST")
ALL_CTX_LIST_RETURN_NAMES = ALL_CTX_RETURN_NAMES


class ImageExContextListOvum:
    NAME = "IMAGE_EX Context (List)"
    CATEGORY = "ovum/image"
    DESCRIPTION = """A context node for lists of IMAGE_EX data. It passes through a list
of IMAGE_EX dicts, allowing individual fields to be overridden by corresponding
lists. All provided list inputs must have the same length."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": ALL_CTX_LIST_OPTIONAL_INPUTS,
            "hidden": {},
        }

    RETURN_TYPES = ALL_CTX_LIST_RETURN_TYPES
    RETURN_NAMES = ALL_CTX_LIST_RETURN_NAMES
    FUNCTION = "convert_list"

    @classmethod
    def convert_list(cls, image_ex=None, **kwargs):
        # Build list of contexts with per-index merge and validate lengths
        ctx_list = new_context_list(image_ex, **kwargs)
        # Return copies of each IMAGE_EX to avoid mutating originals
        ctx_list = [_copy_image_ex_safely(ctx) for ctx in ctx_list]
        return get_context_return_tuple_list(ctx_list)


NODE_CLASS_MAPPINGS = {
    "LoadImageWithWorkflowOvum": LoadImageWithWorkflowOvum,
    "LoadImageFromOutputWithWorkflowOvum": LoadImageFromOutputWithWorkflowOvum,
    "LoadImageFromOutputSubdirectoryWithWorkflowOvum": LoadImageFromOutputSubdirectoryWithWorkflowOvum,
    "ImageExContextOvum": ImageExContextOvum,
    "ImageExContextListOvum": ImageExContextListOvum,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadImageWithWorkflowOvum": "Load Image with Workflow",
    "LoadImageFromOutputWithWorkflowOvum": "Load Image from Output with Workflow",
    "LoadImageFromOutputSubdirectoryWithWorkflowOvum": "Load Image from Output Subdirectory with Workflow",
    "ImageExContextOvum": "IMAGE_EX Context",
    "ImageExContextListOvum": "IMAGE_EX Context (List)",
}

# For ovum's __init__ auto-discovery
CLAZZES = [
    LoadImageWithWorkflowOvum,
    LoadImageFromOutputWithWorkflowOvum,
    LoadImageFromOutputSubdirectoryWithWorkflowOvum,
    ImageExContextOvum,
    ImageExContextListOvum,
]
