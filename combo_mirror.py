import re
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
        "keeping several nodes in sync with a single combo selection..."
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
                "choice_index": ("INT", {"default": -1, "min": -1, "max": 0xffffffffffffffff, "step": 1, "tooltip": "Overrides all other inputs if not -1"}),
                "choice_regex": ("STRING", {"default": "", "tooltip": "string/regex: overrides combo input if not empty"}),
                # Hidden carrier for the combo options (one per line)
                "combo_options_str": ("STRING", {"multiline": True, "default": "", "tooltip": "Internal use only"}),
            },
        }

    RETURN_TYPES = ("COMBO", "LIST")
    RETURN_NAMES = ("combo", "strings")
    FUNCTION = "forward"
    CATEGORY = "ovum"

    def forward(self, value: str = "", choice_regex: str = "", choice_index: int = -1, combo_options_str: str = ""):
        # Build strings list from carrier string if present
        strings = [s for s in combo_options_str.split("\n")] if combo_options_str else []

        selected_index = None
        print(f"[ComboMirror] {combo_options_str=}")
        print(f"[ComboMirror] Inputs: options={len(strings)}, choice_index={choice_index}, choice_regex='{choice_regex}', current_value='{value}'")

        # If a valid index is provided and within range, pick that value
        if 0 <= choice_index < len(strings):
            selected_index = choice_index
            value = strings[selected_index]
            print(f"[ComboMirror] Using choice_index override: index {selected_index} -> '{value}'")
        elif choice_index == -1:
            pattern = (choice_regex or "").strip()
            if pattern:
                # Try regex first
                print(f"[ComboMirror] Attempting regex match with pattern: '{pattern}'")
                try:
                    regex = re.compile(pattern)
                    for i, s in enumerate(strings):
                        if regex.search(s):
                            selected_index = i
                            value = s
                            print(f"[ComboMirror] Regex matched index {i}: '{s}'")
                            break
                    if selected_index is None:
                        print("[ComboMirror] No regex match found; trying literal string matching.")
                except re.error as e:
                    print(f"[ComboMirror] Invalid regex ('{pattern}'): {e}. Falling back to literal string matching.")

                # Fallback to literal matching if no regex match or regex invalid
                if selected_index is None:
                    # Exact (case-sensitive)
                    for i, s in enumerate(strings):
                        if s == pattern:
                            selected_index = i
                            value = s
                            print(f"[ComboMirror] Exact match found at index {i}: '{s}'")
                            break

                if selected_index is None:
                    # Exact (case-insensitive)
                    lower = pattern.lower()
                    for i, s in enumerate(strings):
                        if s.lower() == lower:
                            selected_index = i
                            value = s
                            print(f"[ComboMirror] Case-insensitive exact match at index {i}: '{s}'")
                            break

                if selected_index is None:
                    # Substring contains (case-insensitive)
                    lower = pattern.lower()
                    for i, s in enumerate(strings):
                        if lower in s.lower():
                            selected_index = i
                            value = s
                            print(f"[ComboMirror] Substring match at index {i}: '{s}'")
                            break

        # Determine which index to highlight in the printout
        highlight_index = selected_index
        if highlight_index is None and value:
            # If no new selection was made, try to highlight the current value if present
            try:
                highlight_index = next(i for i, s in enumerate(strings) if s == value)
            except StopIteration:
                highlight_index = None

        # Print the options, highlighting the chosen one (if any)
        for i, s in enumerate(strings):
            marker = ">>" if i == highlight_index else "  "
            print(f"[ComboMirror] {marker} [{i}] {s}")

        # Outcome summary
        if highlight_index is not None:
            print(f"[ComboMirror] Selected: index {highlight_index} -> '{value}'")
        else:
            print(f"[ComboMirror] No selection rule applied; using value: '{value}'")

        return (value, strings)


CLAZZES = [ComboMirrorOvum]
