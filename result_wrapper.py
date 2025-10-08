from typing import Callable, Optional, Type, Any
import types
from nodes import NODE_CLASS_MAPPINGS

# Flags and naming similar to cg-nodecaching implementation
_FLAG = '_is_result_wrapped'
_FN_PREFIX = '_result_wrapped_'
_CATEGORY_DEFAULT = 'result_wrapped_nodes'


def _shape_result(value: Any) -> Any:
    """
    Transform node return values according to the specification:
    - If the node would return a tuple, instead return a dict:
        {
           "ui": {"status": [list(returned tuple)]},
           "result": returned tuple
        }
    - Else if the node would return a dict, ensure that ui.status is added to the dict
      and returns the same as the result key. If a 'result' key is missing, we infer it
      as the original dict (unaltered semantic result) and set ui.status accordingly.
    - Else (any other type), normalize similarly to the tuple-logic using the single
      value as the result and ui.status = [value]. This is a reasonable default to keep
      behavior consistent if used inadvertently.
    """
    # Tuple case
    if isinstance(value, tuple):
        return {
            "ui": {"status": [*value]},
            "result": value,
        }

    # Dict case
    if isinstance(value, dict):
        # Do not mutate original dict
        out = dict(value)
        if 'result' in out:
            result_val = out['result']
        else:
            # If no explicit 'result', treat the entire dict as the result payload
            result_val = value
            out['result'] = result_val
        ui = dict(out.get('ui') or {})
        if 'status' not in ui:
            ui['status'] = result_val
        out['ui'] = ui
        return out

    # Fallback: single value -> wrap (not sure this is legal for comfy nodes)
    return {
        "ui": {"status": [value]},
        "result": value,
    }


def _wrap_function_to_shape_result(callable_fn: Callable) -> Callable:
    def wrapped(node, *args, **kwargs):
        original = callable_fn(node, *args, **kwargs)
        return _shape_result(original)
    return wrapped


def create_result_wrapped_node(class_to_wrap: Type,
                               new_name: Optional[str] = None,
                               new_category: Optional[str] = None) -> Optional[Type]:
    """
    Returns a new Type which subclasses `class_to_wrap` and whose FUNCTION method
    is wrapped to return the specified shaped result.
    """
    if getattr(class_to_wrap, _FLAG, False):
        # already wrapped
        return None

    new_name = new_name or f"result_wrapped_{class_to_wrap.__name__}"
    if new_name in NODE_CLASS_MAPPINGS:
        # name collision; avoid duplicate registration
        return None

    new_class = types.new_class(new_name, (class_to_wrap,))
    function_name = getattr(new_class, 'FUNCTION')
    original_fn = getattr(new_class, function_name)
    wrapped_function = _wrap_function_to_shape_result(original_fn)

    setattr(new_class, f"{_FN_PREFIX}{function_name}", wrapped_function)
    setattr(new_class, 'FUNCTION', f"{_FN_PREFIX}{function_name}")
    setattr(new_class, 'CATEGORY', new_category or _CATEGORY_DEFAULT)
    setattr(new_class, _FLAG, True)

    return new_class


def create_result_wrapped_version(class_key: str) -> Optional[Type]:
    """Create a new class result-wrapping the node referenced by NODE_CLASS_MAPPINGS[class_key]
    and register it as result_wrapped_{class_key} in NODE_CLASS_MAPPINGS.
    """
    class_to_wrap = NODE_CLASS_MAPPINGS[class_key]
    converted = create_result_wrapped_node(class_to_wrap)
    if converted:
        NODE_CLASS_MAPPINGS[f"result_wrapped_{class_key}"] = converted
    return converted


def convert_to_result_wrapped_inplace(class_key: str) -> bool:
    """Replace NODE_CLASS_MAPPINGS[class_key] with a result-wrapped version in-place,
    retaining its original category.
    """
    class_to_wrap = NODE_CLASS_MAPPINGS[class_key]
    converted = create_result_wrapped_node(class_to_wrap, new_name=class_to_wrap.__name__, new_category=class_to_wrap.CATEGORY)
    if converted:
        NODE_CLASS_MAPPINGS[class_key] = converted
        return True
    return False


def is_result_wrapped(class_key: str) -> bool:
    cls = NODE_CLASS_MAPPINGS[class_key]
    return getattr(cls, _FLAG, False)
