from typing import Any, Dict


class ComboMirrorOvum:
    """
    Backend companion node for the frontend ComboMirrorOvum.

    The frontend handles mirroring and presenting the combobox options from the
    connected target input. At execution time, we only need to output the
    currently selected string. This lightweight backend node provides the
    required class_type so ComfyUI can build the prompt and execute without
    errors.
    """

    # Shown in the ComfyUI sidebar and tooltips
    DESCRIPTION = (
        "Mirror the options of any connected combobox input and choose the value "
        "once, then feed that same selection into multiple targets. Ideal for "
        "keeping several nodes in sync with a single combo selection."
    )

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        # The frontend updates this widget's options; backend also receives the options string
        return {
            "required": {
                "value": ("COMBO", {"value": []}),
            },
            "optional": {
                # When provided, disables the combo and selects by index
                "choice_index": ("INT", {"default": -1}),
                # Hidden carrier for the combo options (one per line)
                "combo_options_str": ("STRING", {"multiline": True, "default": ""}),
            },
        }

    RETURN_TYPES = ("COMBO", "LIST")
    RETURN_NAMES = ("value", "strings")
    FUNCTION = "forward"
    CATEGORY = "ovum"

    def forward(self, value: str, choice_index: int = -1, combo_options_str: str = ""):
        # Build strings list from carrier string if present
        strings = [s.strip() for s in combo_options_str.split("\n")] if combo_options_str else []
        strings = [s for s in strings if s]

        # If a valid index is provided and within range, pick that value
        if isinstance(choice_index, int) and 0 <= choice_index < len(strings):
            value = strings[choice_index]

        return (value, strings)


CLAZZES = [ComboMirrorOvum]
