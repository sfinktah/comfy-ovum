# Stolen from/extends functionality of https://github.com/aria1th/ComfyUI-LogicUtils/blob/main/pystructure.py
from common_types import NewPointer, AnyType, anyType, _parse_optional_int
from xrange_node import XRangeNode


class ListSliceNode(NewPointer):
    DESCRIPTION = """
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
    custom_name = "Pyobjects/List Slice"

    @staticmethod
    def list_slice(py_list, start=None, end=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")

        n = len(py_list)

        # Normalize start (JS semantics) from optional STRING
        s_val = _parse_optional_int(start, "start")
        if s_val is None:
            start = 0
        else:
            start = s_val
            if start < 0:
                start = max(n + start, 0)
            else:
                start = min(start, n)

        # Normalize end (JS semantics) from optional STRING
        e_val = _parse_optional_int(end, "end")
        if e_val is None:
            end = n
        else:
            end = e_val
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
                "start": ("STRING", {"default": None, "tooltip": "Optional start index as integer string. Blank/whitespace -> 0. Negative -> n+start (clamped)."}),
                "end": ("STRING", {"default": None, "tooltip": "Optional end index (exclusive) as integer string. Blank/whitespace -> n. Negative -> n+end (clamped)."}),
            }
        }


class ListSpliceNode(NewPointer):
    DESCRIPTION = """ 
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
    custom_name = "Pyobjects/List Splice"

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

        # Normalize start (JS semantics) from optional STRING
        s_parsed = _parse_optional_int(start, "start")
        if s_parsed is None:
            s = 0
        else:
            s = s_parsed
            if s < 0:
                s = max(n + s, 0)
            else:
                s = min(s, n)

        # Normalize delete_count (JS semantics) from optional STRING
        dc_parsed = _parse_optional_int(delete_count, "delete_count")
        if dc_parsed is None:
            dc = n - s
        else:
            dc = dc_parsed
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
                "start": ("STRING", {"default": None, "tooltip": "Optional start index as integer string. Blank/whitespace -> 0. Negative -> n+start (clamped)."}),
                "delete_count": ("STRING", {"default": None, "tooltip": "Optional number of elements to delete as integer string. Blank/whitespace -> delete to end. Negative -> 0. Clamped to [0, n-start]."}),
                "insert_list": ("LIST", {"default": None, "tooltip": "Optional list of items to insert at start. Blank -> insert nothing."}),
            }
        }


class RepeatItemNode(NewPointer):
    DESCRIPTION = """
    Create a list containing the given item repeated 'count' times.
    """
    FUNCTION = "repeat_item"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name = "Pyobjects/Repeat Item"

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
    DESCRIPTION = """
    Return a new list with the elements of the input list in reverse order.
    """
    FUNCTION = "list_reverse"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name = "Pyobjects/Reverse List"

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
    DESCRIPTION = """
    Concatenate arrays (JavaScript Array.prototype.concat semantics).
    - If list_b is empty/unspecified, returns a shallow copy of list_a.
    - If list_a is empty/unspecified, returns a shallow copy of list_b.
    Notes: Non-mutating; inputs are not modified. Only concatenates two lists; to chain more, connect multiple nodes.
    """
    FUNCTION = "list_concat"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name = "Pyobjects/List Concat"

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
    DESCRIPTION = """
    JavaScript Array.prototype.indexOf-like search.
    - start (optional): Blank -> 0. Negative -> n+start clamped to [0,n].
    - Returns the first index at which search_element is found using Python equality.
    - Returns -1 when not found.
    """
    FUNCTION = "list_index_of"
    RETURN_TYPES = ("INT",)
    CATEGORY = "Data"
    custom_name = "Pyobjects/List IndexOf"

    @staticmethod
    def list_index_of(py_list, search_element, start=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        n = len(py_list)
        s_parsed = _parse_optional_int(start, "start")
        if s_parsed is None:
            s = 0
        else:
            s = s_parsed
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
                "start": ("STRING", {"default": None, "tooltip": "Optional fromIndex as integer string. Blank/whitespace -> 0. Negative -> n+start clamped."}),
            }
        }


class JoinListNode(NewPointer):
    DESCRIPTION = """
    Join elements into a string (JavaScript Array.prototype.join semantics).
    - separator (optional): Blank/unspecified -> "," (comma) per JS default. Use empty string for no separator.
    - Non-string elements are converted to strings.
    """
    FUNCTION = "list_join"
    RETURN_TYPES = ("STRING",)
    CATEGORY = "Data"
    custom_name = "Pyobjects/List Join"

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


CLAZZES = [ListSliceNode, ListSpliceNode, RepeatItemNode, ReverseListNode, ConcatListsNode, IndexOfNode, JoinListNode, XRangeNode]
