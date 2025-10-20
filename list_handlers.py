import json
from operator import length_hint

from common_types import NewPointer, ANYTYPE
from ovum_helpers import resolve_effective_list
import logging
logger = logging.getLogger(__name__)

# List-specific (non-batch) handlers. These should not set INPUT_IS_LIST/OUTPUT_IS_LIST.

class OvumLength:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"any": (ANYTYPE, {})},
            "hidden": {"prompt": "PROMPT", "my_unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (ANYTYPE, "INT",)
    RETURN_NAMES = ("any_out", "length",)
    INPUT_IS_LIST = True

    FUNCTION = "getLength"
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def getLength(any, prompt=None, my_unique_id=None):
        effective_list, _is_wrapped, _meta = resolve_effective_list(any, prompt, my_unique_id, input_name='any')
        length = len(effective_list)
        print(f"getLength: {my_unique_id} length: {length} _is_wrapped: {_is_wrapped} _meta: {_meta}")
        # Create a shallow copy for list inputs; otherwise pass through the original value
        any_out = list(any[0]) if isinstance(any[0], list) else any[0]
        return {
            "ui": {"status": [f"wrapped: {_is_wrapped} length: {length}"]},
            "result": (any_out, length)
        }


class MakeFlatImageList:
    DYNAMIC_INPUTS = {
        "dynamicInputs": {
            "nameRegex": r"arg\d+",
            "nameFormat": "arg${index}",
            "nameIndex": 0,
            "labelRegex": r"image_\d+",
            "labelFormat": "image_${index}",
            "labelIndex": 1,
            "type": "*",
        },
        "version": "1.3.0",
        "changeInputs": [
            {
                "nameRegex": r"arg\d+",
                "condition": "OUTPUT_IS_LIST",
                "shape": [6, None],
            }
        ],
        "flags": ["alpha", "beta"],
        "limits": {"maxBatch": 8, "timeoutSec": 30},
        "ui": {"badge": "Experimental", "color": "#8A2BE2"},
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {"arg0": (ANYTYPE,), },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "dynamicInputs": (
                    "STRING",
                    json.dumps(cls.DYNAMIC_INPUTS, separators=(',', ':')),
                ),
            },
        }

    DESCRIPTION = """
    Create a list of images from images, batches, lists of the same, 
    or lists of lists of the same. Outputs in both native list and
    python list format.
    """
    RETURN_TYPES = ("LIST", "IMAGE")
    RETURN_NAMES = ("image_list", "images")
    FUNCTION = "doit"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (False, True)

    CATEGORY = "ovum/lists/python"

    def doit(self, prompt=None, my_unique_id=None, **kwargs):
        images = []

        def _flatten(value):
            if isinstance(value, list):
                for item in value:
                    yield from _flatten(item)
            else:
                yield value

        for k, v in kwargs.items():
            logger.info(f"k: {k}, v: {type(v)}")
            for leaf in _flatten(v):
                # Expand batched tensors while preserving 4D shape; wrap 3D tensors to 4D
                try:
                    # Prefer .ndim when available, else infer from .shape
                    ndim = getattr(leaf, "ndim", None)
                    shape = getattr(leaf, "shape", None) if ndim is not None else getattr(leaf, "shape", None)
                    if ndim is None and shape is not None:
                        try:
                            ndim = len(shape)
                        except Exception:
                            ndim = None

                    if ndim == 4 and shape is not None:
                        # Split batch but keep leading batch dimension (1)
                        try:
                            batch_size = int(shape[0])
                            for i in range(batch_size):
                                try:
                                    # Preserve 4D by slicing [i:i+1]
                                    images.append(leaf[i:i+1])
                                except Exception:
                                    # Fallback: index and re-add leading dim
                                    sub = leaf[i]
                                    try:
                                        images.append(sub[None, ...])
                                    except Exception:
                                        images.append(sub)
                        except Exception as e:
                            logger.debug(f"MakeFlatImageList: failed to expand batched tensor for key {k}: {e}")
                            images.append(leaf)
                    elif ndim == 3:
                        # Add leading batch dimension to make it 4D
                        try:
                            images.append(leaf[None, ...])
                        except Exception:
                            images.append(leaf)
                    else:
                        images.append(leaf)
                except Exception as e:
                    # If any introspection fails, just append the leaf as-is
                    logger.debug(f"MakeFlatImageList: tensor inspection failed for key {k}: {e}")
                    images.append(leaf)

        logger.info(f"returned {len(images)} images")
        return (images, images,)


