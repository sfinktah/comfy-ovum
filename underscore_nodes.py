import inspect
import json
import copy
import os
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
from comfy_execution.graph_utils import GraphBuilder as _GB, is_link as _is_link
GraphBuilder = _GB
is_link = _is_link


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
    # Create a deep copy of the object to avoid mutation
    obj_copy = copy.deepcopy(obj)
    us = _underscore_factory(obj_copy)
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
        # Create a deep copy to avoid mutation
        obj_copy = copy.deepcopy(obj)
        chain_out = _underscore_factory(obj_copy).chain()
        ui = {
            "status": [f"type:{type(obj).__name__}\n{repr(obj)[:200]}"],
            "inputType": ["object"],
            "outputType": ["chained"],
        }
        return {"ui": ui, "result": (chain_out,)}


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
        value = chain.value()
        ui = {
            "status": [f"type:{type(value).__name__}\n{repr(value)[:200]}"],
            "inputType": ["chained"],
            "outputType": ["object"],
        }
        return {"ui": ui, "result": (value,)}


# Excluded method names (function manipulation / internals / non-node-friendly)
_EXCLUDE = {"__init__", "__str__", "__repr__", "obj", "_wrap", "_clean", "_toOriginal", "Namespace", "items",
            "_flatten", "_group", "_lookupIterator", "chain", "value", "makeStatic", "bind", "partial", "bindAll",
            "memoize", "delay", "defer", "throttle", "debounce", "once", "wrap", "compose", "after"}

ITERATEE_PARAM_NAMES = {"func", "iterator", "iteratee", "predicate", "callback", "iter"}

# Official Underscore.js method signatures (without the deprecated/implicit `context` arg)
# This map is informational and can be used by UIs or tooling to render canonical argument names.
# Notes:
# - The first parameter is the primary collection/object/array for collection and array methods.
# - Some methods accept variable arguments (e.g., invoke, union); here they are summarized.
# - For this project, we intentionally keep our node UI labels in _METHOD_ARG_LABELS, which may
#   differ slightly where the Python port diverges (e.g., flatten uses `depth` instead of `shallow`).
_UNDERSCORE_SIGNATURE: Dict[str, List[str]] = {}

# Shared categorizations for primary input type by underscore method
_COLLECTION_INPUTS = {
    "each","map","reduce","reduceRight","find","filter","where","findWhere","reject","every","some","contains","invoke","pluck","max","min","sortBy","groupBy","indexBy","countBy","shuffle","sample","toArray","size","partition"
}
_ARRAY_INPUTS = {
    "first","initial","last","rest","compact","flatten","without","union","intersection","difference","uniq","zip","unzip","object","chunk","indexOf","lastIndexOf","sortedIndex","findIndex","findLastIndex","range"
}
_FUNCTION_INPUTS = {
    "bind","bindAll","partial","memoize","delay","defer","throttle","debounce","once","after","before","wrap","negate","compose","restArguments"
}
_OBJECT_INPUTS = {
    "keys","allKeys","values","mapObject","pairs","invert","create","functions","findKey","extend","extendOwn","pick","omit","defaults","clone","tap","toPath","has","get","property","propertyOf","matcher","isEqual","isMatch","isEmpty","isElement","isArray","isObject","isArguments","isFunction","isString","isNumber","isFinite","isBoolean","isDate","isRegExp","isError","isSymbol","isMap","isWeakMap","isSet","isWeakSet","isArrayBuffer","isDataView","isTypedArray","isNaN","isNull","isUndefined"
}

def _method_input_category(method_name: str) -> str:
    if method_name in _COLLECTION_INPUTS:
        return "collection"
    if method_name in _ARRAY_INPUTS:
        return "array"
    if method_name in _FUNCTION_INPUTS:
        return "function"
    if method_name in _OBJECT_INPUTS:
        return "object"
    return "any"

