# Stolen from/extends functionality of https://github.com/aria1th/ComfyUI-LogicUtils/blob/main/pystructure.py
from common_types import NewPointer, ANYTYPE, _parse_optional_int
# from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS
import logging
# from ovum_helpers import resolve_effective_list
logger = logging.getLogger(__name__)


class ListSlice(NewPointer):
    DEPRECATED = True
    custom_name = "ListSliceDEPRECATED(batch)"
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
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


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
                "py_list": (ANYTYPE,),
                "start": ("STRING", {"default": None, "tooltip": "Optional start index as integer string. Blank/whitespace -> 0. Negative -> n+start (clamped)."}),
                "end": ("STRING", {"default": None, "tooltip": "Optional end index (exclusive) as integer string. Blank/whitespace -> n. Negative -> n+end (clamped)."}),
            }
        }


class ListSplice(NewPointer):
    DEPRECATED = True
    custom_name = "ListSpliceDEPRECATED(batch)"
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
    RETURN_TYPES = (ANYTYPE, ANYTYPE)  # (modified_list, removed_elements)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True, True)
    CATEGORY = "Data"


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
                "py_list": (ANYTYPE,),
                "start": ("STRING", {"default": None, "tooltip": "Optional start index as integer string. Blank/whitespace -> 0. Negative -> n+start (clamped)."}),
                "delete_count": ("STRING", {"default": None, "tooltip": "Optional number of elements to delete as integer string. Blank/whitespace -> delete to end. Negative -> 0. Clamped to [0, n-start]."}),
                "insert_list": (ANYTYPE, {"default": None, "tooltip": "Optional list of items to insert at start. Blank -> insert nothing."}),
            }
        }


class RepeatItem(NewPointer):
    DEPRECATED = True
    custom_name = "RepeatItemDEPRECATED(batch)"
    DESCRIPTION = """
    Create a list containing the given item repeated 'count' times.
    """
    FUNCTION = "repeat_item"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


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
                "item": (ANYTYPE,),
                "count": ("INT", {"default": 1, "min": 0, "max": 1024, "step": 1}),
            }
        }


class ReverseList(NewPointer):
    DEPRECATED = True
    custom_name = "ReverseListDEPRECATED(batch)"
    DESCRIPTION = """
    Return a new list with the elements of the input list in reverse order.
    """
    FUNCTION = "list_reverse"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


    @staticmethod
    def list_reverse(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        return (list(reversed(py_list)),)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": (ANYTYPE,),
            }
        }


class ConcatLists(NewPointer):
    DEPRECATED = True
    custom_name = "ConcatListsDEPRECATED(batch)"
    DESCRIPTION = """
    Concatenate arrays (lists) (JavaScript Array.prototype.concat semantics).
    - If list_b is empty/unspecified, returns a shallow copy of list_a.
    - If list_a is empty/unspecified, returns a shallow copy of list_b.
    Notes: Non-mutating; inputs are not modified. Only concatenates two lists; to chain more, connect multiple nodes.
    """
    FUNCTION = "list_concat"
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("list",)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


    @staticmethod
    def list_concat(list_a=None, list_b=None):
        la = list(list_a) if isinstance(list_a, list) else ([] if list_a in (None, "") else [list_a])
        lb = list(list_b) if isinstance(list_b, list) else ([] if list_b in (None, "") else [list_b])
        return (la + lb,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "list_a": (ANYTYPE,),
                "list_b": (ANYTYPE, {"default": None, "tooltip": "Optional second list to concatenate. Blank -> treated as empty list."}),
            }
        }


class IndexOf(NewPointer):
    DEPRECATED = True
    custom_name = "IndexOfDEPRECATED(batch)"
    DESCRIPTION = """
    JavaScript Array.prototype.indexOf-like search.
    - start (optional): Blank -> 0. Negative -> n+start clamped to [0,n].
    - Returns the first index at which search_element is found using Python equality.
    - Returns -1 when not found.
    """
    FUNCTION = "list_index_of"
    INPUT_IS_LIST = True
    RETURN_TYPES = ("INT",)
    CATEGORY = "Data"


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
                "py_list": (ANYTYPE,),
                "search_element": (ANYTYPE,),
                "start": ("STRING", {"default": None, "tooltip": "Optional fromIndex as integer string. Blank/whitespace -> 0. Negative -> n+start clamped."}),
            }
        }


class JoinList(NewPointer):
    DEPRECATED = True
    custom_name = "JoinListDEPRECATED(batch)"
    DESCRIPTION = """
    Join elements into a string (JavaScript Array.prototype.join semantics).
    - separator (optional): Blank/unspecified -> "," (comma) per JS default. Use empty string for no separator.
    - Non-string elements are converted to strings.
    """
    FUNCTION = "list_join"
    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING",)
    CATEGORY = "Data"


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
                "py_list": (ANYTYPE,),
                "separator": ("STRING", {"default": None, "tooltip": "Optional separator. Blank/unspecified -> comma. Use empty string for no separator."}),
            }
        }


