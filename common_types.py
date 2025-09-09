import re

class NewPointer:
    """A base class that forces ComfyUI to skip caching by returning NaN in IS_CHANGED."""
    RESULT_NODE = True  # Typically means the node can appear as a "result" in the graph
    OUTPUT_NODE = True  # Typically means the node can appear as an "output" in the graph

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


anyType = AnyType("*")


def _parse_optional_int(value, field_name: str):
    """Parse optional integer from a widget string.
    Returns int or None. Treats None/''/whitespace-only as None.
    Raises ValueError for non-integer non-blank values (e.g., '1.5', 'abc').
    """
    if value is None:
        return None
    # Explicitly reject booleans (bool is subclass of int)
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer (blank for unset).")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        s = value.strip()
        if s == "":
            return None
        if re.fullmatch(r"[+-]?\d+", s):
            return int(s)
        raise ValueError(f"{field_name} must be an integer (blank for unset).")
    # Reject floats and other types
    raise ValueError(f"{field_name} must be an integer (blank for unset).")
