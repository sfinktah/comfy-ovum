from __future__ import annotations
from typing import Any, Dict, Tuple
import json

STRING = "STRING"

class GetSettingOvum:
    NAME = "Get Setting"
    CATEGORY = "ovum/utils"

    # Use a permissive return type so the UI can advertise a more specific type via JS.
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("value",)
    FUNCTION = "run"

    @classmethod
    def IS_CHANGED(cls, *, setting=None, value_out=None, **kwargs):
        """
        Make node output depend on the current value of the selected setting coming
        from extra_pnginfo.workflow.settings (or workflow.extra.settings).
        Returning a stable fingerprint causes Comfy's cache to re-evaluate the node
        whenever the setting value changes on the frontend.
        """
        try:
            # If the frontend hasn't injected settings yet, we can't fingerprint reliably.
            # Force recomputation so the node will be re-run once settings are available.
            # (Basically, this means we cannot cache correctly).
            if not value_out:
                print("[GetSettingOvum] value_out is None; forcing recompute.")
                return float("NaN")
            try:
                fp_val = json.loads(value_out)
                fp_value = fp_val.get("value", None)
                if fp_value is None:
                    return float("NaN")
                fp_val = fp_value
            except Exception:
                fp_val = repr(value)
            hash = f"{setting}|{fp_val}"
            # print("[GetSettingOvum] hash:", hash)
            return hash
        except Exception as e:
            # Fallback forces recompute if we can't determine a stable value
            print("[GetSettingOvum] exception while fingerprinting:", str(e))
            return float("NaN")

    @classmethod
    def INPUT_TYPES(cls):
        # 'setting' will be populated by the frontend combo widget. We still
        # expose it here so it can be linked/scripted; default empty.
        return {
            "required": {
                "setting": ("COMBO", {"value": []}),
            },
            "optional": {
                "value_out": ("STRING", {"default": "", "multiline": True, "readonly": True, "tooltip": "Read-only value from settings object."}),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @staticmethod
    def _extract_settings(extra_pnginfo: Dict[str, Any] | None) -> Dict[str, Any]:
        try:
            if not extra_pnginfo:
                return {}
            # res.workflow.extra.settings['Comfy.LinkRenderMode']
            wf = extra_pnginfo.get("workflow", {}) or {}
            # Prefer explicit workflow.settings first if present
            settings1 = wf.get("settings", {}) or {}
            if isinstance(settings1, dict) and settings1:
                return settings1
            # Fallback to workflow.extra.settings
            extra = wf.get("extra", {}) or {}
            settings2 = extra.get("settings", {}) or {}
            if isinstance(settings2, dict):
                return settings2
        except Exception:
            pass
        return {}

    def run(self, setting: str, extra_pnginfo: Dict[str, Any] | None = None, **kwargs) -> Tuple[Any]:
        settings = self._extract_settings(extra_pnginfo)
        # Prefer the value from settings object (snapshot sent from frontend).
        value = settings.get(setting)
        # print("[GetSettingOvum] setting value:", value, "type:", type(value))
        # If not found, return None explicitly to make it clear.
        return (value,)


CLAZZES = [GetSettingOvum]
