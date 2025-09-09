import hashlib

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

anyType = AnyType("*")

class SetLocalStorage:
    NAME = "Set LocalStorage"
    DESCRIPTION = """
    Set a key/value pair in the browser's localStorage via the frontend.
    Works like Set Environment Variable but persists in the user's browser storage.
    Note: Values are strings in localStorage.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_input": (anyType, {"tooltip": "Optional passthrough input to enforce execution order; forwarded unchanged."}),
            },
            "required": {
                "name": ("STRING", {"default": "", "tooltip": "localStorage key name."}),
                "value": ("STRING", {"default": "", "tooltip": "String value to store."}),
                "overwrite": ("BOOLEAN", {"default": True, "tooltip": "If false, keep an existing value and do not change it."}),
            },
        }

    RETURN_TYPES = (anyType, "BOOLEAN", "STRING")
    RETURN_NAMES = ("any_output", "applied", "prev_value")
    FUNCTION = "set_local"
    CATEGORY = "ovum"
    OUTPUT_NODE = True

    def set_local(self, name, value, overwrite, any_input=None):
        # Backend cannot access browser localStorage directly. We return UI info to the frontend
        # through ComfyUI's UI return mechanism, and no-op on the server. The frontend extension
        # will perform the actual set and reflect previous value back when possible.
        if not isinstance(name, str) or len(name) == 0:
            return (any_input, False, "")
        ui = {"ovum_localstorage_set": {"name": name, "value": value, "overwrite": bool(overwrite)}}
        # prev is unknown to backend; frontend cannot reflect it here. Return result normally with UI side-effect.
        return {"ui": ui, "result": (any_input, True, "")}

class GetLocalStorage:
    NAME = "Get LocalStorage"
    DESCRIPTION = """
    Get a value from the browser's localStorage via the frontend.
    Works like Get Environment Variable. Returns (value, exists).
    Is a total kludge, and should be avoided at all costs. 
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "name": ("STRING", {"default": "", "tooltip": "localStorage key to read."}),
                "default": ("STRING", {"default": "", "tooltip": "Fallback value if not present."}),
            },
        }

    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("value", "exists")
    FUNCTION = "get_local"
    CATEGORY = "ovum"

    @classmethod
    def IS_CHANGED(cls, name, default):
        try:
            if isinstance(name, str) and len(name) > 0:
                # We cannot inspect browser storage; include inputs to re-run when they change and a salt for UI-driven changes
                salt = hashlib.sha256(name.encode("utf-8")).hexdigest()[:8]
                return name, default, salt
            else:
                return name, default, None
        except Exception:
            return float("NaN")

    def get_local(self, name, default):
        if not isinstance(name, str) or len(name) == 0:
            return (default, False)
        # Request frontend to fetch the value; meanwhile return default. Frontend widget code can update UI output.
        ui = {"ovum_localstorage_get": {"name": name}}
        return (default, False)


# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer
# noinspection PyPackageRequirements
from aiohttp import web

_local_cache = {}

@PromptServer.instance.routes.get('/ovum/localstorage/get')
async def ovum_localstorage_get(request:web.Request):
    try:
        name = request.query.get('name','')
        node_id = request.query.get('node','')
        widget = request.query.get('widget','')
        value = request.query.get('value', None)
        exists = request.query.get('exists', None)
        # Cache the latest reported value from browser for optional use
        if name:
            if value is not None:
                _local_cache[name] = (value, True)
            elif exists is not None:
                _local_cache[name] = (None, bool(exists))
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)

CLAZZES = [SetLocalStorage, GetLocalStorage]
