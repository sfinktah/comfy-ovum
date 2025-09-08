import os
import hashlib

class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __ne__(self, __value: object) -> bool:
        return False

anyType = AnyType("*")

# Security: block dangerous environment variables that can alter process execution
# or dynamic loading behavior across platforms, or affect ComfyUI in risky ways.
DANGEROUS_ENV_EXACT = {
    # Linux/glibc dynamic loader
    "LD_PRELOAD",
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "LD_PROFILE",
    "LD_SHOW_AUXV",
    "LD_USE_LOAD_BIAS",
    "LD_TRACE_LOADED_OBJECTS",
    # Python process behavior
    "PYTHONPATH",
    "PYTHONHOME",
    "PYTHONSTARTUP",
    # Shell initialization/injection vectors
    "BASH_ENV",
    "ENV",
    "IFS",
    "SHELL",
    # Execution and command resolution
    "PATH",
    "PATHEXT",
    # Windows specific
    "COMSPEC",
    "SYSTEMROOT",
    "WINDIR",
    # macOS dynamic loader
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "DYLD_FRAMEWORK_PATH",
    "DYLD_FALLBACK_LIBRARY_PATH",
    "DYLD_ROOT_PATH",
    "DYLD_SHARED_REGION",
    # Misc loader/localization paths
    "GCONV_PATH",
    "LOCPATH",
}

DANGEROUS_ENV_PREFIXES = (
    "LD_",      # GNU/Linux loader variables
    "DYLD_",    # macOS loader variables
    "COMFYUI_", # Guard ComfyUI-wide toggles
)

def _normalize_env_name(name: str) -> str:
    return str(name).strip().upper() if isinstance(name, str) else ""

def _is_blocked_env(name: str) -> bool:
    n = _normalize_env_name(name)
    if not n:
        return False
    if n in DANGEROUS_ENV_EXACT:
        return True
    return any(n.startswith(p) for p in DANGEROUS_ENV_PREFIXES)

class SetEnvVar:
    NAME = "Set Environment Variable"
    DESCRIPTION ="""
    Set an environment variable. `os.environ[name] = value`
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_input": (anyType, {
                    "tooltip": "Optional passthrough input to enforce execution order; forwarded unchanged."
                }),
            },
            "required": {
                "name": ("STRING", {
                    "default": "",
                    "tooltip": "Environment variable name (e.g., PATH, MY_API_KEY)."
                }),
                "value": ("STRING", {
                    "default": "",
                    "tooltip": "Value to assign to the environment variable."
                }),
                "overwrite": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "If false, keep an existing value and do not change it."
                }),
            },
        }

    RETURN_TYPES = (anyType, "BOOLEAN", "STRING")
    RETURN_NAMES = ("any_output", "applied", "prev_value")
    FUNCTION = "set_env"
    CATEGORY = "ovum"
    OUTPUT_NODE = True

    def set_env(self, name, value, overwrite, any_input=None):
        if not isinstance(name, str) or len(name) == 0:
            print("[set_env] name is empty; no changes applied.")
            return (any_input, False, "")
        if _is_blocked_env(name):
            print(f"[set_env] blocked dangerous environment variable '{name}'; no changes applied.")
            return (any_input, False, "")
        prev_value = os.environ.get(name)
        applied = True
        if (name in os.environ) and (not overwrite):
            applied = False
            print(f"[set_env] '{name}' exists and overwrite=False; leaving value unchanged.")
        else:
            os.environ[name] = value
            print(f"[set_env] set {name}={'***' if 'KEY' in name or 'SECRET' in name or 'TOKEN' in name else value} (prev={prev_value})")

        return (any_input, applied, prev_value if prev_value is not None else "")

class GetEnvVar:
    NAME = "Get Environment Variable"
    DESCRIPTION ="""
    Get an environment variable. `os.environ.get(name, default)`
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "name": ("STRING", {"default": "", "tooltip": "Environment variable name to read."}),
                "default": ("STRING", {"default": "", "tooltip": "Fallback value if the environment variable is not set."}),
            },
        }

    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("value", "exists")
    FUNCTION = "get_env"
    CATEGORY = "ovum"

    @classmethod
    def IS_CHANGED(cls, name, default):
        # Re-run when inputs or the current environment value/state changes.
        try:
            if isinstance(name, str) and len(name) > 0:
                if _is_blocked_env(name):
                    # Blocked names should not influence graph re-execution via env changes.
                    return f"[BLOCKED]{name}", default, False, None
                exists = name in os.environ
                val = os.environ.get(name, None)
                # Use a digest to avoid exposing secrets while detecting changes.
                digest = hashlib.sha256(val.encode("utf-8")).hexdigest() if isinstance(val, str) else None
                return name, default, exists, digest
            else:
                return name, default, False, None
        except Exception:
            # If change detection fails, force re-run to be safe.
            return float("NaN")

    @classmethod
    def get_env(self, name, default):
        if not isinstance(name, str) or len(name) == 0:
            print("[get_env] name is empty; returning default.")
            return (default, False)
        if _is_blocked_env(name):
            print(f"[get_env] blocked dangerous environment variable '{name}'; returning default.")
            return (default, False)
        exists = name in os.environ
        value = os.environ.get(name, default)
        print(f"[get_env] get {name} -> {'***' if 'KEY' in name or 'SECRET' in name or 'TOKEN' in name else value} (exists={exists})")
        return (value, exists)

CLAZZES = [SetEnvVar, GetEnvVar]