def _primary_input_name_for_method(method_name: str) -> str:
    cat = _method_input_category(method_name)
    if cat == "array":
        return "py_list"
    if cat == "object":
        return "py_dict"
    if cat == "collection":
        return "list_or_dict"
    if cat == "function":
        return "py_func"
    return "obj"


def _camelize(name: str) -> str:
    parts = name.split("_")
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


# Partial DESCRIPTION overrides from Underscore.js text provided in the issue.
# Keys are method names as used on underscore instances.
_DESCRIPTION_OVERRIDES: Dict[str, str] = {}

# Code examples for underscore.js methods (JavaScript). Where possible, these mirror the official docs.
# Keys are underscore instance method names; values are JS snippets demonstrating usage.
_CODE_EXAMPLES: Dict[str, str] = {}

# Load shared methods metadata from web/underscore/methods.json to keep backend in sync with frontend
# Note: No inline fallback is kept; if the JSON is missing or malformed, these dicts remain empty.

def _load_methods_json():
    here = os.path.dirname(__file__)
    path = os.path.join(here, "web", "underscore", "methods.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f) or {}
        return (
            data.get("_UNDERSCORE_SIGNATURE"),
            data.get("_DESCRIPTION_OVERRIDES"),
            data.get("_CODE_EXAMPLES"),
        )
    except Exception:
        print(f"[ovum::underscore_nodes.py] Warning: could not load methods.json from {path}")
        return None, None, None

# Overwrite globals from methods.json if available to avoid duplication
_sig, _desc, _ex = _load_methods_json()
if _sig:
    try:
        _UNDERSCORE_SIGNATURE = _sig
    except Exception:
        pass
if _desc:
    try:
        _DESCRIPTION_OVERRIDES = _desc
    except Exception:
        pass
if _ex:
    try:
        _CODE_EXAMPLES = _ex
    except Exception:
        pass

# Preferred Underscore.js argument labels for UI, excluding the first collection arg.
_METHOD_ARG_LABELS: Dict[str, List[str]] = {
    "map": ["iteratee"],
    "reduce": ["iteratee", "memo"],
    "reduceRight": ["iteratee", "memo"],
    "find": ["predicate"],
    "filter": ["predicate"],
    "reject": ["predicate"],
    "every": ["predicate"],
    "some": ["predicate"],
    "all": ["predicate"],
    "any": ["predicate"],
    "contains": ["value", "fromIndex"],
    "pluck": ["propertyName"],
    "include": ["value", "fromIndex"],
    "where": ["properties"],
    "findWhere": ["properties"],
    "invoke": ["methodName", "arguments"],
    "max": ["iteratee"],
    "min": ["iteratee"],
    "sortBy": ["iteratee"],
    "groupBy": ["iteratee"],
    "indexBy": ["iteratee"],
    "countBy": ["iteratee"],
    "shuffle": [],
    "sample": ["n"],
    "toArray": [],
    "size": [],
    "partition": ["predicate"],
    "compact": [],
    "first": ["n"],
    "initial": ["n"],
    "last": ["n"],
    "rest": ["index"],
    "flatten": ["depth"],
    "without": ["values"],
    "union": ["arrays"],
    "intersection": ["arrays"],
    "difference": ["others"],
    "uniq": ["isSorted", "iteratee"],
    "zip": ["arrays"],
    "unzip": ["array"],
    "object": ["values"],
    "chunk": ["length"],
    "indexOf": ["value", "isSorted"],
    "lastIndexOf": ["value", "fromIndex"],
    "sortedIndex": ["value", "iteratee"],
    "findIndex": ["predicate"],
    "findLastIndex": ["predicate"],
    "range": ["start", "stop", "step"],
    "keys": [],
    "allKeys": [],
    "values": [],
    "mapObject": ["iteratee"],
    "pairs": [],
    "invert": [],
    "create": ["prototype", "props"],
    "functions": [],
    "findKey": ["predicate"],
    "extend": ["sources"],
    "extendOwn": ["sources"],
    "pick": ["keys"],
    "omit": ["keys"],
    "defaults": ["defaults"],
    "clone": [],
    "tap": ["interceptor"],
    "toPath": ["path"],
    "get": ["path", "default"],
    "has": ["key"],
    "property": ["path"],
    "propertyOf": ["object"],
    "matcher": ["attrs"],
    "isEqual": ["other"],
    "isMatch": ["properties"],
    "isEmpty": [],
    "isElement": [],
    "isArray": [],
    "isObject": [],
    "isArguments": [],
    "isFunction": [],
    "isString": [],
    "isNumber": [],
    "isFinite": [],
    "isBoolean": [],
    "isDate": [],
    "isRegExp": [],
    "isError": [],
    "isSymbol": [],
    "isMap": [],
    "isWeakMap": [],
    "isSet": [],
    "isWeakSet": [],
    "isArrayBuffer": [],
    "isDataView": [],
    "isTypedArray": [],
    "isNaN": [],
    "isNull": [],
    "isUndefined": [],
}

# Alias mapping from JS-style labels to likely underscore3 internal parameter names.
_LABEL_TO_PARAM_CANDIDATES: Dict[str, List[str]] = {
    "iteratee": ["iteratee", "iterator", "func", "val"],
    "predicate": ["predicate", "iteratee", "func", "iterator"],
    "memo": ["memo", "initial", "start"],
    "value": ["value", "val", "item", "obj", "target"],
    "fromIndex": ["fromIndex", "start"],
    "propertyName": ["propertyName", "key", "prop", "attr"],
    "n": ["n", "count", "length"],
    "depth": ["depth", "shallow"],
    "values": ["values", "vals"],
    "arrays": ["arrays", "args"],
    "others": ["others", "args", "array2", "array"],
    "isSorted": ["isSorted", "sorted"],
    "array": ["array"],
    "length": ["length", "n"],
    "index": ["index", "start"],
    "prototype": ["prototype", "proto"],
    "props": ["props"],
    "sources": ["sources", "args", "source", "src"],
    "keys": ["keys", "ks"],
    "defaults": ["defaults", "defs"],
    "interceptor": ["interceptor", "func"],
    "path": ["path", "key"],
    "default": ["default", "_default"],
    "key": ["key"],
    "object": ["object", "obj"],
    "attrs": ["attrs", "properties", "props"],
    "other": ["other", "match"],
    "properties": ["attrs", "properties", "props"],
    "methodName": ["method", "methodName"],
    "arguments": ["args", "arguments"],
    "start": ["start"],
    "stop": ["stop"],
    "step": ["step"],
}

def _build_description_html(name: str, fn: Any) -> Tuple[str, str]:
    ds = _DESCRIPTION_OVERRIDES.get(name, inspect.getdoc(fn) or f"Underscore method '{name}'.")
    html = f"<p>{ds}</p>"
    txt = _wrap_text_60(ds)
    return html, txt


def _make_node_for_method(method_name: str, fn: Any) -> Type:
    class_name = f"Underscore{_camelize(method_name)}"
    html, txt = _build_description_html(method_name, fn)

    sig = inspect.signature(fn)
    # Capture parameter names and kinds (for varargs expansion)
    params = [p for p in sig.parameters.values() if p.name != "self"]
    param_names = [p.name for p in params]
    param_kinds = {p.name: p.kind for p in params}

    def run(self, obj: Any = None, **named_args):
        # Determine primary input value based on category-specific input name
        try:
            pin = primary_input_name  # from closure, if available
        except Exception:
            # Fallback: derive from method category using shared helper
            pin = _primary_input_name_for_method(method_name)
        try:
            primary_from_named = named_args.get(pin)
        except Exception:
            primary_from_named = None
        base_val = obj if obj is not None else primary_from_named
        chain_in = base_val if _is_underscore_instance(base_val) else None
        base_obj = None if chain_in is not None else base_val
        us = _ensure_us(chain_in, base_obj, start_chain=True)

        # Translate UI-labeled args back to internal parameter names
        ui_labels = _METHOD_ARG_LABELS.get(method_name)
        translated: Dict[str, Any] = {}
        # Inject iteratee_json fallback for non-scalar iteratee-like params
        try:
            iteratee_methods = {'countBy', 'every', 'filter', 'find', 'findIndex', 'findKey', 'findLastIndex', 'groupBy',
                                'indexBy', 'map', 'mapObject', 'max', 'min', 'partition', 'reject', 'some', 'sortBy',
                                'sortedIndex', 'uniq'}
            if ui_labels and (method_name in iteratee_methods):
                for lbl in ui_labels:
                    if lbl in ITERATEE_PARAM_NAMES:
                        if (named_args.get(lbl) is None) and (f"{lbl}_json" in named_args):
                            # Parse JSON text into value fallback
                            fallback_val = _parse_json(named_args.get(f"{lbl}_json"), None)
                            if fallback_val is not None:
                                named_args[lbl] = fallback_val
        except Exception:
            pass
        if ui_labels:
            for label in ui_labels:
                if label in named_args and named_args[label] is not None:
                    # find a matching internal param name candidate
                    for cand in _LABEL_TO_PARAM_CANDIDATES.get(label, [label]):
                        if cand in param_names:
                            translated[cand] = named_args[label]
                            break
        else:
            # fallback to using provided names directly (previous behavior)
            for k, v in named_args.items():
                if k in param_names and v is not None:
                    translated[k] = v

        # Build call args respecting function signature order
        call_args: List[Any] = []
        for name in param_names:
            if name in translated:
                val = translated[name]
                # Expand varargs if parameter is VAR_POSITIONAL
                try:
                    is_vararg = (param_kinds.get(name) == inspect.Parameter.VAR_POSITIONAL)
                except Exception:
                    is_vararg = False
                if is_vararg:
                    # Allow JSON text that decodes to a list/tuple for a single vararg parameter value
                    if isinstance(val, str):
                        val = _parse_json(val, val)
                    if isinstance(val, (list, tuple)):
                        call_args.extend(val)
                    else:
                        call_args.append(val)
                else:
                    call_args.append(val)

        m = getattr(us, method_name)
        result_value = m(*call_args)
        # Decide single return based on whether a CHAIN was provided through the primary input
        if chain_in is not None:
            chain_out = result_value if _is_underscore_instance(result_value) else us
            ui = {
                "status": [f"chain({type(result_value.value())})"],
                "inputType": ["chained"],
                "outputType": ["chained"],
            }
            return {"ui": ui, "result": (chain_out,)}
        # Extract the actual value if it's a chained instance
        actual_value = result_value.value() if _is_underscore_instance(result_value) else result_value
        ui = {
            "status": [f"type:{type(actual_value).__name__}\n{repr(actual_value)[:32]}"],
            "inputType": ["object"],
            "outputType": ["object"],
        }
        return {"ui": ui, "result": (actual_value,)}

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
    # Determine base return type (single output); when a CHAIN is provided via the primary input, the node will return a CHAIN dynamically.
    boolean_returns = {
        "isEqual","isMatch","isEmpty","isElement","isArray","isObject","isArguments","isFunction","isString","isNumber","isFinite","isBoolean","isDate","isRegExp","isError","isSymbol","isMap","isWeakMap","isSet","isWeakSet","isArrayBuffer","isDataView","isTypedArray","isNaN","isNull","isUndefined",
        "every","some","all","any","contains","include","has"
    }
    list_returns = {
        "map","filter","reject","pluck","toArray","shuffle","sample","sampleSize","partition","compact","initial","rest","flatten","without","union","intersection","difference","uniq","zip","unzip","keys","allKeys","values","pairs","range","chunk"
    }
    dict_returns = {"groupBy","indexBy","countBy","mapObject","invert","create","extend","extendOwn","pick","omit","defaults"}
    string_returns = set()
    int_returns = {"size","indexOf","lastIndexOf","sortedIndex","findIndex","findLastIndex"}

    accepts_iteratee = {'countBy', 'every', 'filter', 'find', 'findIndex', 'findKey', 'findLastIndex', 'groupBy',
                        'indexBy', 'map', 'mapObject', 'max', 'min', 'partition', 'reject', 'some', 'sortBy',
                        'sortedIndex', 'uniq'}
    if method_name in boolean_returns:
        cd["RETURN_TYPES"] = (BOOLEAN_T,)
    elif method_name in list_returns:
        cd["RETURN_TYPES"] = (LIST_T,)
        # cd["OUTPUT_IS_LIST"] = (True,)
    elif method_name in dict_returns:
        cd["RETURN_TYPES"] = (DICT_T,)
    elif method_name in int_returns:
        cd["RETURN_TYPES"] = (INT_T,)
    else:
        cd["RETURN_TYPES"] = (ANYTYPE,)

        # Determine the primary input name based on category via shared helper
        primary_input_name = _primary_input_name_for_method(method_name)

    @classmethod
    def INPUT_TYPES(cls):
        required: Dict[str, Tuple[str, Dict[str, Any]]] = {}
        # Determine expected input category and primary input name via shared helpers
        cat = _method_input_category(method_name)
        pin = _primary_input_name_for_method(method_name)

        obj_tip = "Primary input object."
        if cat != "any":
            obj_tip = f"Primary input object (expected {cat}). You can still pass any JSON-serializable value."
        optional: Dict[str, Tuple[str, Dict[str, Any]]] = {
            pin: (ANYTYPE, {"default": None, "tooltip": obj_tip + " Also accepts _.CHAIN to continue chaining."}),
        }

        # Helper: map a UI label to an actual parameter object, if any
        def _param_for_label(lbl: str) -> Optional[inspect.Parameter]:
            for cand in _LABEL_TO_PARAM_CANDIDATES.get(lbl, [lbl]):
                for p in params:
                    if p.name == cand:
                        return p
            return None

        # Determine if this method accepts iteratee-like shorthand
        iteratee_methods = {'countBy', 'every', 'filter', 'find', 'findIndex', 'findKey', 'findLastIndex', 'groupBy',
                            'indexBy', 'map', 'mapObject', 'max', 'min', 'partition', 'reject', 'some', 'sortBy',
                            'sortedIndex', 'uniq'}

        # Preferred Underscore.js labels for this method
        labels = _METHOD_ARG_LABELS.get(method_name)
        labels_list: List[str] = []
        if labels is None:
            # Fallback to raw parameter names (excluding iteratee-like ones unless allowed)
            for p in params:
                if p.name in ("self", "context"):
                    continue
                if p.name in ITERATEE_PARAM_NAMES and method_name not in iteratee_methods:
                    continue
                labels_list.append(p.name)
        else:
            labels_list = [lbl for lbl in labels if (lbl not in ITERATEE_PARAM_NAMES) or (method_name in iteratee_methods)]

        # Now add widgets/inputs per rules
        for lbl in labels_list:
            # Skip primary input label if it accidentally appears
            if lbl == pin:
                continue
            
            # Special case: _.range uses varargs in underscore3, so we cannot infer defaults/types from signature.
            # Provide explicit INT widgets for start/stop/step as widget-only controls.
            if method_name == "range" and lbl in ("start", "stop", "step"):
                default_val = 0 if lbl in ("start", "stop") else 1
                optional[lbl] = (INT_T, {"default": int(default_val), "tooltip": f"{lbl} (int)", "ovumWidgetOnly": True})
                continue
            # Explicit override: _.initial should have integer widget 'n' defaulting to 1 (widget-only)
            if method_name == "initial" and lbl == "n":
                optional[lbl] = (INT_T, {"default": 1, "tooltip": "n (int)", "ovumWidgetOnly": True})
                continue
            p = _param_for_label(lbl)
            default = getattr(p, 'default', inspect._empty) if p else inspect._empty
            kind = getattr(p, 'kind', None)

            # 1) Boolean parameters (excluding context) => BOOLEAN widget, no input socket (frontend converts)
            if default in (True, False):
                optional[lbl] = (BOOLEAN_T, {"default": bool(default), "tooltip": f"{lbl} (boolean)", "ovumWidgetOnly": True})
                continue

            # 2) Iteratee parameters (non-scalar): expose an ANYTYPE input named like the parameter,
            #    and a widget-only JSON editor named with the `_json` suffix.
            if (method_name in iteratee_methods) and (lbl in ITERATEE_PARAM_NAMES):
                # Input socket (can be function, key, object, etc.)
                optional[lbl] = (ANYTYPE, {"tooltip": f"{lbl}: ANY input to override widget. Accepts function, key string, or object shorthand.", "forceInput": True})
                # Widget-only editor for JSON/shorthand (no socket)
                optional[f"{lbl}_json"] = (STRING_T, {"default": "", "multiline": True, "tooltip": f"{lbl}_json: JSON or key selector. Used when '{lbl}' input is not connected.", "ovumWidgetOnly": True})
                continue

            # 3) Scalar parameters (int/float/str) => add widgets when no matching input
            # Infer scalar type from default when available; otherwise fall back to heuristics by label
            if default is not inspect._empty:
                if isinstance(default, int):
                    optional[lbl] = (INT_T, {"default": int(default), "tooltip": f"{lbl} (int)", "ovumWidgetOnly": True})
                    continue
                if isinstance(default, float):
                    # Comfy has no FLOAT type in this module; fall back to INT with rounding
                    optional[lbl] = (INT_T, {"default": int(default), "tooltip": f"{lbl} (number)", "ovumWidgetOnly": True})
                    continue
                if isinstance(default, str):
                    optional[lbl] = (STRING_T, {"default": default, "tooltip": f"{lbl} (string)", "ovumWidgetOnly": True})
                    continue

            # Heuristic: create widget-only controls for common scalar labels even when no defaults are exposed
            try:
                _int_defaults = {"n": 1, "length": 1, "index": 0, "fromIndex": 0, "start": 0, "stop": 0, "step": 1}
                _str_labels = {"propertyName", "key", "path", "methodName"}
                _bool_labels = {"isSorted"}
                if lbl in _bool_labels:
                    optional[lbl] = (BOOLEAN_T, {"default": False, "tooltip": f"{lbl} (boolean)", "ovumWidgetOnly": True})
                    continue
                if lbl in _int_defaults:
                    optional[lbl] = (INT_T, {"default": int(_int_defaults[lbl]), "tooltip": f"{lbl} (int)", "ovumWidgetOnly": True})
                    continue
                if lbl in _str_labels:
                    optional[lbl] = (STRING_T, {"default": "", "tooltip": f"{lbl} (string)", "ovumWidgetOnly": True})
                    continue
            except Exception:
                pass

            # Varargs or unknown types: keep as ANYTYPE with tooltip
            # Provide a gentle hint that JSON is allowed for arrays/objects
            tip = f"{lbl}: JSON allowed for arrays/objects where applicable."
            # If varargs, suggest a JSON array
            if kind == inspect.Parameter.VAR_POSITIONAL:
                tip += " For multiple values, provide a JSON array (e.g., [1,2,3])."
            optional[lbl] = (ANYTYPE, {"tooltip": tip})

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


class UnderscoreExports:
    NAME = "underscore function"
    CATEGORY = CATEGORY
    FUNCTION = "run"
    DESCRIPTION = "Output the underscore factory function `_` for Power-Puter"
    RETURN_TYPES = ("PY_FUNC",)
    RETURN_NAMES = ("_",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {}}

    def run(self):
        return (_underscore_factory,)


# Export CLAZZES for auto-registration
CLAZZES = [UnderscoreChain, UnderscoreValue, UnderscoreExports] + _generated_classes
