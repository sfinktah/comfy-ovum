from math_string import coerce_any_to_int

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False

class TautologyStr(str):
    def __ne__(self, other):
        return False

class ByPassTypeTuple(tuple):
    def __getitem__(self, index):
        item = super().__getitem__(index)
        if isinstance(item, str):
            return TautologyStr(item)
        return item


lazy_options = {"lazy": True}

from ovum_helpers import resolve_possible_wrapped_input


class mathIntOperation:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "a": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 1}),
                "b": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 1}),
                "operation": (["add", "subtract", "multiply", "divide", "modulo", "power"],),
            },
        }

    RETURN_TYPES = ("INT",)
    FUNCTION = "int_math_operation"

    CATEGORY = "ovum/loop"

    def int_math_operation(self, a, b, operation):
        if operation == "add":
            print(f"[mathIntOperation] add: a={a}, b={b}")
            return (a + b,)
        elif operation == "subtract":
            return (a - b,)
        elif operation == "multiply":
            return (a * b,)
        elif operation == "divide":
            return (a // b,)
        elif operation == "modulo":
            return (a % b,)
        elif operation == "power":
            return (a ** b,)


DEFAULT_FLOW_NUM = 2
MAX_FLOW_NUM = 20
any_type = AlwaysEqualProxy("*")


class getValueFromList:
    NAME = "Get Value from List"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "py_list": (any_type,),
                "index": ("INT", {"default": 0, "min": 0}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "get_value"
    CATEGORY = "ovum/loop"

    def get_value(self, py_list, index):
        if not isinstance(py_list, list):
            raise ValueError("Input 'py_list' for getValueFromList must be a list.")
        if index < len(py_list):
            return (py_list[index],)
        else:
            print("getValueFromList: " + f"Index {index} out of bounds for list of length {len(py_list)}. Returning None.")
            return (None,)

class addValueToList:
    NAME = "Add Value to List (if boolean)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "py_list": (any_type,),
                "value": (any_type,),
                "bypass": ("BOOLEAN,*", {"default": False}, "Bypass adding this value to the list."),
                "no_bypass": ("BOOLEAN,*", {"default": False}, "Do not bypass adding this value to the list."),
            },
            "required": {
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("py_list",)
    FUNCTION = "add_value"
    CATEGORY = "ovum/loop"

    def add_value(self, py_list=None, value=None, bypass=None, no_bypass=None):
        if py_list is None or py_list == 0:
            new_list = []
        elif isinstance(py_list, list):
            new_list = py_list.copy()
        else:
            raise ValueError(
                f"Input 'py_list' for addValueToList must be a list, received {type(py_list)} ({str(py_list)}).")


        bypass = bool(bypass) if bypass is not None else bypass
        no_bypass = bool(no_bypass) if no_bypass is not None else no_bypass

        if bypass is not None and no_bypass is not None and bypass == no_bypass:
            raise ValueError(f"Bypass is {bypass} and no_bypass is {no_bypass}, but they must be different.")
        if bypass is not None and bypass or no_bypass is not None and not no_bypass:
            new_list.append(value)
        elif bypass is not None and not bypass or no_bypass is not None and no_bypass:
            pass
        
        return (new_list,)

class GetListLength:
    NAME = "Get List Length"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "array": (any_type,),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("length",)
    FUNCTION = "get_length"
    CATEGORY = "ovum/loop"

    def get_length(self, array):
        if not isinstance(array, list):
            raise ValueError(f"Input 'array' for GetListLength must be a list, received {type(array)}.")
        print(f"GetListLength: {str(len(array))}")
        return (len(array),)

class isListNotEmpty:
    NAME = "Return TRUE if a list is not empty"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "array": (any_type,),
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("not_empty",)
    FUNCTION = "not_empty"
    CATEGORY = "ovum/loop"

    def not_empty(self, array):
        if not isinstance(array, list):
            raise ValueError(f"Input 'array' for GetListLength must be a list, received {type(array)}.")
        print(f"notEmpty: {str(len(array))}")
        return (len(array) > 0,)



class CreateEmptyList:
    NAME = "Create Empty List"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("py_list",)
    FUNCTION = "make"
    CATEGORY = "ovum/loop"

    def make(self):
        return ([],)

class listValues:
    NAME = "List Values"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"obj": (any_type,)}}

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("values",)
    FUNCTION = "values"
    CATEGORY = "ovum/loop"

    def values(self, obj):
        if isinstance(obj, dict):
            return (list(obj.values()),)
        if isinstance(obj, list) or isinstance(obj, tuple):
            return (list(obj[:]),)
        # Fallback: no values
        return ([],)

