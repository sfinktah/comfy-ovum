import logging

try:
    from common_types import ANYTYPE
    TESTING = False
except ModuleNotFoundError:
    TESTING = True
    class AnyType(str):
        """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

        def __ne__(self, __value: object) -> bool:
            return False
    ANYTYPE = AnyType("*")
    pass

from typing import Optional, TypedDict

logger = logging.getLogger(__name__)

INSERT_NODE_TITLE = False


class PrettyFormatOptions(TypedDict, total=False):
    pass


def _pretty_format(value, indent=0, max_len=200, compact=False, _depth=0):
    """
    Compact pretty printer for dict/list/tuple/scalars with simple wrapping.
    - Uses one compact format (no configurable newline options).
    - Wraps lines by inserting newlines after commas when a soft width is exceeded.
    - Uses hanging indent of two spaces for wrapped lines relative to current indent.
    - Collapses large/nested collections to "..." when compact is True to avoid noise.
    """
    # base configuration
    soft_width = 18  # small width as per requirement; acts as per-node width
    if compact:
        max_len = min(max_len, 32)
    indent_str = "  " * indent

    def clip_str(s: str) -> str:
        if len(s) > max_len:
            return s[:max_len - 3] + "..."
        return s

    # Render scalars first
    if not isinstance(value, (list, tuple, dict)):
        return clip_str(repr(value))

    # Compact elision rules
    if compact:
        if isinstance(value, dict):
            if _depth >= 2:
                return "{...}"
            if len(value) > 3 and _depth >= 1:
                return "{...}"
        else:  # list/tuple
            if _depth > 1:
                open_br, close_br = ("[", "]") if isinstance(value, list) else ("(", ")")
                return f"{open_br}...{close_br}"

    # Helper to wrap a comma-separated single-line string into multiple lines
    def wrap_comma_list(base_open: str, inner: str, base_close: str, current_indent: str) -> str:
        # inner is a comma+space separated sequence already
        line = base_open
        out_lines = []
        first_segment = True
        hang = current_indent + "  "
        for segment in inner.split(", "):
            piece = ("" if first_segment else ", ") + segment
            if len(line) + len(piece) > soft_width and not first_segment:
                out_lines.append(line)
                line = hang + segment
            else:
                line += piece
            first_segment = False
        line += base_close
        if out_lines:
            # Put first line as-is; subsequent lines already have hanging indent
            out_lines.append(line)
            return "\n".join(out_lines)
        return line

    # Render children recursively to single tokens (no newlines inside tokens) where possible
    def render_token(v, depth) -> str:
        if isinstance(v, (list, tuple, dict)):
            return _pretty_format(v, indent=indent + 1, max_len=max_len, compact=compact, _depth=depth)
        return clip_str(repr(v))

    if isinstance(value, dict):
        if not value:
            return "{}"
        # Build single-line inner: key: val, key: val
        parts = []
        for k, v in value.items():
            k_str = clip_str(repr(k))
            v_str = render_token(v, _depth + 1)
            parts.append(f"{k_str}: {v_str}")
        inner = ", ".join(parts)
        one_line = "{" + inner + "}"
        # If short enough, keep single line
        if len(one_line) <= soft_width:
            return one_line
        # Otherwise wrap with hanging indent; keep opening brace on same line as first content when possible
        wrapped = wrap_comma_list("{ ", inner, "}", indent_str)
        return wrapped

    # list/tuple
    open_br, close_br = ("[", "]") if isinstance(value, list) else ("(", ")")
    if not value:
        return open_br + close_br

    # Apply compact truncation of list length
    items = list(value)
    truncated = False
    if compact:
        if _depth == 0 and len(items) > 6:
            items = items[:5]
            truncated = True
        elif _depth >= 1 and len(items) > 2:
            items = items[:2]
            truncated = True

    rendered = [render_token(it, _depth + 1) for it in items]
    if truncated:
        rendered.append("...")

    inner = ", ".join(rendered)
    one_line = open_br + inner + close_br
    if len(one_line) <= soft_width:
        return one_line
    # Wrap with hanging indent of two spaces relative to current indent
    wrapped = wrap_comma_list(open_br, inner, close_br, indent_str)
    return wrapped


def _passthru_common(cls, any_in=None, extra_pnginfo=None, prompt=None, my_unique_id=None, **kwargs):
    input_is_list_flag = getattr(cls, 'INPUT_IS_LIST', False)
    if input_is_list_flag:
        if isinstance(prompt, list) and prompt:
            prompt = prompt[0]
        if isinstance(my_unique_id, list) and my_unique_id:
            my_unique_id = my_unique_id[0]
        if isinstance(extra_pnginfo, list) and extra_pnginfo:
            extra_pnginfo = extra_pnginfo[0]

    if extra_pnginfo:
        workflow = extra_pnginfo["workflow"]
        workflow_nodes_by_id = {str(n["id"]): n for n in workflow["nodes"]}
    else:
        workflow = None
        workflow_nodes_by_id = {}

    node_id = str(my_unique_id) if my_unique_id is not None else "unknown"
    class_name = cls.custom_name
    custom_title = workflow_nodes_by_id.get(node_id, {}).get("title")
    if INSERT_NODE_TITLE and not custom_title and prompt and my_unique_id is not None:
        node_info = prompt.get(str(my_unique_id))
        if isinstance(node_info, dict):
            meta = node_info.get('_meta')
            if isinstance(meta, dict):
                custom_title = meta.get('title')

    display_name = custom_title or class_name

    output_is_list_flag = bool(getattr(cls, 'OUTPUT_IS_LIST', False))

    log_message = f"\n[{cls.__name__}] {display_name} #{node_id}"
    log_message += f"\n  - INPUT_IS_LIST: {input_is_list_flag}"
    log_message += f"\n  - OUTPUT_IS_LIST: {output_is_list_flag}"
    log_message += f"\n  - input type: {type(any_in)}"
    log_message += f"\n  - any_in:\n{_pretty_format(any_in, indent=2)}"
    if kwargs:
        log_message += f"\n  - kwargs:\n{_pretty_format(kwargs, indent=2)}"
    logger.info(log_message)

    # data_to_show = {'any_in': any_in}
    # if kwargs:
    #     data_to_show['kwargs'] = kwargs

    data_to_show = any_in

    status_items = f"type:{type(data_to_show).__name__}\n{_pretty_format(data_to_show, compact=True)}"
    if INSERT_NODE_TITLE and custom_title:
        status_items = f"title:{custom_title}\n{status_items}"

    return {"ui": {"status": [status_items]}, "result": (any_in,)}

class PassthruOvum:
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Pass the input directly through to the output.
    Dumps the input to the console and the canvas.
    """
    # INPUT_IS_LIST = True
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name = "Passthru"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    # noinspection PyShadowingBuiltins
    @classmethod
    def passthru(cls, any_in=None, extra_pnginfo=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in=any_in, extra_pnginfo=extra_pnginfo, prompt=prompt, my_unique_id=my_unique_id, **kwargs)


