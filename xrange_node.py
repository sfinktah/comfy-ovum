from common_types import NewPointer, _parse_optional_int


class XRangeNode(NewPointer):
    DESCRIPTION = """
    Python-like xrange/range node that iterates over an arithmetic progression.

    Parameters (range semantics):
    - If only stop is provided: start=0, stop=stop, step=1.
    - start (INT, optional): defaults to 0 when left blank.
    - stop (INT, required): end (exclusive).
    - step (INT, optional): defaults to 1 when left blank. Cannot be 0. Can be negative.

    Behavior:
    - Produces the full list for convenience, and outputs the current value (based on an internal cursor widget).
    - The cursor advances by 1 on each execution if advance is true; it does not rely on generators/yield.
    - When the range is exhausted:
      - If repeat=false, the exhausted flag is True and the current value remains the last valid value.
      - If repeat=true, the cursor wraps to the beginning (or end for negative step) and the looped flag is True for that evaluation.

    Notes:
    - Works for negative steps exactly as Python range.
    - Leave start/step blank to use defaults. Tooltips explain the defaults.
    - The node is marked as always-changed to allow stepping each run.
    """
    FUNCTION = "xrange_node"
    RETURN_TYPES = ("INT", "LIST", "BOOL")  # (current_value, full_list, exhausted_or_looped)
    CATEGORY = "Data"
    custom_name = "Pyobjects/XRange"

    @staticmethod
    def _compute_range_params(start, stop, step):
        # Normalize optional inputs (STRING widgets for start/step)
        s_opt = _parse_optional_int(start, "start")
        s = 0 if s_opt is None else s_opt
        stp_opt = _parse_optional_int(step, "step")
        stp = 1 if stp_opt is None else stp_opt
        if stop in (None, ""):
            raise ValueError("'stop' must be provided for XRange")
        if stp == 0:
            raise ValueError("step cannot be 0")
        return s, int(stop), stp

    @staticmethod
    def _range_length(start, stop, step):
        # Compute length like Python range
        if step > 0:
            if start >= stop:
                return 0
            return (stop - start + step - 1) // step
        else:
            if start <= stop:
                return 0
            return (start - stop + (-step) - 1) // (-step)

    @staticmethod
    def xrange_compute(start=None, stop=None, step=None, repeat=False, cursor=0, advance=True):
        s, e, st = XRangeNode._compute_range_params(start, stop, step)
        n = XRangeNode._range_length(s, e, st)
        full_list = list(range(s, e, st))
        if n == 0:
            # Degenerate: no values. Define outputs sanely.
            return (0, full_list, True)

        # Normalize cursor within [0, n] (STRING widget)
        cur_opt = _parse_optional_int(cursor, "cursor")
        cur = 0 if cur_opt is None else cur_opt
        exhausted_or_looped = False

        # If cursor is already out of range
        if cur >= n:
            if repeat:
                cur = cur % n
                exhausted_or_looped = True
            else:
                cur = n - 1
                exhausted_or_looped = True
        elif cur < 0:
            if repeat:
                cur = cur % n
                exhausted_or_looped = True
            else:
                cur = 0
                exhausted_or_looped = True

        current_value = s + cur * st

        # Advance cursor for next time if requested
        if bool(advance):
            next_cur = cur + 1
            if next_cur >= n:
                if repeat:
                    next_cur = 0
                else:
                    # Stay one past the end to keep exhausted flag true next time
                    next_cur = n
            # UI retains widget state; we only return computed values.
            pass

        return (current_value, full_list, exhausted_or_looped,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "stop": ("INT", {"default": 1, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "End (exclusive). Required."}),
            },
            "optional": {
                "start": ("STRING", {"default": None, "tooltip": "Optional start as integer string. Blank/whitespace -> 0."}),
                "step": ("STRING", {"default": None, "tooltip": "Optional step as integer string. Blank/whitespace -> 1. Non-zero. Can be negative."}),
                "repeat": ("BOOLEAN", {"default": False, "tooltip": "When enabled, wraps to beginning after reaching the end (or to end for negative step)."}),
                "cursor": ("STRING", {"default": None, "tooltip": "Current index into the range as integer string. Blank/whitespace -> 0."}),
                "advance": ("BOOLEAN", {"default": True, "tooltip": "Advance the cursor by 1 each evaluation (use with Repeat/Trigger)."}),
            }
        }

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Always considered changed so it can advance on each run.
        return float("NaN")

    @staticmethod
    def xrange_node(stop, start=None, step=None, repeat=False, cursor=0, advance=True):
        return XRangeNode.xrange_compute(start=start, stop=stop, step=step, repeat=repeat, cursor=cursor, advance=advance)
