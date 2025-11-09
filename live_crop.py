import base64
import io
from pathlib import Path
from typing import Optional, Tuple, Any, Dict, List, Type

import numpy as np
import torch
from PIL import Image, ImageOps
import os

# Ensure PIL can handle large images
Image.MAX_IMAGE_PIXELS = None

# --- Cached directory listing for rotating temp files ---
_LIVE_CROP_TEMP_CACHE: Dict[str, Dict[str, Any]] = {}


def find_first_tensor(x):
    if isinstance(x, torch.Tensor):
        return x
    if isinstance(x, (list, tuple)):
        for e in x:
            r = find_first_tensor(e)
            if r is not None:
                return r
    return None


def _parse_temp_index_from_name(name: str, prefix: str = "livecrop_temp_", suffix: str = ".png") -> Optional[int]:
    if name.startswith(prefix) and name.endswith(suffix):
        mid = name[len(prefix):-len(suffix)]
        if len(mid) == 3 and mid.isdigit():
            idx = int(mid)
            if 0 <= idx <= 999:
                return idx
    return None

def _scan_temp_dir(out_dir: str) -> Dict[str, Any]:
    existing_indices: set[int] = set()
    mtime_by_index: Dict[int, float] = {}
    oldest_index: Optional[int] = None
    oldest_mtime: Optional[float] = None
    oldest_path: Optional[str] = None
    try:
        with os.scandir(out_dir) as it:
            for entry in it:
                try:
                    if not entry.is_file():
                        continue
                    idx = _parse_temp_index_from_name(entry.name)
                    if idx is None:
                        continue
                    try:
                        mtime = entry.stat().st_mtime
                    except Exception:
                        # Prefer overwriting files we can't stat by treating them as very old
                        mtime = float("-inf")
                    existing_indices.add(idx)
                    mtime_by_index[idx] = mtime
                    if oldest_mtime is None or mtime < oldest_mtime:
                        oldest_mtime = mtime
                        oldest_index = idx
                        oldest_path = entry.path
                except Exception:
                    # Ignore individual entry errors
                    continue
    except Exception:
        # Ignore scan errors; return whatever we have
        pass
    return {
        "existing_indices": existing_indices,
        "mtime_by_index": mtime_by_index,
        "oldest_index": oldest_index,
        "oldest_mtime": oldest_mtime,
        "oldest_path": oldest_path,
        "prefix": "livecrop_temp_",
        "suffix": ".png",
    }

def _get_temp_dir_cache(out_dir: str) -> Dict[str, Any]:
    cache = _LIVE_CROP_TEMP_CACHE.get(out_dir)
    if cache is None:
        cache = _scan_temp_dir(out_dir)
        _LIVE_CROP_TEMP_CACHE[out_dir] = cache
    return cache

def _refresh_temp_dir_cache(out_dir: str) -> Dict[str, Any]:
    cache = _scan_temp_dir(out_dir)
    _LIVE_CROP_TEMP_CACHE[out_dir] = cache
    return cache

def _select_temp_path_from_cache(out_dir: str) -> Tuple[str, Optional[float]]:
    cache = _get_temp_dir_cache(out_dir)
    existing_indices: set[int] = cache["existing_indices"]
    prefix: str = cache["prefix"]
    suffix: str = cache["suffix"]
    if len(existing_indices) < 1000:
        for i in range(1000):
            if i not in existing_indices:
                return os.path.join(out_dir, f"{prefix}{i:03d}{suffix}"), None
    # All slots present; choose oldest
    oldest_path: Optional[str] = cache.get("oldest_path")
    oldest_mtime: Optional[float] = cache.get("oldest_mtime")
    if oldest_path is None:
        # Fallback
        oldest_path = os.path.join(out_dir, f"{prefix}000{suffix}")
        oldest_mtime = None
    return oldest_path, oldest_mtime

