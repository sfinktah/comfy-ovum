from common_types import NewPointer, ANYTYPE

class ReinterpretCast(NewPointer):
    FUNCTION = "reinterpret_cast"
    RETURN_TYPES = (ANYTYPE,)
    CATEGORY = "Data"
    custom_name = "Blind Cast"

    @staticmethod
    def reinterpret_cast(anything):
        return (anything,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"anything": (ANYTYPE,)}}


class ReinterpretAsListCast(NewPointer):
    FUNCTION = "reinterpret_cast"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    INPUT_IS_LIST = True
    CATEGORY = "Data"
    custom_name = "Blind Cast"

    @staticmethod
    def reinterpret_cast(anything):
        return (anything,)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"anything": (ANYTYPE,)}}


class CastListToAny(NewPointer):
    DESCRIPTION = """
    Cast a LIST to anytype (*) so it can connect to any input.
    Non-mutating pass-through of the given list.
    """
    FUNCTION = "list_to_any"
    RETURN_TYPES = (ANYTYPE,)
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "Data"
    custom_name = "Cast Pyobjects/List to Any"

    @staticmethod
    def list_to_any(py_list):
        return (list(py_list),)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"py_list": ("LIST",)}}


class CastAnyToList(NewPointer):
    DESCRIPTION = """
    Cast anytype (*) to LIST. Validates that the input is a Python list and passes it through.
    """
    FUNCTION = "any_to_list"
    RETURN_TYPES = ("LIST",)
    CATEGORY = "ovum/data"
    custom_name = "Cast Any to Pyobjects/List"

    @staticmethod
    def any_to_list(py_list, my_unique_id=None):
        # Keep minimal behavior consistent
        if isinstance(py_list, list):
            return (py_list,)
        elif isinstance(py_list, str):
            return ([py_list],)
        return (list(py_list),)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"py_list": (ANYTYPE,)},
            "hidden": {"my_unique_id": "UNIQUE_ID"},
        }


CLAZZES = [ReinterpretCast, ReinterpretAsListCast, CastListToAny, CastAnyToList]