class MakeFlatStringList:
    DYNAMIC_INPUTS = {
        "dynamicInputs": {
            "nameRegex": r"arg\d+",
            "nameFormat": "arg${index}",
            "nameIndex": 0,
            "labelRegex": r"string_\d+",
            "labelFormat": "string_${index}",
            "labelIndex": 1,
            "type": "*",
        },
        "version": "1.3.0",
        "changeInputs": [
            {
                "nameRegex": r"arg\d+",
                "condition": "OUTPUT_IS_LIST",
                "shape": [6, None],
            }
        ],
    }
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {"arg0": (ANYTYPE,), },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "dynamicInputs": (
                    "STRING",
                    json.dumps(cls.DYNAMIC_INPUTS, separators=(',', ':')),
                ),
            },
        }

    DESCRIPTION = """
    Create a list of strings from strings, numbers, lists of the same,
    or lists of lists of the same. Outputs in both native list and
    python list format. Non-string leaves are converted with str().
    """
    RETURN_TYPES = ("LIST", "STRING")
    RETURN_NAMES = ("string_list", "strings")
    FUNCTION = "doit"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (False, True)

    CATEGORY = "ovum/lists/python"

    def doit(self, prompt=None, my_unique_id=None, **kwargs):
        strings = []

        def _flatten(value):
            if isinstance(value, list):
                for item in value:
                    yield from _flatten(item)
            else:
                yield value

        for k, v in kwargs.items():
            logger.info(f"[{__class__.__name__}] k: {k}, v: {type(v)}")
            for leaf in _flatten(v):
                try:
                    if isinstance(leaf, bytes):
                        try:
                            s = leaf.decode("utf-8", errors="replace")
                        except Exception:
                            s = str(leaf)
                    elif leaf is None:
                        s = ""
                    else:
                        s = leaf if isinstance(leaf, str) else str(leaf)
                    strings.append(s)
                except Exception as e:
                    logger.debug(f"MakeFlatStringList: coercion failed for key {k}: {e}")
                    try:
                        strings.append(str(leaf))
                    except Exception:
                        # As a last resort, append repr
                        strings.append(repr(leaf))

        logger.info(f"returned {len(strings)} strings")
        return (strings, strings,)


class GetByIndex(NewPointer):
    FUNCTION = "list_get"
    DESCRIPTION = """
    Return an element of any type from a provided list/batch by index.
    """
    RETURN_TYPES = (ANYTYPE,)
    INPUT_IS_LIST = True
    CATEGORY = "ovum/lists/python"
    custom_name = "Get by Index (List)"

    @staticmethod
    def list_get(py_list, index, prompt=None, my_unique_id=None):
        index = index[0]
        prompt = prompt[0]
        my_unique_id = my_unique_id[0]
        # No INPUT_IS_LIST wrapping here; accept raw index
        effective_list, _is_wrapped, _meta = resolve_effective_list(py_list, prompt, my_unique_id, input_name='py_list', logger=logger)
        if index < 0 or index >= len(effective_list):
            raise IndexError(f"Index out of range: {index} (length {len(effective_list)})")
        return (effective_list[index],)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"py_list": (ANYTYPE,), "index": ("INT", {"default": 0})},
            "hidden": {"prompt": "PROMPT", "my_unique_id": "UNIQUE_ID"},
        }