def _validate_selection_against_cache(path: str, expected_mtime: Optional[float]) -> bool:
    try:
        if expected_mtime is None:
            # Expected free slot; ensure it still does not exist
            return not os.path.exists(path)
        # Expected existing file; ensure mtime matches cached value
        st = os.stat(path)
        return getattr(st, "st_mtime", None) == expected_mtime
    except Exception:
        # On error, treat as invalid selection so we refresh
        return False

def _update_cache_after_write(out_dir: str, path: str) -> None:
    cache = _get_temp_dir_cache(out_dir)
    name = os.path.basename(path)
    idx = _parse_temp_index_from_name(name, cache["prefix"], cache["suffix"])
    try:
        mtime = os.path.getmtime(path)
    except Exception:
        mtime = None
    if idx is not None:
        cache["existing_indices"].add(idx)
        if mtime is not None:
            cache["mtime_by_index"][idx] = mtime
    # Recompute oldest if we have all slots; else clear oldest fields
    if len(cache["existing_indices"]) >= 1000 and cache["mtime_by_index"]:
        min_idx: Optional[int] = None
        min_mtime: Optional[float] = None
        for i, mt in cache["mtime_by_index"].items():
            if mt is None:
                continue
            if min_mtime is None or mt < min_mtime:
                min_mtime = mt
                min_idx = i
        if min_idx is not None:
            cache["oldest_index"] = min_idx
            cache["oldest_mtime"] = min_mtime
            cache["oldest_path"] = os.path.join(out_dir, f"{cache['prefix']}{min_idx:03d}{cache['suffix']}")
    else:
        cache["oldest_index"] = None
        cache["oldest_mtime"] = None
        cache["oldest_path"] = None
    _LIVE_CROP_TEMP_CACHE[out_dir] = cache


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

# --- LiveCrop Edit classes (JSON-representable) ---
class _LiveCropEdit:
    type_name: str = ""
    def to_json(self) -> Dict[str, Any]:
        return {"type": self.type_name}
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "_LiveCropEdit":
        t = data.get("type")
        mapping: Dict[str, Type[_LiveCropEdit]] = {
            "LiveCropRotate": LiveCropRotate if 'LiveCropRotate' in globals() else None,
            "LiveCropBoundBoxPercent": LiveCropBoundBoxPercent if 'LiveCropBoundBoxPercent' in globals() else None,
            "LiveCropImageEffect": LiveCropImageEffect if 'LiveCropImageEffect' in globals() else None,
            "LiveCropTemporaryCopy": LiveCropTemporaryCopy if 'LiveCropTemporaryCopy' in globals() else None,
        }
        cls2 = mapping.get(t)
        if cls2 is None:
            return _LiveCropEdit()
        return cls2.from_json(data)  # type: ignore

class LiveCropRotate(_LiveCropEdit):
    type_name = "LiveCropRotate"
    def __init__(self, degrees: int = 0):
        self.degrees = int(degrees)
    def to_json(self) -> Dict[str, Any]:
        return {"type": self.type_name, "degrees": int(self.degrees)}
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "LiveCropRotate":
        return cls(int(data.get("degrees", 0)))

class LiveCropBoundBoxPercent(_LiveCropEdit):
    type_name = "LiveCropBoundBoxPercent"
    def __init__(self, left: float, top: float, width: float, height: float):
        self.left = float(left); self.top = float(top)
        self.width = float(width); self.height = float(height)
    def to_json(self) -> Dict[str, Any]:
        return {"type": self.type_name, "left": self.left, "top": self.top, "width": self.width, "height": self.height}
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "LiveCropBoundBoxPercent":
        return cls(float(data.get("left", 0.0)), float(data.get("top", 0.0)), float(data.get("width", 1.0)), float(data.get("height", 1.0)))

class LiveCropImageEffect(_LiveCropEdit):
    type_name = "LiveCropImageEffect"
    def __init__(self):
        pass
    def to_json(self) -> Dict[str, Any]:
        return {"type": self.type_name}
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "LiveCropImageEffect":
        return cls()

