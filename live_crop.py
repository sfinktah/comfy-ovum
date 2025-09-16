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

def _flatten_image_like(image):
    """
    Yield (is_mask, tensor(H,W,C or H,W or H,W,1)) for any supported input:
    - torch.Tensor 3D (H,W,C) image
    - torch.Tensor 4D (N,H,W,C) image batch
    - list/tuple of any of the above (recursively)
    """
    if image is None:
        return
    # Tensor case
    if isinstance(image, torch.Tensor):
        if image.dim() == 3:
            yield (False, image)
        elif image.dim() == 4:
            for i in range(image.shape[0]):
                yield (False, image[i])
        else:
            raise ValueError("Unsupported IMAGE tensor dims (expected 3D or 4D).")
    # List/tuple case
    elif isinstance(image, (list, tuple)):
        for item in image:
            # Recurse
            for out in _flatten_image_like(item):
                yield out
    else:
        raise ValueError("Unsupported IMAGE type; expected torch.Tensor or list/tuple.")

def _flatten_mask_like(mask):
    if mask is None:
        return
    if isinstance(mask, torch.Tensor):
        if mask.dim() == 2 or (mask.dim() == 3 and (mask.shape[-1] == 1 or mask.shape[0] == 1)):
            yield (True, mask)
        elif mask.dim() == 3:
            # Could be (N,H,W) mask batch
            if mask.shape[0] > 1 and mask.shape[-1] != 1:
                for i in range(mask.shape[0]):
                    yield (True, mask[i])
            else:
                yield (True, mask)
        elif mask.dim() == 4:
            for i in range(mask.shape[0]):
                yield (True, mask[i])
        else:
            raise ValueError("Unsupported MASK tensor dims.")
    elif isinstance(mask, (list, tuple)):
        for item in mask:
            for out in _flatten_mask_like(item):
                yield out
    else:
        raise ValueError("Unsupported MASK type; expected torch.Tensor or list/tuple.")

class LiveCrop:
    NAME = "Live Crop"
    DESCRIPTION = (
        "Visually crop an image with interactive guides.\n\n"
        "Use sliders or drag the red guides in the node UI to set crop amounts.\n"
        "Negative values crop from that side.\n\n"
        "Semantics (per side):\n"
        "- crop_top < 0: removes |value|*height from top.\n"
        "- crop_bottom < 0: removes |value|*height from bottom.\n"
        "- crop_left < 0: removes |value|*width from left.\n"
        "- crop_right < 0: removes |value|*width from right.\n"
        "All crop parameters are in the range [-1, 0], representing a fraction of the original dimension."
    )

    CATEGORY = "ovum"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "apply"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "crop_top": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.01, "display": "slider", "tooltip": "Negative values crop from top."}),
                "crop_bottom": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.01, "display": "slider", "tooltip": "Negative values crop from bottom."}),
                "crop_left": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.01, "display": "slider", "tooltip": "Negative values crop from left."}),
                "crop_right": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.01, "display": "slider", "tooltip": "Negative values crop from right."}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            }
        }

    @staticmethod
    def _crop_expand_rotate(img: Image.Image, crop_top: float, crop_bottom: float, crop_left: float, crop_right: float, is_mask: bool = False) -> Image.Image:
        width, height = img.size
        # Only cropping (negative values only)
        left = int(width * abs(crop_left)) if crop_left < 0 else 0
        right = width - int(width * abs(crop_right)) if crop_right < 0 else width
        top = int(height * abs(crop_top)) if crop_top < 0 else 0
        bottom = height - int(height * abs(crop_bottom)) if crop_bottom < 0 else height
        img = img.crop((left, top, right, bottom))

        # No padding or rotation applied
        return img

    def apply(self, crop_top, crop_bottom, crop_left, crop_right, image=None, mask=None):
        out_images = []
        out_masks = []
        previews = []

        # Process images from any accepted form (single, batch, list, or list of batches)
        if image is not None:
            count = 0
            for _is_mask, img_t in _flatten_image_like(image):
                pil = _tensor_image_to_pil(img_t)
                if count < 3:
                    previews.append(pil.copy())
                pil2 = self._crop_expand_rotate(pil, crop_top, crop_bottom, crop_left, crop_right, is_mask=False)
                out_images.append(_pil_to_tensor_image(pil2))
                count += 1

        # Process masks likewise
        if mask is not None:
            for _is_mask, m_t in _flatten_mask_like(mask):
                mpil = _tensor_mask_to_pil(m_t)
                mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True)
                out_masks.append(_pil_to_tensor_mask(mpil2))

        image_out = torch.stack(out_images, dim=0) if out_images else None
        mask_out = torch.stack(out_masks, dim=0) if out_masks else None

        ui = None
        try:
            # Prefer previews we built; if none and we had image tensor(s), fallback to first item
            if not previews and image is not None:
                # Try to extract first image for preview
                for _is_mask, img_t in _flatten_image_like(image):
                    previews = [_tensor_image_to_pil(img_t)]
                    break

            if previews:
                b64s = [_make_preview_base64(p) for p in previews[:3]]
                ui = {"live_crop": b64s}
        except Exception:
            pass

        if ui:
            print("[LiveCrop] outputting UI\n")
            return {"ui": ui, "result": (image_out, mask_out)}
        print("[LiveCrop] not outputting UI\n")
        return image_out, mask_out


CLAZZES = [LiveCrop]