# Pure list handlers (no batch flags) derived from previous classes
class ListSliceOvum(NewPointer):
    FUNCTION = "list_slice"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def list_slice(py_list, start=None, end=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        n = len(py_list)
        def _parse_optional_int(s):
            try:
                return int(s)
            except Exception:
                return None
        s_val = _parse_optional_int(start)
        if s_val is None:
            start = 0
        else:
            start = s_val
            if start < 0:
                start = max(n + start, 0)
            else:
                start = min(start, n)
        e_val = _parse_optional_int(end)
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


class ReverseListOvum(NewPointer):
    FUNCTION = "list_reverse"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def list_reverse(py_list):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        return (list(reversed(py_list)),)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,)}}


class IndexOfOvum(NewPointer):
    FUNCTION = "list_index_of"
    RETURN_TYPES = ("INT",)
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def list_index_of(py_list, search_element, start=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        n = len(py_list)
        try:
            s = int(start) if start is not None and str(start).strip() != "" else 0
        except Exception:
            s = 0
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


class ListSpliceOvum(NewPointer):
    FUNCTION = "list_splice"
    RETURN_TYPES = (ANYTYPE, ANYTYPE)
    CATEGORY = "ovum/lists/python"

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
        try:
            s = int(start) if start is not None and str(start).strip() != "" else 0
        except Exception:
            s = 0
        if s < 0:
            s = max(n + s, 0)
        else:
            s = min(s, n)
        try:
            dc = int(delete_count) if delete_count is not None and str(delete_count).strip() != "" else n - s
        except Exception:
            dc = n - s
        if dc < 0:
            dc = 0
        dc = min(dc, n - s)
        removed = py_list[s:s + dc]
        py_list[s:s + dc] = insert_elems
        return tuple([py_list, removed])

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,), "start": ("STRING", {"default": None}), "delete_count": ("STRING", {"default": None}), "insert_list": (ANYTYPE, {"default": None})}}


class RepeatItemOvum(NewPointer):
    FUNCTION = "repeat_item"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

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


class ConcatListsOvum(NewPointer):
    FUNCTION = "list_concat"
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("list",)
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def list_concat(list_a=None, list_b=None):
        la = list(list_a) if isinstance(list_a, list) else ([] if list_a in (None, "") else [list_a])
        lb = list(list_b) if isinstance(list_b, list) else ([] if list_b in (None, "") else [list_b])
        return (la + lb,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"list_a": (ANYTYPE,), "list_b": (ANYTYPE, {"default": None})}}


class JoinListOvum(NewPointer):
    FUNCTION = "list_join"
    RETURN_TYPES = ("STRING",)
    CATEGORY = "ovum/lists/python"

    @staticmethod
    def list_join(py_list, separator=None):
        if not isinstance(py_list, list):
            raise ValueError("Input must be a Python list")
        sep = "," if separator in (None,) else str(separator)
        return (sep.join(str(x) for x in py_list),)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (ANYTYPE,), "separator": ("STRING", {"default": None})}}


class UniqueListOvum(NewPointer):
    FUNCTION = "list_unique"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

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


class StringListEditorOvum(NewPointer):
    FUNCTION = "string_list_editor"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

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


class FromListTypeNodeOvum(NewPointer):
    FUNCTION = "from_list_type"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "ovum/lists/python"

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


class ListExtendOvum(NewPointer):
    FUNCTION = "list_extend"
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("list",)
    CATEGORY = "ovum/lists/python"

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
    OvumLength,
    MakeFlatImageList,
    MakeFlatStringList,
    GetByIndex,
    ListSliceOvum,
    ListSpliceOvum,
    RepeatItemOvum,
    ConcatListsOvum,
    JoinListOvum,
    UniqueListOvum,
    StringListEditorOvum,
    FromListTypeNodeOvum,
    ListExtendOvum,
    ReverseListOvum,
    IndexOfOvum,
]