class LiveCropTemporaryCopy(_LiveCropEdit):
    type_name = "LiveCropTemporaryCopy"
    def __init__(self, path: str):
        self.path = path
    def to_json(self) -> Dict[str, Any]:
        return {"type": self.type_name, "path": self.path}
    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "LiveCropTemporaryCopy":
        return cls(str(data.get("path", "")))


class LiveCrop:
    NAME = "LiveCrop"
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
    # IMAGE, MASK, IMAGE_EX, BBOX, BBOX%
    RETURN_TYPES = ("DICT",     "IMAGE", "MASK", "LIST", "LIST")
    RETURN_NAMES = ("IMAGE_EX", "image", "mask", "BBOX", "BBOX%")
    FUNCTION = "apply"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "crop_top": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.001, "display": "slider", "tooltip": "Negative values crop from top."}),
                "crop_bottom": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.001, "display": "slider", "tooltip": "Negative values crop from bottom."}),
                "crop_left": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.001, "display": "slider", "tooltip": "Negative values crop from left."}),
                "crop_right": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 0.0, "step": 0.001, "display": "slider", "tooltip": "Negative values crop from right."}),
                "rotate_degrees": ("INT", {"default": 0, "min": -180, "max": 180, "step": 90, "tooltip": "Rotate by multiples of 90 degrees."}),
            },
            "optional": {
                "image_ex": ("DICT",),
                "image": ("IMAGE",),
                "mask": ("MASK",),
            }
        }

    @staticmethod
    def _crop_expand_rotate(img: Image.Image, crop_top: float, crop_bottom: float, crop_left: float, crop_right: float, is_mask: bool = False, rotate_degrees: int = 0) -> Image.Image:
        width, height = img.size
        # Only cropping (negative values only)
        left = int(width * abs(crop_left)) if crop_left < 0 else 0
        right = width - int(width * abs(crop_right)) if crop_right < 0 else width
        top = int(height * abs(crop_top)) if crop_top < 0 else 0
        bottom = height - int(height * abs(crop_bottom)) if crop_bottom < 0 else height
        img = img.crop((left, top, right, bottom))

        # Rotation in 90 degree increments
        r = int(rotate_degrees) % 360
        if r != 0:
            # PIL rotates counter-clockwise; expand is implied for 90-k multiples
            img = img.rotate(-r, expand=True)  # negative for right-rotation visual consistency
        return img

    def apply(self, crop_top, crop_bottom, crop_left, crop_right, rotate_degrees, image=None, mask=None, image_ex=None):
        previews = []
        original_sizes = []

        def add_preview_from_tensor(img_t):
            if len(previews) >= 3:
                return
            try:
                pil = _tensor_image_to_pil(img_t)
                previews.append(pil.copy())
                original_sizes.append(pil.size)
            except Exception:
                pass

        def process_image_tensor(t: torch.Tensor):
            nonlocal bbox_px, bbox_pct
            # Single image (H, W, C)
            if t.dim() == 3:
                add_preview_from_tensor(t)
                pil = _tensor_image_to_pil(t)
                # Compute bbox against original orientation
                W, H = pil.size
                l_px = int(W * abs(crop_left)) if crop_left < 0 else 0
                r_px = int(W * abs(crop_right)) if crop_right < 0 else 0
                t_px = int(H * abs(crop_top)) if crop_top < 0 else 0
                b_px = int(H * abs(crop_bottom)) if crop_bottom < 0 else 0
                x = l_px
                y = t_px
                w = max(0, W - l_px - r_px)
                h = max(0, H - t_px - b_px)
                bbox_px = [x, y, w, h]
                bbox_pct = [x / W if W else 0.0, y / H if H else 0.0, (w / W) if W else 0.0, (h / H) if H else 0.0]
                pil2 = self._crop_expand_rotate(pil, crop_top, crop_bottom, crop_left, crop_right, is_mask=False, rotate_degrees=rotate_degrees)
                return _pil_to_tensor_image(pil2)
            # Batch (N, H, W, C)
            if t.dim() == 4:
                parts = []
                for i in range(t.shape[0]):
                    add_preview_from_tensor(t[i])
                    pil = _tensor_image_to_pil(t[i])
                    if i == 0:
                        W, H = pil.size
                        l_px = int(W * abs(crop_left)) if crop_left < 0 else 0
                        r_px = int(W * abs(crop_right)) if crop_right < 0 else 0
                        t_px = int(H * abs(crop_top)) if crop_top < 0 else 0
                        b_px = int(H * abs(crop_bottom)) if crop_bottom < 0 else 0
                        x = l_px; y = t_px
                        w = max(0, W - l_px - r_px)
                        h = max(0, H - t_px - b_px)
                        bbox_px = [x, y, w, h]
                        bbox_pct = [x / W if W else 0.0, y / H if H else 0.0, (w / W) if W else 0.0, (h / H) if H else 0.0]
                    pil2 = self._crop_expand_rotate(pil, crop_top, crop_bottom, crop_left, crop_right, is_mask=False, rotate_degrees=rotate_degrees)
                    parts.append(_pil_to_tensor_image(pil2))
                return torch.stack(parts, dim=0) if parts else t
            raise ValueError("Unsupported IMAGE tensor dims (expected 3D or 4D).")

        def process_image_like(x):
            if x is None:
                return None
            if isinstance(x, torch.Tensor):
                return process_image_tensor(x)
            if isinstance(x, (list, tuple)):
                # Preserve container type and nesting
                out_seq = [process_image_like(e) for e in x]
                return type(x)(out_seq)
            raise ValueError("Unsupported IMAGE type; expected torch.Tensor or list/tuple.")

        def process_mask_tensor(t: torch.Tensor):
            # 2D mask (H, W)
            if t.dim() == 2:
                mpil = _tensor_mask_to_pil(t)
                mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True, rotate_degrees=rotate_degrees)
                return _pil_to_tensor_mask(mpil2)
            # 3D cases
            if t.dim() == 3:
                # (H, W, 1)
                if t.shape[-1] == 1:
                    mpil = _tensor_mask_to_pil(t)
                    mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True, rotate_degrees=rotate_degrees)
                    out2d = _pil_to_tensor_mask(mpil2)
                    return out2d.unsqueeze(-1)
                # (1, H, W)
                if t.shape[0] == 1:
                    mpil = _tensor_mask_to_pil(t)
                    mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True, rotate_degrees=rotate_degrees)
                    out2d = _pil_to_tensor_mask(mpil2)
                    return out2d.unsqueeze(0)
                # (N, H, W) batch
                parts = []
                for i in range(t.shape[0]):
                    mpil = _tensor_mask_to_pil(t[i])
                    mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True, rotate_degrees=rotate_degrees)
                    parts.append(_pil_to_tensor_mask(mpil2))
                return torch.stack(parts, dim=0) if parts else t
            # 4D masks: (N, H, W, C), preserve C
            if t.dim() == 4:
                last_c = t.shape[-1]
                parts = []
                for i in range(t.shape[0]):
                    mpil = _tensor_mask_to_pil(t[i])
                    mpil2 = self._crop_expand_rotate(mpil, crop_top, crop_bottom, crop_left, crop_right, is_mask=True, rotate_degrees=rotate_degrees)
                    m2d = _pil_to_tensor_mask(mpil2)  # (H, W)
                    if last_c == 1:
                        m3d = m2d.unsqueeze(-1)  # (H, W, 1)
                    else:
                        # replicate across channels to preserve original dimensionality
                        m3d = m2d.unsqueeze(-1).repeat(1, 1, last_c)  # (H, W, C)
                    parts.append(m3d)
                return torch.stack(parts, dim=0) if parts else t
            raise ValueError("Unsupported MASK tensor dims.")

        def process_mask_like(x):
            if x is None:
                return None
            if isinstance(x, torch.Tensor):
                return process_mask_tensor(x)
            if isinstance(x, (list, tuple)):
                out_seq = [process_mask_like(e) for e in x]
                return type(x)(out_seq)
            raise ValueError("Unsupported MASK type; expected torch.Tensor or list/tuple.")

        # If IMAGE_EX provided, prefer its image/mask when explicit not provided
        if image is None and isinstance(image_ex, dict):
            image = image_ex.get("image", None)
        if mask is None and isinstance(image_ex, dict):
            mask = image_ex.get("mask", None)

        bbox_px: List[int] = [0, 0, 0, 0]
        bbox_pct: List[float] = [0.0, 0.0, 0.0, 0.0]

        image_out = process_image_like(image) if image is not None else None
        mask_out = process_mask_like(mask) if mask is not None else None

        # Build IMAGE_EX passthrough with edits
        img_ex_out: Dict[str, Any] = {}
        if isinstance(image_ex, dict):
            # shallow copy passthrough of known and unknown fields
            img_ex_out.update(image_ex)
        # overwrite with new image/mask and add image_edits
        img_ex_out["image"] = image_out
        img_ex_out["mask"] = mask_out
        # noinspection PyListCreation
        edits: List[Dict[str, Any]] = []
        # Rotation edit
        edits.append(LiveCropRotate(int(rotate_degrees or 0)).to_json())
        # BBOX% edit
        edits.append(LiveCropBoundBoxPercent(float(bbox_pct[0]), float(bbox_pct[1]), float(bbox_pct[2]), float(bbox_pct[3])).to_json())
        # Placeholder ImageEffect
        edits.append(LiveCropImageEffect().to_json())

        # Save temporary copy
        temp_path = None
        try:
            # Save first preview of image_out if possible
            first_tensor = None
            first_tensor = find_first_tensor(image_out)
            if first_tensor is not None:
                pil = _tensor_image_to_pil(first_tensor if first_tensor.dim() == 3 else first_tensor[0])
                import os
                out_dir = os.path.join("output", "livecrop")
                os.makedirs(out_dir, exist_ok=True)

                # Use cached directory listing; validate selected path and refresh if needed
                selected_path, expected_mtime = _select_temp_path_from_cache(out_dir)
                if not _validate_selection_against_cache(selected_path, expected_mtime):
                    _refresh_temp_dir_cache(out_dir)
                    selected_path, expected_mtime = _select_temp_path_from_cache(out_dir)

                temp_path = selected_path
                pil.save(temp_path)

                # Update cache after write to keep it current
                _update_cache_after_write(out_dir, temp_path)
        except Exception:
            temp_path = None
        if temp_path:
            edits.append(LiveCropTemporaryCopy(temp_path.replace('\\', '/')).to_json())

        img_ex_out["image_edits"] = edits

        ui = None
        try:
            # If we didn't collect previews above, find the first tensor and preview it
            width = None
            height = None
            if not previews and image is not None:
                print("[ovum.livecrop] this point can actually be reached (#234)")
                t0 = find_first_tensor(image)
                if t0 is not None:
                    previews = [_tensor_image_to_pil(t0)]
                    width, height = t0.size if t0 else (None, None)

            if previews:
                b64s = [_make_preview_base64(p) for p in previews[:3]]
                ui = {
                    "live_crop": b64s,
                    "original_dimensions": original_sizes
                }
                # Add filenames from image_ex filepath if available
                if isinstance(image_ex, dict) and "filepath" in image_ex:
                    filepath = image_ex.get("filepath")
                    if filepath and isinstance(filepath, str):
                        ui["filenames"] = [Path(filepath).stem]
        except Exception:
            pass

        if ui:
            # print("[LiveCrop] outputting UI\n")
            return {
                "ui": ui,
                "result": (img_ex_out, image_out, mask_out, bbox_px, bbox_pct)
            }
        # print("[LiveCrop] not outputting UI\n")
        return img_ex_out, image_out, mask_out, bbox_px, bbox_pct


CLAZZES = [LiveCrop]
