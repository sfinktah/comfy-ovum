from common_types import NewPointer, _parse_optional_int


class XRangeNode(NewPointer):
    DESCRIPTION = """
    Python-like xrange/range node that iterates over an arithmetic progression.

    Parameters (range semantics):
    - If only stop is provided: start=0, stop=stop, step=1.
    - start (INT, optional): defaults to 0 when left blank.
    - stop (INT, required): end (exclusive).
    - step (INT, optional): defaults to 1 when left blank. Cannot be 0. Can be negative.
    - reset (BOOLEAN, optional): when True, immediately restart the loop at the beginning for this evaluation and set the UI cursor accordingly.

    Behavior:
    - Produces the full list for convenience, and outputs the current value (based on an internal cursor widget).
    - The cursor advances by 1 on each execution unless advance is disabled.
    - When the range is exhausted:
      - If repeat=false, the overflow flag is True and the current value remains the last valid value.
      - If repeat=true, the cursor wraps to the beginning (or end for negative step) and the overflow flag is True until next run.
    - If reset=true, the cursor is set to the first position for this evaluation before any advancing logic is applied.

    Notes:
    - Works for negative steps exactly as Python range.
    - Leave start/step blank to use defaults. Tooltips explain the defaults.
    - The node is marked as always-changed to allow stepping each run.

    Composition example:
    - To emulate minutes -> hours: configure one node as 0..60 with repeat=true, and another as 0..24 with repeat=true.
    - Connect minutes.exhausted_or_looped -> hours.advance so the hours node advances once each time minutes wraps.
    - Optionally connect a trigger to both minutes.reset and hours.reset to restart both counters from zero.
    """
    FUNCTION = "xrange_node"
    RETURN_TYPES = ("INT", "LIST", "BOOL")
    RETURN_NAMES = ("current_value", "range_list", "overflow")
    CATEGORY = "Data"
    custom_name = "Pyobjects/XRange"

    @staticmethod
    def _compute_range_params(start, stop, step):
        # Normalize optional inputs (STRING widgets for start/stop/step)
        s_opt = _parse_optional_int(start, "start")
        s = 0 if s_opt is None else s_opt
        stp_opt = _parse_optional_int(step, "step")
        stp = 1 if stp_opt is None else stp_opt
        stop_opt = _parse_optional_int(stop, "stop")
        if stop_opt is None:
            raise ValueError("'stop' must be provided for XRange")
        if stp == 0:
            raise ValueError("step cannot be 0")
        return s, stop_opt, stp

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
    def xrange_compute(start=None, stop=None, step=None, repeat=False, cursor=0, advance=True, reset=False):
        s, e, st = XRangeNode._compute_range_params(start, stop, step)
        n = XRangeNode._range_length(s, e, st)
        full_list = list(range(s, e, st))

        # Normalize cursor (STRING widget)
        cur_opt = _parse_optional_int(cursor, "cursor")
        cur = 0 if cur_opt is None else cur_opt

        # Degenerate: no values. Define outputs sanely and keep/normalize cursor.
        if n == 0:
            ui_update = {"ui": {"cursor": "0" if bool(reset) else str(cur)}}
            return {"ui": ui_update["ui"], "result": (0, full_list, True) }

        overflow = False

        # If external reset requested, start from the beginning for this evaluation
        if bool(reset):
            cur = 0

        # If cursor is already out of range
        if cur >= n:
            if repeat:
                cur = cur % n
                overflow = True
            else:
                cur = n - 1
                overflow = True
        elif cur < 0:
            if repeat:
                cur = cur % n
                overflow = True
            else:
                cur = 0
                overflow = True

        current_value = s + cur * st

        # Advance cursor for next time if requested, and push update to UI
        ui_update = {"ui": {}}
        if bool(advance):
            next_cur = cur + 1
            if next_cur >= n:
                overflow = True
                if repeat:
                    next_cur = 0
                else:
                    # Stay one past the end to keep exhausted flag true next time
                    next_cur = n
            ui_update["ui"]["cursor"] = str(next_cur)
        else:
            # Keep current cursor value visible in the UI
            ui_update["ui"]["cursor"] = str(cur)

        return {"ui": ui_update["ui"], "result": (current_value, full_list, overflow)}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
            },
            "optional": {
                "start": ("STRING", {"default": "0", "tooltip": "Optional start as integer string. Blank/whitespace -> 0."}),
                "stop": ("STRING", {"default": "10", "tooltip": "Required stop as integer string. Leave blank to error at runtime."}),
                "step": ("STRING", {"default": "1", "tooltip": "Optional step as integer string. Blank/whitespace -> 1. Non-zero. Can be negative."}),
                "repeat": ("BOOLEAN", {"default": False, "tooltip": "When enabled, wraps to beginning after reaching the end (or to end for negative step)."}),
                "cursor": ("STRING", {"default": None, "tooltip": "Current index into the range as integer string. Blank/whitespace -> 0."}),
                "advance": ("BOOLEAN", {"default": True, "tooltip": "Disable to pause at the current value."}),
                "reset": ("BOOLEAN", {"default": False, "tooltip": "When True, restart at the beginning."}),
            }
        }

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Always considered changed so it can advance on each run.
        return float("NaN")

    @staticmethod
    def xrange_node(stop=None, start=None, step=None, repeat=False, cursor=0, advance=True, reset=False):
        return XRangeNode.xrange_compute(start=start, stop=stop, step=step, repeat=repeat, cursor=cursor, advance=advance, reset=reset)
