from common_types import NewPointer, ANYTYPE, _parse_optional_int
from ovum_helpers import resolve_effective_list

class BatchSliceOvum(NewPointer):
    FUNCTION = "list_slice"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def list_slice(py_list, start=None, end=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        n = len(py_list)
        s_val = _parse_optional_int(start, "start")
        if s_val is None:
            start = 0
        else:
            start = s_val
            if start < 0:
                start = max(n + start, 0)
            else:
                start = min(start, n)
        e_val = _parse_optional_int(end, "end")
        if e_val is None:
            end = n
        else:
            end = e_val
            if end < 0:
                end = max(n + end, 0)
            else:
                end = min(end, n)
        if start >= end:
            return ([],)
        return ([*py_list[start:end]],)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,), "start": ("STRING", {"default": None}), "end": ("STRING", {"default": None})}}


class BatchSpliceOvum(NewPointer):
    FUNCTION = "list_splice"
    RETURN_TYPES = (ANYTYPE, ANYTYPE)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True, True)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def list_splice(py_list, start=None, delete_count=None, insert_list=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        if insert_list is None or insert_list == "":
            insert_elems = []
        elif isinstance(insert_list, list):
            insert_elems = list(insert_list)
        else:
            insert_elems = [insert_list]
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
        dc_parsed = _parse_optional_int(delete_count, "delete_count")
        if dc_parsed is None:
            dc = n - s
        else:
            dc = dc_parsed
            if dc < 0:
                dc = 0
            dc = min(dc, n - s)
        removed = py_list[s:s + dc]
        py_list[s:s + dc] = insert_elems
        return tuple([py_list, removed])

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,), "start": ("STRING", {"default": None}), "delete_count": ("STRING", {"default": None}), "insert_list": (ANYTYPE, {"default": None})}}


class RepeatItemBatchOvum(NewPointer):
    FUNCTION = "repeat_item"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"

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
        return {"required": {"item": (ANYTYPE,), "count": ("INT", {"default": 1, "min": 0, "max": 1024, "step": 1})}}


class ReverseBatchOvum(NewPointer):
    FUNCTION = "list_reverse"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def list_reverse(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        return (list(reversed(py_list)),)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,)}}


class ConcatBatchesOvum(NewPointer):
    FUNCTION = "list_concat"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"
    RETURN_NAMES = ("list",)

    @staticmethod
    def list_concat(list_a=None, list_b=None):
        la = list(list_a) if isinstance(list_a, list) else ([] if list_a in (None, "") else [list_a])
        lb = list(list_b) if isinstance(list_b, list) else ([] if list_b in (None, "") else [list_b])
        return (la + lb,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"list_a": (ANYTYPE,), "list_b": (ANYTYPE, {"default": None})}}


class IndexOfBatchOvum(NewPointer):
    FUNCTION = "list_index_of"
    INPUT_IS_LIST = True
    RETURN_TYPES = ("INT",)
    CATEGORY = "ovum/lists/comfy"

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
        return {"required": {"py_list": (ANYTYPE,), "search_element": (ANYTYPE,), "start": ("STRING", {"default": None})}}


class JoinBatchOvum(NewPointer):
    FUNCTION = "list_join"
    INPUT_IS_LIST = True
    RETURN_TYPES = ("STRING",)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def list_join(py_list, separator=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        sep = "," if separator in (None,) else str(separator)
        return (sep.join(str(x) for x in py_list),)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,), "separator": ("STRING", {"default": None})}}


class UniqueBatchOvum(NewPointer):
    FUNCTION = "list_unique"
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def list_unique(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        result = []
        seen_hashables = set()
        for item in py_list:
            try:
                if item not in seen_hashables:
                    seen_hashables.add(item)
                    result.append(item)
            except TypeError:
                if not any(item == existing for existing in result):
                    result.append(item)
        return (result,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,)}}


class StringBatchEditorOvum(NewPointer):
    FUNCTION = "string_list_editor"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "ovum/lists/comfy"

    @staticmethod
    def string_list_editor(items_text=""):
        try:
            s = "" if items_text is None else str(items_text)
        except Exception:
            s = ""
        lines = []
        for line in s.splitlines():
            t = line.strip()
            if t != "":
                lines.append(t)
        return (lines,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"items_text": ("STRING", {"multiline": True, "default": ""})}}


class FromBatchTypeNodeOvum(NewPointer):
    FUNCTION = "from_list_type"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/comfy"

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
            return ({i: val for i, val in enumerate(py_list)},)
        elif target_type == "dict_pairs":
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
        return {"required": {"py_list": ("LIST",), "target_type": (["list", "set", "dict", "dict_pairs", "tuple"], {"default": "list"})}}


class BatchExtendOvum(NewPointer):
    FUNCTION = "list_extend"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("list",)
    CATEGORY = "ovum/lists/comfy"

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
        return {"required": {"list_a": (ANYTYPE,), "list_b": (ANYTYPE,)}}

CLAZZES = [
    BatchSliceOvum,
    BatchSpliceOvum,
    RepeatItemBatchOvum,
    ReverseBatchOvum,
    ConcatBatchesOvum,
    IndexOfBatchOvum,
    JoinBatchOvum,
    UniqueBatchOvum,
    StringBatchEditorOvum,
    FromBatchTypeNodeOvum,
    BatchExtendOvum,
]
