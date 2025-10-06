import logging
from common_types import ANYTYPE

logger = logging.getLogger(__name__)

# The definition for _passthru_common was not found in the original file.
# A basic implementation is provided here for functionality, based on the node descriptions.
def _pretty_format(value, indent=0, max_len=60, compact=False, _depth=0):
    if compact:
        max_len = 32

    indent_str = "  " * indent

    if isinstance(value, dict):
        if compact:
            if _depth >= 2:
                return "{...}"
            if len(value) > 3:
                return "{...}"

        if not value: return "{}"

        items = []
        for k, v in value.items():
            key_repr = repr(k)
            if len(key_repr) > max_len:
                key_repr = key_repr[:max_len - 3] + "..."

            val_str = _pretty_format(v, indent + 1, max_len, compact, _depth + 1)
            items.append(f"{indent_str}  {key_repr}: {val_str}")

        return "{\n" + ",\n".join(items) + f"\n{indent_str}}}"

    elif isinstance(value, (list, tuple)):
        brackets = "[]" if isinstance(value, list) else "()"

        if compact and _depth > 1:
            return f"{brackets[0]}...{brackets[1]}"

        if not value: return brackets

        items_to_show = value
        truncated = False

        if compact:
            limit = -1
            if _depth == 0 and len(value) > 5:
                limit = 5
            elif _depth > 0 and len(value) > 2:  # covers _depth == 1
                limit = 2

            if limit != -1:
                items_to_show = value[:limit]
                truncated = True

        items = []
        for item in items_to_show:
            items.append(f"{indent_str}  {_pretty_format(item, indent + 1, max_len, compact, _depth + 1)}")

        if truncated:
            items.append(f"{indent_str}  ...")

        return f"{brackets[0]}\n" + ",\n".join(items) + f"\n{indent_str}{brackets[1]}"

    else:
        val_repr = repr(value)
        if len(val_repr) > max_len:
            return val_repr[:max_len - 3] + "..."
        return val_repr


def _passthru_common(cls, any_in=None, prompt=None, my_unique_id=None, **kwargs):
    node_id = str(my_unique_id) if my_unique_id is not None else "unknown"
    class_name = cls.custom_name
    input_is_list_flag = getattr(cls, 'INPUT_IS_LIST', False)
    output_is_list_flag = bool(getattr(cls, 'OUTPUT_IS_LIST', False))

    log_message = f"\n[Passthru] '{class_name}' ({node_id})"
    log_message += f"\n  - INPUT_IS_LIST: {input_is_list_flag}"
    log_message += f"\n  - OUTPUT_IS_LIST: {output_is_list_flag}"
    log_message += f"\n  - input type: {type(any_in)}"
    log_message += f"\n  - any_in:\n{_pretty_format(any_in, indent=2)}"
    if kwargs:
        log_message += f"\n  - kwargs:\n{_pretty_format(kwargs, indent=2)}"
    logger.info(log_message)

    data_to_show = {'any_in': any_in}
    if kwargs:
        data_to_show['kwargs'] = kwargs

    status_message = _pretty_format(data_to_show, compact=True)

    return {"ui": {"status": [status_message]}, "result": (any_in,)}


class PassthruOvum:
    """
    Return an element from a list by index as anytype.
    """
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Passed the input directly through to the output.
    Dumps the input to the console.
    """
    # INPUT_IS_LIST = True
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name="Passthru"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID"
            }
        }

    # noinspection PyShadowingBuiltins
    @classmethod
    def passthru(cls, any_in=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in, prompt, my_unique_id, **kwargs)

class PassthruInputIsListOvum:
    """
    Return an element from a list by index as anytype.
    """
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Interprets the input as INPUT_IS_LIST, and outputs it as a python list.
    Dumps the input to the console.
    """
    INPUT_IS_LIST = True
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name="Passthru (Input Is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in, prompt, my_unique_id, **kwargs)


class PassthruInputAndOutputIsListOvum:
    """
    Return an element from a list by index as anytype.
    """
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Interprets the input as INPUT_IS_LIST, and outputs it with OUTPUT_IS_LIST.
    Dumps the input to the console.
    """
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name="Passthru (Input & Output is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in, prompt, my_unique_id, **kwargs)

class PassthruOutputIsListOvum:
    """
    Return an element from a list by index as anytype.
    """
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Interprets the input normally, and outputs it with OUTPUT_IS_LIST.
    Dumps the input to the console.
    """
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name="Passthru (Output Is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in, prompt, my_unique_id, **kwargs)

PASSTHRU_CLAZZES = [PassthruOvum, PassthruInputIsListOvum, PassthruInputAndOutputIsListOvum, PassthruOutputIsListOvum]
