import base64
import io
from typing import Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageOps

# Ensure PIL can handle large images
Image.MAX_IMAGE_PIXELS = None


def _tensor_image_to_pil(img_tensor: torch.Tensor) -> Image.Image:
    # Expect (H,W,C) in [0,1]
    if img_tensor.dim() == 3:
        arr = (img_tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr)
    elif img_tensor.dim() == 4:
        # Take first batch
        arr = (img_tensor[0].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr)
    else:
        raise ValueError("Unexpected tensor shape for IMAGE")


def _tensor_mask_to_pil(mask_tensor: torch.Tensor) -> Image.Image:
    # Expect (H,W) or (H,W,1) in [0,1]
    t = mask_tensor
    if t.dim() == 3 and t.shape[-1] == 1:
        t = t.squeeze(-1)
    if t.dim() == 2:
        arr = (t.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="L")
    elif t.dim() == 3 and t.shape[0] == 1:
        arr = (t[0].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="L")
    else:
        # Fallback: try to interpret as normal image
        return _tensor_image_to_pil(t).convert("L")


def _pil_to_tensor_image(img: Image.Image) -> torch.Tensor:
    # Return (H,W,C) float32 [0,1]
    arr = np.array(img).astype(np.float32) / 255.0
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    return torch.from_numpy(arr)


def _pil_to_tensor_mask(img: Image.Image) -> torch.Tensor:
    # Return (H,W) float32 [0,1]
    if img.mode != "L":
        img = img.convert("L")
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


def _make_preview_base64(img: Image.Image, max_side: int = 512) -> str:
    w, h = img.size
    scale = 1.0
    if max(w, h) > max_side and max(w, h) > 0:
        scale = max_side / float(max(w, h))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        img = img.resize((new_w, new_h), Image.LANCZOS)
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    return base64.b64encode(bio.getvalue()).decode("ascii")


class LiveCrop:
    NAME = "Live Crop"
    DESCRIPTION = (
        "Visually crop and expand an image with interactive guides.\n\n"
        "Use sliders (or drag the guides in the node UI) to set crop amounts.\n"
        "Negative values crop from that side; positive values add padding on that side.\n\n"
        "Semantics (per side):\n"
        "- crop_top < 0: removes |value|*height from top. crop_top > 0: pads that many pixels fraction with white.\n"
        "- crop_bottom < 0: removes |value|*height from bottom. crop_bottom > 0: pads bottom.\n"
        "- crop_left < 0: removes |value|*width from left. crop_left > 0: pads left.\n"
        "- crop_right < 0: removes |value|*width from right. crop_right > 0: pads right.\n"
        "All crop/expand parameters are in the range [-1, 1], representing a fraction of the original dimension."
    )

    CATEGORY = "ovum"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "apply"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "crop_top": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider", "tooltip": "Negative crops, positive expands (top)."}),
                "crop_bottom": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider", "tooltip": "Negative crops, positive expands (bottom)."}),
                "crop_left": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider", "tooltip": "Negative crops, positive expands (left)."}),
                "crop_right": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider", "tooltip": "Negative crops, positive expands (right)."}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            }
        }

    @staticmethod
    def _crop_expand_rotate(img: Image.Image, crop_top: float, crop_bottom: float, crop_left: float, crop_right: float, is_mask: bool = False) -> Image.Image:
        width, height = img.size
        # Cropping when negative values
        left = int(width * abs(crop_left)) if crop_left < 0 else 0
        right = width - int(width * abs(crop_right)) if crop_right < 0 else width
        top = int(height * abs(crop_top)) if crop_top < 0 else 0
        bottom = height - int(height * abs(crop_bottom)) if crop_bottom < 0 else height
        img = img.crop((left, top, right, bottom))

        # Expanding when positive values (use white for image, 255 for mask)
        if crop_top > 0:
            pad = int(height * crop_top)
            img = ImageOps.expand(img, border=(0, pad, 0, 0), fill=(255 if is_mask else (255, 255, 255)))
        if crop_bottom > 0:
            pad = int(height * crop_bottom)
            img = ImageOps.expand(img, border=(0, 0, 0, pad), fill=(255 if is_mask else (255, 255, 255)))
        if crop_left > 0:
            pad = int(width * crop_left)
            img = ImageOps.expand(img, border=(pad, 0, 0, 0), fill=(255 if is_mask else (255, 255, 255)))
        if crop_right > 0:
            pad = int(width * crop_right)
            img = ImageOps.expand(img, border=(0, 0, pad, 0), fill=(255 if is_mask else (255, 255, 255)))

        # No rotation applied (rotation functionality removed)
        return img

    def apply(self, crop_top, crop_bottom, crop_left, crop_right, image=None, mask=None):
        out_images = []
        out_masks = []
        preview_img: Optional[Image.Image] = None

        if image is not None:
            # image is a batch (N,H,W,C)
            for i in range(image.shape[0]):
                pil = _tensor_image_to_pil(image[i])
                if preview_img is None:
                    preview_img = pil.copy()
                pil2 = self._crop_expand_rotate(pil, crop_top, crop_bottom, crop_left, crop_right, is_mask=False)
                out_images.append(_pil_to_tensor_image(pil2))

        if mask is not None:
            for i in range(mask.shape[0]):
                mpil = _tensor_mask_to_pil(mask[i])
                mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True)
                out_masks.append(_pil_to_tensor_mask(mpil2))

        image_out = torch.stack(out_images, dim=0) if out_images else None
        mask_out = torch.stack(out_masks, dim=0) if out_masks else None

        ui = None
        try:
            if preview_img is None and image is not None and image.shape[0] > 0:
                preview_img = _tensor_image_to_pil(image[0])
            if preview_img is not None:
                # draw nothing; frontend will overlay guides based on widgets
                b64 = _make_preview_base64(preview_img)
                ui = {"live_crop": [b64]}
        except Exception:
            pass

        if ui:
            print("[LiveCrop] outputting UI\n")
            return {"ui": ui, "result": (image_out, mask_out)}
        print("[LiveCrop] not outputting UI\n")
        return image_out, mask_out


CLAZZES = [LiveCrop]
