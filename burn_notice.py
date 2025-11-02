class BurnNoticeOvum:
    """
    A multiline string input that erases itself after it has been read.

    Frontend behavior:
    - After the node executes, the UI clears the "value" widget.
    - If "mute_after" is True, the UI mutes the node (node.mode = 2) and marks the canvas dirty.
    """

    NAME = "Burn Notice"
    DESCRIPTION = "A multiline string input that erases itself after it has been read"
    CATEGORY = "ovum/util"
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("STRING", {"multiline": True, "default": ""}),
                "mute_after": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("value",)

    def run(self, value: str, mute_after: bool):
        # Backend just returns the string; the frontend JS extension will clear the widget and optionally mute.
        return {"ui": {"mute_after": [mute_after]}, "result": (value,), }


CLAZZES = [BurnNoticeOvum]