class PassthruInputIsListOvum:
    """
    Return an element from a comfy-wrapped list as python list with anytype.
    """

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Interprets the input as INPUT_IS_LIST, and outputs it as a python list.
    Dumps the input to the console and canvas.
    """
    INPUT_IS_LIST = True
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name = "Passthru (Input Is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, extra_pnginfo=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in=any_in, extra_pnginfo=extra_pnginfo, prompt=prompt, my_unique_id=my_unique_id, **kwargs)


class PassthruInputAndOutputIsListOvum:
    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    FUNCTION = "passthru"
    DESCRIPTION = """
    Interprets the input as INPUT_IS_LIST, and outputs it with OUTPUT_IS_LIST.
    Dumps the input to the console and canvas.
    """
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name = "Passthru (Input & Output is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, extra_pnginfo=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in=any_in, extra_pnginfo=extra_pnginfo, prompt=prompt, my_unique_id=my_unique_id, **kwargs)


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
    Dumps the input to the console and canvas.
    """
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("any_out",)
    CATEGORY = "ovum/debug"
    custom_name = "Passthru (Output Is List)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_in": (ANYTYPE,),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    @classmethod
    def passthru(cls, any_in=None, extra_pnginfo=None, prompt=None, my_unique_id=None, **kwargs):
        return _passthru_common(cls, any_in=any_in, extra_pnginfo=extra_pnginfo, prompt=prompt, my_unique_id=my_unique_id, **kwargs)


CLAZZES = [PassthruOvum, PassthruInputIsListOvum, PassthruInputAndOutputIsListOvum, PassthruOutputIsListOvum]


def add_line_comments(text: str) -> str:
    """
    Add "// " prefix to each line in the input string.

    Args:
        text (str): Input text to modify

    Returns:
        str: Text with "// " prefix added to each line
    """
    if not text:
        return ""
    lines = text.splitlines()
    return "\n".join(f"// {line}" for line in lines)


if TESTING:

    # Test add_line_comments function
    test_strings = [
        "Hello\nWorld",
        "Single line",
        "",
        "Multiple\nLine\nTest\nCase"
    ]
    test_inputs = [
        [1, 2, *test_strings, 3, 4, 5, 6],
        { "a": { "c": 7, "b": [8, 9] } },
        [[1, 2, *test_strings], [1, 2, 3]],
        [ANYTYPE, ANYTYPE, ANYTYPE],
        [[[1.9533e-01, 2.7730e-01, 3.6719e-01],
          [1.5627e-01, 2.6557e-01, 3.9850e-01],
          [1.5242e-01, 2.8513e-01, 4.2197e-01]]],
        test_strings,
    ]

    for test_input in test_inputs:
        result = _pretty_format(
            test_input,
            compact=True)
        commented_result = add_line_comments(result)
        print(f"\n// Testing: {test_input}")
        print(f"\n// Desired result:")
        result = result.replace("...", '"..."')
        print(f"let result = \n{result};")
        print(f"\n// Actual result:")
        print(f"{commented_result}")
