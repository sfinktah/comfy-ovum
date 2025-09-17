# ComfyUI custom node: Knob
# Provides a numeric value with clamping and rounding, suitable for driving parameters from a UI knob.

from typing import Dict, Any, Tuple

class Knob:
    """
    A numeric knob node.
    Inputs:
      - value: current value
    Properties (set via UI):
      - min: minimum allowed value
      - max: maximum allowed value  
      - precision: number of decimal places to round to
    Output:
      - value: the (clamped and rounded) value
    """

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Tuple[str, Dict[str, Any]]]]:
        return {
            "hidden": {
                "value": ("FLOAT", {"default": 0.5}),
            }
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "compute"
    CATEGORY = "Widget"

    def compute(self, value: float):
        # Get properties from the node (set defaults if missing)
        min_val = getattr(self, 'min', 0.0)
        max_val = getattr(self, 'max', 1.0)
        precision = getattr(self, 'precision', 2)

        # Normalize bounds if user swaps them
        if max_val < min_val:
            min_val, max_val = max_val, min_val

        # Clamp
        clamped = value
        if clamped < min_val:
            clamped = min_val
        elif clamped > max_val:
            clamped = max_val

        # Round to precision
        try:
            p = int(precision)
        except Exception:
            p = 2
        p = max(0, min(10, p))
        rounded = round(clamped, p)

        # Return single FLOAT
        return (float(rounded),)

CLAZZES = [Knob]