from typing import Callable, Optional, Type
import types

# noinspection PyPackageRequirements
import torch
from nodes import NODE_CLASS_MAPPINGS

_FLAG = '_is_cudnn_wrapped'
_FN_PREFIX = '_cudnn_wrapped_'
_CATEGORY_DEFAULT = 'ovum/cudnn_wrapped_nodes'


def _detect_gpu_vendor_str() -> str:
    """
    Lightweight detection similar to AmdNvidiaIfElseOvum._detect_gpu_vendor
    Returns a lower-signal string that may contain vendor hints.
    """
    try:
        s = ""
        try:
            if torch.cuda.is_available():
                s = torch.cuda.get_device_name(0)
        except Exception:
            pass
        # Add hints from version info (HIP indicates AMD/PyTorch ROCm builds)
        try:
            hip = getattr(getattr(torch, "version", object()), "hip", None)
            if hip:
                s = (s + " AMD ").strip()
        except Exception:
            pass
        # ZLUDA env hint
        import os
        if os.environ.get("ZLUDA", "") or os.environ.get("ZLUDA_ROOT", ""):
            s = (s + " ZLUDA").strip()
        return s
    except Exception:
        return ""


def _is_amd_like() -> bool:
    vstr = _detect_gpu_vendor_str()
    vlow = vstr.lower()
    # mirror logic used by AmdNvidiaIfElseOvum
    return ("amd " in vstr) or ("zluda" in vlow)


def _print_cudnn_change(target_value: bool, prev_enabled: bool, prev_benchmark: bool):
    # Match CUDNNToggleOvum console output exactly
    if target_value != prev_enabled:
        print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.enabled set to {target_value} (was {prev_enabled})")
    else:
        print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.enabled still set to {target_value}")

    if target_value != prev_benchmark:
        print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.benchmark set to {target_value} (was {prev_benchmark})")
    else:
        print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.benchmark still set to {target_value}")


def _wrap_function_with_cudnn_disable(callable_fn: Callable) -> Callable:
    def wrapped(node, *args, **kwargs):
        if not _is_amd_like():
            try:
                prev_enabled = torch.backends.cudnn.enabled
                prev_benchmark = torch.backends.cudnn.benchmark
            except Exception:
                prev_enabled = False
                prev_benchmark = False
            print(
                f"[OVUM_CDDN_TOGGLE] AMD GPU not detected; cudnn settings unchanged "
                f"(enabled={prev_enabled}, benchmark={prev_benchmark})"
            )
            return callable_fn(node, *args, **kwargs)

        # Save current state
        prev_enabled = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark

        # Disable while running
        torch.backends.cudnn.enabled = False
        torch.backends.cudnn.benchmark = False
        _print_cudnn_change(False, prev_enabled, prev_benchmark)

        try:
            return callable_fn(node, *args, **kwargs)
        finally:
            # Restore
            cur_enabled = torch.backends.cudnn.enabled
            cur_benchmark = torch.backends.cudnn.benchmark
            torch.backends.cudnn.enabled = prev_enabled
            torch.backends.cudnn.benchmark = prev_benchmark
            # Print messages reflecting the change back to original
            _print_cudnn_change(prev_enabled, cur_enabled, cur_benchmark)
    return wrapped


def create_cudnn_wrapped_node(class_to_wrap: Type,
                              new_name: Optional[str] = None,
                              new_category: Optional[str] = None) -> Optional[Type]:
    """
    Returns a new Type which subclasses `class_to_wrap` and whose FUNCTION method
    is wrapped to temporarily disable cudnn for AMD users during the call, then restore.
    """
    if getattr(class_to_wrap, _FLAG, False):
        # already wrapped
        return None

    new_name = new_name or f"cudnn_wrapped_{class_to_wrap.__name__}"
    if new_name in NODE_CLASS_MAPPINGS:
        # name collision; avoid duplicate registration
        return None

    new_class = types.new_class(new_name, (class_to_wrap,))
    function_name = getattr(new_class, 'FUNCTION')
    original_fn = getattr(new_class, function_name)
    wrapped_function = _wrap_function_with_cudnn_disable(original_fn)

    setattr(new_class, f"{_FN_PREFIX}{function_name}", wrapped_function)
    setattr(new_class, 'FUNCTION', f"{_FN_PREFIX}{function_name}")
    setattr(new_class, 'CATEGORY', new_category or _CATEGORY_DEFAULT)
    setattr(new_class, _FLAG, True)

    return new_class


essential_doc = (
    "Temporarily disables torch.backends.cudnn.* during node execution for AMD/ZLUDA users, "
    "restoring the previous settings afterward, and printing the same console output format "
    "as CUDNNToggleOvum."
)


def create_cudnn_wrapped_version(class_key: str) -> Optional[Type]:
    """Create and register cudnn_wrapped_{class_key} in NODE_CLASS_MAPPINGS."""
    class_to_wrap = NODE_CLASS_MAPPINGS[class_key]
    converted = create_cudnn_wrapped_node(class_to_wrap)
    if converted:
        # Attach a brief DESCRIPTION if the base class has one
        try:
            desc = getattr(converted, 'DESCRIPTION', None)
            if not desc:
                setattr(converted, 'DESCRIPTION', essential_doc)
        except Exception:
            pass
        NODE_CLASS_MAPPINGS[f"cudnn_wrapped_{class_key}"] = converted
    return converted


def convert_to_cudnn_wrapped_inplace(class_key: str) -> bool:
    """Replace NODE_CLASS_MAPPINGS[class_key] with a cudnn-wrapped version in-place."""
    class_to_wrap = NODE_CLASS_MAPPINGS[class_key]
    converted = create_cudnn_wrapped_node(
        class_to_wrap,
        new_name=class_to_wrap.__name__,
        new_category=class_to_wrap.CATEGORY,
    )
    if converted:
        try:
            desc = getattr(converted, 'DESCRIPTION', None)
            if not desc:
                setattr(converted, 'DESCRIPTION', essential_doc)
        except Exception:
            pass
        NODE_CLASS_MAPPINGS[class_key] = converted
        return True
    return False


def is_cudnn_wrapped(class_key: str) -> bool:
    cls = NODE_CLASS_MAPPINGS[class_key]
    return getattr(cls, _FLAG, False)
