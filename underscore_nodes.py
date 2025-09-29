import inspect
import json
from typing import Any, Dict, List, Optional, Tuple, Type

# External underscore3 implementation
from underscore3.underscore3 import underscore, _ as _underscore_factory

# Reuse flexible ANY type from local helpers if available
try:
    from common_types import ANYTYPE as ANYTYPE
except Exception:
    class _AnyType(str):
        def __ne__(self, other: object) -> bool:
            return False
    ANYTYPE = _AnyType("*")

# ComfyUI type strings
CHAIN_T = "_.CHAIN"
LIST_T = "LIST"
DICT_T = "DICT"
BOOLEAN_T = "BOOLEAN"
STRING_T = "STRING"
INT_T = "INT"

CATEGORY = "ovum/underscore"

# Attempt to import GraphBuilder from bundled ComfyUI. If unavailable, provide a minimal fallback.
try:
    from comfy_execution.graph_utils import GraphBuilder as _GB, is_link as _is_link
    GraphBuilder = _GB
    is_link = _is_link
except Exception:
    def is_link(obj):
        if not isinstance(obj, list):
            return False
        if len(obj) != 2:
            return False
        if not isinstance(obj[0], str):
            return False
        if not isinstance(obj[1], int) and not isinstance(obj[1], float):
            return False
        return True

    class _Node:
        def __init__(self, id: str, class_type: str, inputs: Dict[str, Any]):
            self.id = id
            self.class_type = class_type
            self.inputs = inputs
            self.override_display_id = None
        def out(self, index: int):
            return [self.id, index]
        def serialize(self):
            s = {"class_type": self.class_type, "inputs": self.inputs}
            if self.override_display_id is not None:
                s["override_display_id"] = self.override_display_id
            return s

    class GraphBuilder:  # minimal compatible subset
        _default_prefix_root = ""
        _default_prefix_call_index = 0
        _default_prefix_graph_index = 0
        @classmethod
        def set_default_prefix(cls, prefix_root, call_index, graph_index=0):
            cls._default_prefix_root = prefix_root
            cls._default_prefix_call_index = call_index
            cls._default_prefix_graph_index = graph_index
        @classmethod
        def alloc_prefix(cls, root=None, call_index=None, graph_index=None):
            if root is None:
                root = GraphBuilder._default_prefix_root
            if call_index is None:
                call_index = GraphBuilder._default_prefix_call_index
            if graph_index is None:
                graph_index = GraphBuilder._default_prefix_graph_index
            result = f"{root}.{call_index}.{graph_index}."
            GraphBuilder._default_prefix_graph_index += 1
            return result
        def __init__(self, prefix=None):
            self.prefix = prefix or GraphBuilder.alloc_prefix()
            self.nodes: Dict[str, _Node] = {}
            self.id_gen = 1
        def node(self, class_type: str, id: Optional[str] = None, **kwargs):
            if id is None:
                id = str(self.id_gen)
                self.id_gen += 1
            nid = self.prefix + id
            if nid in self.nodes:
                return self.nodes[nid]
            n = _Node(nid, class_type, kwargs)
            self.nodes[nid] = n
            return n
        def finalize(self) -> Dict[str, Any]:
            out: Dict[str, Any] = {}
            for node_id, node in self.nodes.items():
                out[node_id] = node.serialize()
            return out


def _wrap_text_60(s: str) -> str:
    import textwrap
    s_plain = (s or "").strip()
    s_plain = s_plain.replace("<", " ").replace(">", " ")
    return "\n".join(textwrap.wrap(s_plain, width=60))


def _is_underscore_instance(obj: Any) -> bool:
    return isinstance(obj, underscore)


def _ensure_us(chain: Optional[underscore], obj: Any, start_chain: bool = True) -> underscore:
    if chain is not None:
        return chain
    us = _underscore_factory(obj)
    if start_chain:
        us = us.chain()
    return us


def _parse_json(text: Optional[str], default: Any) -> Any:
    if text is None:
        return default
    if isinstance(text, str):
        t = text.strip()
        if t == "":
            return default
        try:
            return json.loads(t)
        except Exception:
            return default
    return text


def _as_iterable(obj: Any) -> List[Any]:
    if obj is None:
        return []
    if isinstance(obj, dict):
        return list(obj.values())
    if isinstance(obj, (list, tuple, set)):
        return list(obj)
    return [obj]