class UniqueList(NewPointer):
    DEPRECATED = True
    custom_name = "UniqueListDEPRECATED(batch)"
    DESCRIPTION = """
    Return a new list with duplicate values removed, preserving the first occurrence order.
    """
    FUNCTION = "list_unique"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


    @staticmethod
    def list_unique(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        result = []
        seen_hashables = set()
        for item in py_list:
            try:
                # Try hashable fast-path
                if item not in seen_hashables:
                    seen_hashables.add(item)
                    result.append(item)
            except TypeError:
                # Unhashable: fall back to equality-based containment
                if not any(item == existing for existing in result):
                    result.append(item)
        return (result,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": (ANYTYPE,),
            }
        }


class StringListEditor(NewPointer):
    DEPRECATED = True
    custom_name = "StringListEditorDEPRECATED(batch)"
    DESCRIPTION = """
    Create and edit a list of strings with UI support for adding items and drag & drop of files.
    UI behavior (frontend):
    - A multiline text area representing one string per line.
    - An 'Add' button appends a new empty line.
    - A drop zone: dropping files appends their full path(s) as new lines.
    Backend behavior:
    - Splits the multiline text into a list of strings (one per non-empty line, trimming whitespace).
    - Returns a new list (non-mutating).
    """
    FUNCTION = "string_list_editor"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"


    @staticmethod
    def string_list_editor(items_text=""):
        # Ensure items_text is a string
        try:
            s = "" if items_text is None else str(items_text)
        except Exception:
            s = ""
        # Split into lines, trim, drop empties
        lines = []
        for line in s.splitlines():
            t = line.strip()
            if t != "":
                lines.append(t)
        return (lines,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "items_text": ("STRING", {"multiline": True, "default": "", "tooltip": "One string per line. Use the 'Add' button to append, or drop files to add their path(s)."}),
            }
        }

class FromListTypeNode(NewPointer):
    DEPRECATED = True
    custom_name = "FromListTypeNodeDEPRECATED(batch)"
    """
    Takes a Python list and converts it to other types (tuple, set, dict, etc.).
    This is the inverse of ToListTypeNode.
    """
    FUNCTION = "from_list_type"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "Data"


    @staticmethod
    def from_list_type(py_list, target_type="tuple"):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")

        if target_type == "tuple":
            return (tuple(py_list),)
        elif target_type == "list":
            return (py_list,)
        elif target_type == "set":
            return (set(py_list),)
        elif target_type == "dict":
            # Convert list to dict using indices as keys
            return ({i: val for i, val in enumerate(py_list)},)
        elif target_type == "dict_pairs":
            # Convert list of pairs to dict (assumes list contains [key, value] pairs)
            try:
                result_dict = {}
                for pair in py_list:
                    if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                        raise ValueError("Each item must be a pair (list/tuple with 2 elements)")
                    key, value = pair
                    result_dict[key] = value
                return (result_dict,)
            except (ValueError, TypeError) as e:
                raise ValueError(f"Cannot convert to dict from pairs: {str(e)}")
        else:
            raise ValueError(f"Unsupported target_type: {target_type}")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": ("LIST",),
                "target_type": (["list", "set", "dict", "dict_pairs", "tuple"], {"default": "list"}),
            }
        }

class ListExtend(NewPointer):
    DEPRECATED = True
    custom_name = "ListExtendDEPRECATED(batch)"
    """
    Extends list A by appending elements from list B. Returns result, doesn't modify A.
    """
    FUNCTION = "list_extend"
    DESCRIPTION = """
    Extends list A by appending elements from list B. Returns result, doesn't modify A.
    """
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("list",)
    CATEGORY = "Data"


    @staticmethod
    def list_extend(list_a, list_b):
        if not isinstance(list_a, list) and not isinstance(list_b, list):
            raise ValueError("list_a and list_b must be Python lists, received: type {} and type {}".format(type(list_a), type(list_b)))
        if not isinstance(list_a, list):
            raise ValueError("list_b must be a Python list, received: type {}".format(type(list_a)))
        if not isinstance(list_b, list):
            raise ValueError("list_b must be a Python list, received: type {}".format(type(list_b)))
        result = list_a[:]
        result.extend(list_b)
        return (result,)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "list_a": (ANYTYPE,),
                "list_b": (ANYTYPE,),
            }
        }

CLAZZES = [ListSlice, ListSplice, RepeatItem, ReverseList, ConcatLists, IndexOf, JoinList, UniqueList, StringListEditor, FromListTypeNode, ListExtend]
