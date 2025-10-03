from __future__ import annotations
from typing import Any, Dict, Tuple

import json

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
        return super().INPUT_TYPES()

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

        return output_image, output_mask, file_path_str.replace('\\', '/'), prompt_workflow, image_ex


class LoadImageFromOutputWithWorkflowOvum(LoadImageWithWorkflowOvum):
    DESCRIPTION = "Load an image from the output folder with workflow metadata."
    EXPERIMENTAL = True

    @classmethod
    def INPUT_TYPES(cls):
        # Mirror nodes.LoadImageOutput INPUT_TYPES but we still want to keep LoadImage behavior
        return {
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
        return get_context_return_tuple(ctx)


NODE_CLASS_MAPPINGS = {
    "LoadImageWithWorkflowOvum": LoadImageWithWorkflowOvum,
    "LoadImageFromOutputWithWorkflowOvum": LoadImageFromOutputWithWorkflowOvum,
    "ImageExContextOvum": ImageExContextOvum,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadImageWithWorkflowOvum": "Load Image with Workflow",
    "LoadImageFromOutputWithWorkflowOvum": "Load Image from Output with Workflow",
    "ImageExContextOvum": "IMAGE_EX Context",
}

# For ovum's __init__ auto-discovery
CLAZZES = [
    LoadImageWithWorkflowOvum,
    LoadImageFromOutputWithWorkflowOvum,
    ImageExContextOvum,
]