class UnderscoreChain:
    NAME = "_.chain"
    CATEGORY = CATEGORY
    FUNCTION = "run"
    RETURN_TYPES = (CHAIN_T,)
    RETURN_NAMES = ("chain",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "obj": (ANYTYPE, {"tooltip": "Object to wrap for chaining."}),
            }
        }

    def run(self, obj: Any):
        return (_underscore_factory(obj).chain(),)


class UnderscoreValue:
    NAME = "_.value"
    CATEGORY = CATEGORY
    FUNCTION = "run"
    RETURN_TYPES = (ANYTYPE,)
    RETURN_NAMES = ("value",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "chain": (CHAIN_T, {"tooltip": "A _.CHAIN produced by _.chain or other underscore nodes."}),
            }
        }

    def run(self, chain: underscore):
        if not _is_underscore_instance(chain):
            raise TypeError("UnderscoreValue: 'chain' must be an underscore instance")
        return (chain.value(),)


# Excluded method names (function manipulation / internals / non-node-friendly)
_EXCLUDE = set([
    "__init__", "__str__", "__repr__", "obj", "_wrap", "_clean", "_toOriginal",
    "Namespace", "items", "_flatten", "_group", "_lookupIterator",
    "chain", "value", "makeStatic",
    "bind", "partial", "bindAll", "memoize", "delay", "defer",
    "throttle", "debounce", "once", "wrap", "compose", "after",
])

ITERATEE_PARAM_NAMES = {"func", "iterator", "iteratee", "predicate", "callback"}


def _camelize(name: str) -> str:
    parts = name.split("_")
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def _build_description_html(name: str, fn: Any) -> Tuple[str, str]:
    ds = inspect.getdoc(fn) or f"Underscore method '{name}'."
    html = f"<p>{ds}</p>"
    txt = _wrap_text_60(ds)
    return html, txt


