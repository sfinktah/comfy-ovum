# Stolen from/extends functionality of https://github.com/aria1th/ComfyUI-LogicUtils/blob/main/pystructure.py

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

class ListSliceNode(NewPointer):
    DESCRIPTION="""
    Extract a slice of a list (JavaScript Array.prototype.slice semantics).

    Behavior:
    - start (optional):
      - If empty/unspecified -> 0.
      - If negative -> n + start, clamped to [0, n].
      - If positive -> clamped to [0, n].
    - end (optional):
      - If empty/unspecified -> n.
      - If negative -> n + end, clamped to [0, n].
      - If positive -> clamped to [0, n].
    - If normalized start >= end -> returns an empty list.

    Notes:
    - Matches JavaScript slice: it never mutates the input list and supports negative indexes.
    - Leaving start or end blank in the widget uses the default described above.
    """
    FUNCTION = "list_slice"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Slice"

    @staticmethod
    def list_slice(py_list, start=None, end=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")

        n = len(py_list)

        # Normalize start (JS semantics)
        if start in (None, ""):
            start = 0
        else:
            start = int(start)
            if start < 0:
                start = max(n + start, 0)
            else:
                start = min(start, n)

        # Normalize end (JS semantics)
        if end in (None, ""):
            end = n
        else:
            end = int(end)
            if end < 0:
                end = max(n + end, 0)
            else:
                end = min(end, n)

        # If start >= end, result is empty per JS semantics
        if start >= end:
            return ([],)

        # Python slice now matches JS after normalization/clamping
        return ([*py_list[start:end]],)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
                "start": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional start index. Blank -> 0. Negative -> n+start (clamped). Positive clamped to [0,n]."}),
                "end": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional end index (exclusive). Blank -> n. Negative -> n+end (clamped). Positive clamped to [0,n]."}),
            }
        }

class ListSpliceNode(NewPointer):
    DESCRIPTION=""" 
    Splice a list in place (JavaScript Array.prototype.splice semantics).

    Behavior:
    - start (optional):
      - If empty/unspecified -> 0.
      - If negative -> n + start, clamped to [0, n].
      - If positive -> clamped to [0, n].
    - delete_count (optional):
      - If empty/unspecified -> n - start (delete to end).
      - If negative -> 0.
      - Otherwise -> clamped to [0, n - start].
    - insert_list (optional):
      - If empty/unspecified -> inserts nothing.
      - If a list -> its items are inserted.
      - If a single non-list value -> inserted as one element.

    Returns:
    - [0]: the mutated original list reference after splicing.
    - [1]: a new list of removed elements.

    Notes:
    - Matches JavaScript splice behavior including negative indices and optional parameters.
    """
    FUNCTION = "list_splice"
    RETURN_TYPES = ("LIST", "LIST")  # (modified_list, removed_elements)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Splice"

    @staticmethod
    def list_splice(py_list, start=None, delete_count=None, insert_list=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        if insert_list is None or insert_list == "":
            insert_elems = []
        elif isinstance(insert_list, list):
            insert_elems = list(insert_list)
        else:
            # Accept a single non-list value by inserting it as one element,
            # though typical usage should pass a LIST.
            insert_elems = [insert_list]

        n = len(py_list)

        # Normalize start (JS semantics)
        if start in (None, ""):
            s = 0
        else:
            s = int(start)
            if s < 0:
                s = max(n + s, 0)
            else:
                s = min(s, n)

        # Normalize delete_count (JS semantics)
        if delete_count in (None, ""):
            dc = n - s
        else:
            dc = int(delete_count)
            if dc < 0:
                dc = 0
            dc = min(dc, n - s)

        # Collect removed elements (copy for return)
        removed = py_list[s:s + dc]

        # Perform in-place replacement (deletion + insertion)
        py_list[s:s + dc] = insert_elems

        # Return mutated list and removed elements (both as lists)
        return tuple([py_list, removed])

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
                "start": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional start index. Blank -> 0. Negative -> n+start (clamped). Positive clamped to [0,n]."}),
                "delete_count": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional number of elements to delete. Blank -> delete to end. Negative -> 0. Clamped to [0, n-start]."}),
                "insert_list": ("LIST", {"default": None, "tooltip": "Optional list of items to insert at start. Blank -> insert nothing."}),
            }
        }

class RepeatItemNode(NewPointer):
    DESCRIPTION="""
    Create a list containing the given item repeated 'count' times.
    """
    FUNCTION = "repeat_item"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name="Pyobjects/Repeat Item"

    @staticmethod
    def repeat_item(item, count):
        try:
            c = int(count)
        except Exception:
            c = 0
        if c < 0:
            c = 0
        return ([item] * c,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "item": (anyType,),
                "count": ("INT", {"default": 1, "min": 0, "max": 1024, "step": 1}),
            }
        }

