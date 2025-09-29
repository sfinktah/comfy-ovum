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
    DESCRIPTION = "Load an image from the input folder and additionally output file path and extracted prompt/workflow metadata."

    # Extend the outputs of LoadImage (IMAGE, MASK)
    # Add: FILE PATH (STRING), PROMPT&WORKFLOW (DICT), IMAGE_EX (DICT)
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "DICT", "DICT")
    RETURN_NAMES = ("IMAGE", "MASK", "FILE PATH", "PROMPT&WORKFLOW", "IMAGE_EX")
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
    def INPUT_TYPES(s):
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


class DemuxImageExOvum:
    NAME = "Demux IMAGE_EX"
    CATEGORY = "ovum/image"
    FUNCTION = "demux"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image_ex": ("DICT",)}}

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "DICT", "DICT")
    RETURN_NAMES = ("IMAGE", "MASK", "FILE PATH", "PROMPT", "WORKFLOW")

    def demux(self, image_ex: Dict[str, Any]):
        image = image_ex.get("image")
        mask = image_ex.get("mask")
        filepath = image_ex.get("filepath") or ""
        prompt = image_ex.get("prompt") or {}
        workflow = image_ex.get("workflow") or {}
        return image, mask, str(filepath), prompt, workflow


class MuxImageExOvum:
    NAME = "Mux IMAGE_EX"
    CATEGORY = "ovum/image"
    FUNCTION = "mux"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "filepath": ("STRING",),
                "prompt": ("DICT",),
                "workflow": ("DICT",),
            }
        }

    RETURN_TYPES = ("DICT",)
    RETURN_NAMES = ("IMAGE_EX",)

    def mux(self, image, mask, filepath: str, prompt: Dict[str, Any], workflow: Dict[str, Any]):
        return ({
            "image": image,
            "mask": mask,
            "filepath": str(filepath),
            "prompt": prompt or {},
            "workflow": workflow or {},
        },)


NODE_CLASS_MAPPINGS = {
    "LoadImageWithWorkflowOvum": LoadImageWithWorkflowOvum,
    "LoadImageFromOutputWithWorkflowOvum": LoadImageFromOutputWithWorkflowOvum,
    "DemuxImageExOvum": DemuxImageExOvum,
    "MuxImageExOvum": MuxImageExOvum,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadImageWithWorkflowOvum": "Load Image with Workflow",
    "LoadImageFromOutputWithWorkflowOvum": "Load Image from Output with Workflow",
    "DemuxImageExOvum": "Demux IMAGE_EX",
    "MuxImageExOvum": "Mux IMAGE_EX",
}

# For ovum's __init__ auto-discovery
CLAZZES = [
    LoadImageWithWorkflowOvum,
    LoadImageFromOutputWithWorkflowOvum,
    DemuxImageExOvum,
    MuxImageExOvum,
]