def _make_node_for_method(method_name: str, fn: Any) -> Type:
    class_name = f"Underscore{_camelize(method_name)}"
    html, txt = _build_description_html(method_name, fn)

    sig = inspect.signature(fn)
    param_names = [p.name for p in sig.parameters.values() if p.name != "self"]

    is_map = (method_name == "map")
    iteratee_present = any(p in ITERATEE_PARAM_NAMES for p in param_names)

    def run(self, chain: Optional[underscore] = None, obj: Any = None, obj_in: Any = None,
            args_json: Optional[str] = None, kwargs_json: Optional[str] = None,
            iteratee_class: Optional[str] = None, iteratee_input: str = "value",
            iteratee_output_index: int = 0, iteratee_kwargs_json: Optional[str] = None,
            iteratee_index_name: str = "index", iteratee_list_name: str = "list",
            **named_args):
        # Merge json args/kwargs
        extra_args = _parse_json(args_json, [])
        extra_kwargs = _parse_json(kwargs_json, {})
        it_kwargs = _parse_json(iteratee_kwargs_json, {})

        if chain is not None and not _is_underscore_instance(chain):
            raise TypeError(f"{class_name}: 'chain' must be an underscore instance")
        base_obj = obj_in if obj_in is not None else obj
        us = _ensure_us(chain, base_obj, start_chain=True)

        # If an iteratee is declared for this method and iteratee_class provided, build dynamic graph
        if iteratee_present and iteratee_class and GraphBuilder is not None:
            coll = us.obj if _is_underscore_instance(us) else base_obj
            graph = GraphBuilder()
            results = []
            if hasattr(coll, 'items') and callable(coll.items):
                items_iter = list(coll.items())
                for idx, (k, val) in enumerate(items_iter):
                    inputs = {iteratee_input: val, iteratee_index_name: k, iteratee_list_name: coll}
                    if isinstance(it_kwargs, dict):
                        inputs.update(it_kwargs)
                    node = graph.node(iteratee_class, **inputs)
                    results.append(node.out(int(iteratee_output_index)))
            else:
                seq = _as_iterable(coll)
                for idx, val in enumerate(seq):
                    inputs = {iteratee_input: val, iteratee_index_name: idx, iteratee_list_name: seq}
                    if isinstance(it_kwargs, dict):
                        inputs.update(it_kwargs)
                    node = graph.node(iteratee_class, **inputs)
                    results.append(node.out(int(iteratee_output_index)))
            return {
                "result": (us, results),
                "expand": graph.finalize(),
            }

        # Build call args from named_args respecting function signature
        call_args: List[Any] = []
        call_kwargs: Dict[str, Any] = {}
        for name in param_names:
            if name in named_args and named_args[name] is not None:
                call_args.append(named_args[name])
        # Append json-based extras
        if isinstance(extra_args, list):
            call_args.extend(extra_args)
        if isinstance(extra_kwargs, dict):
            call_kwargs.update(extra_kwargs)

        m = getattr(us, method_name)
        _ = m(*call_args, **call_kwargs)
        # Return chain and empty iteratee list if applicable for consistency
        if iteratee_present:
            return (us, [])
        return (us,)

    # Build class dict
    cd = {
        "NAME": f"_.{method_name}",
        "CATEGORY": CATEGORY,
        "FUNCTION": "run",
        "DESCRIPTION_HTML": html,
        "DESCRIPTION": txt,
        "run": run,
    }

    # Outputs: add iteratee result list when iteratee is present
    if iteratee_present:
        cd["RETURN_TYPES"] = (CHAIN_T, LIST_T)
        sec_name = "result" if method_name == "map" else "iteratee_results"
        cd["RETURN_NAMES"] = ("chain", sec_name)
        cd["OUTPUT_IS_LIST"] = (False, True)
    else:
        cd["RETURN_TYPES"] = (CHAIN_T,)
        cd["RETURN_NAMES"] = ("chain",)

    @classmethod
    def INPUT_TYPES(cls):
        required: Dict[str, Tuple[str, Dict[str, Any]]] = {}
        optional: Dict[str, Tuple[str, Dict[str, Any]]] = {
            "chain": (CHAIN_T, {"forceInput": True, "tooltip": "Optional existing _.CHAIN. If provided, obj is ignored."}),
            "obj": (ANYTYPE, {"default": None, "tooltip": "Object to operate on when chain input is not connected."}),
            "obj_in": (ANYTYPE, {"forceInput": True, "tooltip": "Alternative object input overriding the 'obj' widget when connected."}),
            "args_json": (STRING_T, {"default": "", "multiline": True, "tooltip": "Positional args as JSON array."}),
            "kwargs_json": (STRING_T, {"default": "", "multiline": True, "tooltip": "Keyword args as JSON object."}),
        }
        # Named parameters for clarity (non-functional types only; functions handled via iteratee fields if method is map)
        for pname in param_names:
            if pname in ITERATEE_PARAM_NAMES:
                continue
            optional[pname] = (ANYTYPE, {"tooltip": f"Argument: {pname}"})
        if iteratee_present:
            optional.update({
                "iteratee_class": (STRING_T, {"default": "", "tooltip": "Class type of the iteratee node to apply (e.g., 'TextNodes/Lowercase')."}),
                "iteratee_input": (STRING_T, {"default": "value", "tooltip": "Name of the iteratee node input that receives each element/value."}),
                "iteratee_output_index": (INT_T, {"default": 0, "min": 0, "tooltip": "Index of the iteratee node output to collect."}),
                "iteratee_index_name": (STRING_T, {"default": "index", "tooltip": "Name of the iteratee node input that receives index/key."}),
                "iteratee_list_name": (STRING_T, {"default": "list", "tooltip": "Name of the iteratee node input that receives the full collection."}),
                "iteratee_kwargs_json": (STRING_T, {"default": "", "multiline": True, "tooltip": "Extra inputs for the iteratee node as JSON object. Values may be literals or links like [node_id, index]."}),
            })
        return {"required": required, "optional": optional}

    cd["INPUT_TYPES"] = INPUT_TYPES

    return type(class_name, (), cd)


# Discover methods to wrap
_methods = []
for name, member in inspect.getmembers(underscore, predicate=lambda x: inspect.isfunction(x) or inspect.ismethod(x)):
    if name.startswith("_"):
        continue
    if name in _EXCLUDE:
        continue
    try:
        getattr(underscore([]), name)
    except Exception:
        continue
    _methods.append((name, member))

# Create node classes
_generated_classes: List[Type] = []
for name, fn in _methods:
    try:
        cls = _make_node_for_method(name, fn)
        _generated_classes.append(cls)
    except Exception:
        pass

# Export CLAZZES for auto-registration
CLAZZES = [UnderscoreChain, UnderscoreValue] + _generated_classes
