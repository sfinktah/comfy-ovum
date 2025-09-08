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
    Extract a slice of a list. (JavaScript slice).
    """
    FUNCTION = "list_slice"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Slice"

    @staticmethod
    def list_slice(py_list, start, end):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")

        n = len(py_list)

        # Normalize start (JS semantics)
        if start is None:
            start = 0
        else:
            start = int(start)
            if start < 0:
                start = max(n + start, 0)
            else:
                start = min(start, n)

        # Normalize end (JS semantics)
        if end is None:
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
                "start": ("INT",),
                "end": ("INT",),
            }
        }

class ListSpliceNode(NewPointer):
    DESCRIPTION=""" 
    Splice a list into another list. (JavaScript splice).
    """
    FUNCTION = "list_splice"
    RETURN_TYPES = ("LIST", "LIST")  # (modified_list, removed_elements)
    CATEGORY = "Data"
    custom_name="Pyobjects/List Splice"

    @staticmethod
    def list_splice(py_list, start, delete_count, insert_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        if insert_list is None:
            insert_elems = []
        elif isinstance(insert_list, list):
            insert_elems = list(insert_list)
        else:
            # Accept a single non-list value by inserting it as one element,
            # though typical usage should pass a LIST.
            insert_elems = [insert_list]

        n = len(py_list)

        # Normalize start (JS semantics)
        if start is None:
            s = 0
        else:
            s = int(start)
            if s < 0:
                s = max(n + s, 0)
            else:
                s = min(s, n)

        # Normalize delete_count (JS semantics)
        if delete_count is None:
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
                "start": ("INT",),
                "delete_count": ("INT",),
                "insert_list": ("LIST",),
            }
        }

CLAZZES = [ListSliceNode, ListSpliceNode]