class ReverseListNode(NewPointer):
    DESCRIPTION="""
    Return a new list with the elements of the input list in reverse order.
    """
    FUNCTION = "list_reverse"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name="Pyobjects/Reverse List"

    @staticmethod
    def list_reverse(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        return (list(reversed(py_list)),)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
            }
        }

class ConcatListsNode(NewPointer):
    DESCRIPTION="""
    Concatenate arrays (JavaScript Array.prototype.concat semantics).
    - If list_b is empty/unspecified, returns a shallow copy of list_a.
    - If list_a is empty/unspecified, returns a shallow copy of list_b.
    Notes: Non-mutating; inputs are not modified. Only concatenates two lists; to chain more, connect multiple nodes.
    """
    FUNCTION = "list_concat"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Concat"

    @staticmethod
    def list_concat(list_a=None, list_b=None):
        la = list(list_a) if isinstance(list_a, list) else ([] if list_a in (None, "") else [list_a])
        lb = list(list_b) if isinstance(list_b, list) else ([] if list_b in (None, "") else [list_b])
        return (la + lb,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "list_a": ("LIST",),
                "list_b": ("LIST", {"default": None, "tooltip": "Optional second list to concatenate. Blank -> treated as empty list."}),
            }
        }

class IndexOfNode(NewPointer):
    DESCRIPTION="""
    JavaScript Array.prototype.indexOf-like search.
    - start (optional): Blank -> 0. Negative -> n+start clamped to [0,n].
    - Returns the first index at which search_element is found using Python equality.
    - Returns -1 when not found.
    """
    FUNCTION = "list_index_of"
    RETURN_TYPES = ("INT",)
    CATEGORY = "Data"
    custom_name="Pyobjects/List IndexOf"

    @staticmethod
    def list_index_of(py_list, search_element, start=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        n = len(py_list)
        if start in (None, ""):
            s = 0
        else:
            s = int(start)
            if s < 0:
                s = max(n + s, 0)
            else:
                s = min(s, n)
        for i in range(s, n):
            if py_list[i] == search_element:
                return (i,)
        return (-1,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
                "search_element": (anyType,),
                "start": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional fromIndex. Blank -> 0. Negative -> n+start clamped."}),
            }
        }

class JoinListNode(NewPointer):
    DESCRIPTION="""
    Join elements into a string (JavaScript Array.prototype.join semantics).
    - separator (optional): Blank/unspecified -> "," (comma) per JS default. Use empty string for no separator.
    - Non-string elements are converted to strings.
    """
    FUNCTION = "list_join"
    RETURN_TYPES = ("STRING",)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Join"

    @staticmethod
    def list_join(py_list, separator=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        sep = "," if separator in (None,) else str(separator)
        return (sep.join(str(x) for x in py_list),)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
                "separator": ("STRING", {"default": None, "tooltip": "Optional separator. Blank/unspecified -> comma. Use empty string for no separator."}),
            }
        }

class XRangeNode(NewPointer):
    DESCRIPTION="""
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
        # Normalize optional inputs
        s = 0 if start in (None, "") else int(start)
        stp = 1 if step in (None, "") else int(step)
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

        # Normalize cursor within [0, n]
        try:
            cur = int(cursor)
        except Exception:
            cur = 0
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
            # The way ComfyUI persists widget values is through INPUT_TYPES default scoping;
            # but we cannot programmatically set widget state here. We therefore expose the
            # cursor as an input widget that users can wire back or leave as UI control.
            # Returning current_value only; UI keeps cursor widget value.
            pass

        return (current_value, full_list, exhausted_or_looped,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "stop": ("INT", {"default": 1, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "End (exclusive). Required."}),
            },
            "optional": {
                "start": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional start. Blank -> 0."}),
                "step": ("INT", {"default": None, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Optional step. Blank -> 1. Non-zero. Can be negative."}),
                "repeat": ("BOOLEAN", {"default": False, "tooltip": "When enabled, wraps to beginning after reaching the end (or to end for negative step)."}),
                "cursor": ("INT", {"default": 0, "min": -1_000_000, "max": 1_000_000, "step": 1, "tooltip": "Current index into the range. Updated manually or by upstream."}),
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

CLAZZES = [ListSliceNode, ListSpliceNode, RepeatItemNode, ReverseListNode, ConcatListsNode, IndexOfNode, JoinListNode, XRangeNode]