class listKeys:
    NAME = "List Keys"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"obj": (any_type,)}}

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("keys",)
    FUNCTION = "keys"
    CATEGORY = "ovum/loop"

    def keys(self, obj):
        if isinstance(obj, dict):
            return (list(obj.keys()),)
        if isinstance(obj, list) or isinstance(obj, tuple):
            return (list(range(len(obj))),)
        return ([],)

class createTuple:
    NAME = "Make/Create Tuple"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"a": (any_type,), "b": (any_type,)}}

    RETURN_TYPES = ("TUPLE",)
    RETURN_NAMES = ("tuple",)
    FUNCTION = "make"
    CATEGORY = "ovum/loop"

    def make(self, a, b):
        print(f"createTuple: {str(a)} {str(b)}")
        return ( (a, b), )


COMPARE_FUNCTIONS = {
    "a == b": lambda a, b: a == b,
    "a != b": lambda a, b: a != b,
    "a < b": lambda a, b: a < b,
    "a > b": lambda a, b: a > b,
    "a <= b": lambda a, b: a <= b,
    "a >= b": lambda a, b: a >= b,
}


# 比较
class CompareOvum:
    @classmethod
    def INPUT_TYPES(s):
        compare_functions = list(COMPARE_FUNCTIONS.keys())
        return {
            "required": {
                "a": (any_type, {"default": 0}),
                "b": (any_type, {"default": 0}),
                "comparison": (compare_functions, {"default": "a == b"}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "compare"
    CATEGORY = "ovum/loop"

    def compare(self, a, b, comparison):
        print(f"Compare: {str(a)} {comparison} {str(b)}")
        return (COMPARE_FUNCTIONS[comparison](a, b),)

class uncachedListCopy:
    NAME = "Uncachable List Copy (immutable)"
    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("LIST",)
    FUNCTION = "values"
    CATEGORY = "ovum/loop"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": (any_type,)}}

    def values(self, py_list):
        if isinstance(py_list, dict):
            return (list(py_list.values()),)
        if isinstance(py_list, list) or isinstance(py_list, tuple):
            return (list(py_list[:]),)
        # Fallback: no values
        return ([],)


# 判断
class IfElseOvum:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "boolean": ("BOOLEAN",),
                "on_true": (any_type, lazy_options),
                "on_false": (any_type, lazy_options),
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("*",)
    FUNCTION = "execute"
    CATEGORY = "ovum/loop"

    def check_lazy_status(self, boolean, on_true=None, on_false=None):
        if boolean and on_true is None:
            return ["on_true"]
        if not boolean and on_false is None:
            return ["on_false"]

    def execute(self, *args, **kwargs):
        return (kwargs['on_true'] if kwargs['boolean'] else kwargs['on_false'],)


class PlusOne:
    NAME = "Convert any to INT and add 1"
    CATEGORY = "ovum/loop"
    RETURN_TYPES = ("INT",)
    FUNCTION = "compute"
    INPUT_IS_LIST = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
            }
        }

    def compute(self, value, prompt=None, my_unique_id=None):
        resolved = resolve_possible_wrapped_input(value, prompt, my_unique_id, input_name="value")
        n = coerce_any_to_int(resolved)
        return (n + 1,)


class MinusOne:
    NAME = "Convert any to INT and subtract 1"
    CATEGORY = "ovum/loop"
    RETURN_TYPES = ("INT",)
    FUNCTION = "compute"
    INPUT_IS_LIST = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
            }
        }

    def compute(self, value, prompt=None, my_unique_id=None):
        resolved = resolve_possible_wrapped_input(value, prompt, my_unique_id, input_name="value")
        n = coerce_any_to_int(resolved)
        return (n - 1,)


CLAZZES = [
    getValueFromList,
    addValueToList,
    GetListLength,
    CreateEmptyList,
    listValues,
    listKeys,
    createTuple,
    mathIntOperation,
    PlusOne,
    MinusOne,
    CompareOvum,
    IfElseOvum,
    isListNotEmpty,
    uncachedListCopy,
]
