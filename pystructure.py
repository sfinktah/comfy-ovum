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
                "start": ("INT", {"default": None, "tooltip": "Optional start index. Blank -> 0. Negative -> n+start (clamped). Positive clamped to [0,n]."}),
                "end": ("INT", {"default": None, "tooltip": "Optional end index (exclusive). Blank -> n. Negative -> n+end (clamped). Positive clamped to [0,n]."}),
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
                "start": ("INT", {"default": None, "tooltip": "Optional start index. Blank -> 0. Negative -> n+start (clamped). Positive clamped to [0,n]."}),
                "delete_count": ("INT", {"default": None, "tooltip": "Optional number of elements to delete. Blank -> delete to end. Negative -> 0. Clamped to [0, n-start]."}),
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

CLAZZES = [ListSliceNode, ListSpliceNode, RepeatItemNode, ReverseListNode]
