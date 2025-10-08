import inspect
import json
import copy
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
        def set_input(self, key: str, value: Any):
            self.inputs[key] = value
        def set_override_display_id(self, display_id: Optional[str]):
            self.override_display_id = display_id
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
        def _nid(self, id: str) -> str:
            return id if id.startswith(self.prefix) else (self.prefix + id)
        def node(self, class_type: str, id: Optional[str] = None, **kwargs):
            if id is None:
                id = str(self.id_gen)
                self.id_gen += 1
            nid = self._nid(id)
            if nid in self.nodes:
                return self.nodes[nid]
            n = _Node(nid, class_type, kwargs)
            self.nodes[nid] = n
            return n
        def lookup_node(self, id: str) -> _Node:
            nid = self._nid(id)
            return self.nodes[nid]
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
        return (_underscore_factory(obj_copy).chain(),)


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


# Partial DESCRIPTION overrides from Underscore.js text provided in the issue.
# Keys are method names as used on underscore instances.
_DESCRIPTION_OVERRIDES: Dict[str, str] = {
    "map": "Produces a new array of values by mapping each value in list through a transformation function (iteratee). The iteratee is passed three arguments: the value, then the index (or key) of the iteration, and finally a reference to the entire list.",
    "reduce": "Also known as inject and foldl, reduce boils down a list of values into a single value. Memo is the initial state of the reduction, and each successive step of it should be returned by iteratee. The iteratee is passed four arguments: the memo, then the value and index (or key) of the iteration, and finally a reference to the entire list. If no memo is passed to the initial invocation of reduce, the iteratee is not invoked on the first element of the list. The first element is instead passed as the memo in the invocation of the iteratee on the next element in the list.",
    "reduceRight": "The right-associative version of reduce. Foldr is not as useful in JavaScript as it would be in a language with lazy evaluation.",
    "find": "Looks through each value in the list, returning the first one that passes a truth test (predicate), or undefined if no value passes the test. The function returns as soon as it finds an acceptable element, and doesn't traverse the entire list. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "filter": "Looks through each value in the list, returning an array of all the values that pass a truth test (predicate). predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "reject": "Returns the values in list without the elements that the truth test (predicate) passes. The opposite of filter. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "every": "Returns true if all of the values in the list pass the predicate truth test. Short-circuits and stops traversing the list if a false element is found. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "all": "Returns true if all of the values in the list pass the predicate truth test. Short-circuits and stops traversing the list if a false element is found. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "some": "Returns true if any of the values in the list pass the predicate truth test. Short-circuits and stops traversing the list if a true element is found. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "any": "Returns true if any of the values in the list pass the predicate truth test. Short-circuits and stops traversing the list if a true element is found. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "contains": "Returns true if the value is present in the list. Uses indexOf internally, if list is an Array. Use fromIndex to start your search at a given index.",
    "include": "Returns true if the value is present in the list. Uses indexOf internally, if list is an Array. Use fromIndex to start your search at a given index.",
    "pluck": "A convenient version of what is perhaps the most common use-case for map: extracting a list of property values.",
    "findWhere": "Looks through the list and returns the first value that matches all of the key-value pairs listed in properties. If no match is found, or if list is empty, undefined will be returned.",
    "where": "Looks through each value in the list, returning an array of all the values that matches the key-value pairs listed in properties.",
    "invoke": "Calls the method named by methodName on each value in the list. Any extra arguments passed to invoke will be forwarded on to the method invocation.",
    "max": "Returns the maximum value in list. If an iteratee function is provided, it will be used on each value to generate the criterion by which the value is ranked. -Infinity is returned if list is empty, so an isEmpty guard may be required. This function can currently only compare numbers reliably. This function uses operator < (note).",
    "min": "Returns the minimum value in list. If an iteratee function is provided, it will be used on each value to generate the criterion by which the value is ranked. Infinity is returned if list is empty, so an isEmpty guard may be required. This function can currently only compare numbers reliably. This function uses operator < (note).",
    "sortBy": "Returns a (stably) sorted copy of list, ranked in ascending order by the results of running each value through iteratee. iteratee may also be the string name of the property to sort by (eg. length). This function uses operator < (note).",
    "groupBy": "Splits a collection into sets, grouped by the result of running each value through iteratee. If iteratee is a string instead of a function, groups by the property named by iteratee on each of the values.",
    "indexBy": "Given a list, and an iteratee function that returns a key for each element in the list (or a property name), returns an object with an index of each item. Just like groupBy, but for when you know your keys are unique.",
    "countBy": "Sorts a list into groups and returns a count for the number of objects in each group. Similar to groupBy, but instead of returning a list of values, returns a count for the number of values in that group.",
    "shuffle": "Returns a shuffled copy of the list, using a version of the Fisher-Yates shuffle.",
    "sample": "Produce a random sample from the list. Pass a number to return n random elements from the list. Otherwise a single random item will be returned.",
    "sampleSize": "Produce a random sample from the list. Pass a number to return n random elements from the list. Otherwise a single random item will be returned.",
    "toArray": "Creates a real Array from the list (anything that can be iterated over). Useful for transmuting the arguments object.",
    "size": "Return the number of values in the list.",
    "partition": "Split list into two arrays: one whose elements all satisfy predicate and one whose elements all do not satisfy predicate. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "compact": "Returns a copy of the list with all falsy values removed. In JavaScript, false, null, 0, \"\", undefined and NaN are all falsy.",
    "first": "Returns the first element of an array. Passing n will return the first n elements of the array.",
    "initial": "Returns everything but the last entry of the array. Especially useful on the arguments object. Pass n to exclude the last n elements from the result.",
    "last": "Returns the last element of an array. Passing n will return the last n elements of the array.",
    "rest": "Returns the rest of the elements in an array. Pass an index to return the values of the array from that index onward.",
    "flatten": "Flattens a nested array. If you pass true or 1 as the depth, the array will only be flattened a single level. Passing a greater number will cause the flattening to descend deeper into the nesting hierarchy. Omitting the depth argument, or passing false or Infinity, flattens the array all the way to the deepest nesting level.",
    "without": "Returns a copy of the array with all instances of the values removed.",
    "union": "Computes the union of the passed-in arrays: the list of unique items, in order, that are present in one or more of the arrays.",
    "intersection": "Computes the list of values that are the intersection of all the arrays. Each value in the result is present in each of the arrays.",
    "difference": "Similar to without, but returns the values from array that are not present in the other arrays.",
    "uniq": "Produces a duplicate-free version of the array, using === to test object equality. In particular only the first occurrence of each value is kept. If you know in advance that the array is sorted, passing true for isSorted will run a much faster algorithm. If you want to compute unique items based on a transformation, pass an iteratee function.",
    "zip": "Merges together the values of each of the arrays with the values at the corresponding position. Useful when you have separate data sources that are coordinated through matching array indexes.",
    "unzip": "The opposite of zip. Given an array of arrays, returns a series of new arrays, the first of which contains all of the first elements in the input arrays, the second of which contains all of the second elements, and so on. If you're working with a matrix of nested arrays, this can be used to transpose the matrix.",
    "object": "Converts arrays into objects. Pass either a single list of [key, value] pairs, or a list of keys, and a list of values. Passing by pairs is the reverse of pairs. If duplicate keys exist, the last value wins.",
    "chunk": "Chunks an array into multiple arrays, each containing length or fewer items.",
    "indexOf": "Returns the index at which value can be found in the array, or -1 if value is not present in the array. If you're working with a large array, and you know that the array is already sorted, pass true for isSorted to use a faster binary search ... or, pass a number as the third argument in order to look for the first matching value in the array after the given index. If isSorted is true, this function uses operator < (note).",
    "lastIndexOf": "Returns the index of the last occurrence of value in the array, or -1 if value is not present. Pass fromIndex to start your search at a given index.",
    "sortedIndex": "Uses a binary search to determine the smallest index at which the value should be inserted into the array in order to maintain the array's sorted order. If an iteratee function is provided, it will be used to compute the sort ranking of each value, including the value you pass. The iteratee may also be the string name of the property to sort by (eg. length). This function uses operator < (note).",
    "findIndex": "Similar to _.indexOf, returns the first index where the predicate truth test passes; otherwise returns -1.",
    "findLastIndex": "Like _.findIndex but iterates the array in reverse, returning the index closest to the end where the predicate truth test passes.",
    "range": "A function to create flexibly-numbered lists of integers, handy for each and map loops. start, if omitted, defaults to 0; step defaults to 1 if start is before stop, otherwise -1. Returns a list of integers from start (inclusive) to stop (exclusive), incremented (or decremented) by step.",
    "keys": "Retrieve all the names of the object's own enumerable properties.",
    "allKeys": "Retrieve all the names of object's own and inherited properties.",
    "values": "Return all of the values of the object's own properties.",
    "mapObject": "Like map, but for objects. Transform the value of each property in turn.",
    "pairs": "Convert an object into a list of [key, value] pairs. The opposite of object.",
    "invert": "Returns a copy of the object where the keys have become the values and the values the keys. For this to work, all of your object's values should be unique and string serializable.",
    "create": "Creates a new object with the given prototype, optionally attaching props as own properties. Basically, Object.create, but without all of the property descriptor jazz.",
    "functions": "Returns a sorted list of the names of every method in an object — that is to say, the name of every function property of the object.",
    "findKey": "Similar to _.findIndex but for keys in objects. Returns the key where the predicate truth test passes or undefined. predicate is transformed through iteratee to facilitate shorthand syntaxes.",
    "extend": "Shallowly copy all of the properties in the source objects over to the destination object, and return the destination object. Any nested objects or arrays will be copied by reference, not duplicated. It's in-order, so the last source will override properties of the same name in previous arguments.",
    "extendOwn": "Like extend, but only copies own properties over to the destination object.",
    "pick": "Return a copy of the object, filtered to only have values for the allowed keys (or array of valid keys). Alternatively accepts a predicate indicating which keys to pick.",
    "omit": "Return a copy of the object, filtered to omit the disallowed keys (or array of keys). Alternatively accepts a predicate indicating which keys to omit.",
    "defaults": "Returns object after filling in its undefined properties with the first value present in the following list of defaults objects.",
    "clone": "Create a shallow-copied clone of the provided plain object. Any nested objects or arrays will be copied by reference, not duplicated.",
    "tap": "Invokes interceptor with the object, and then returns object. The primary purpose of this method is to \"tap into\" a method chain, in order to perform operations on intermediate results within the chain.",
    "toPath": "Ensures that path is an array. If path is a string, it is wrapped in a single-element array; if it is an array already, it is returned unmodified.",
    "get": "Returns the specified property of object. path may be specified as a simple key, or as an array of object keys or array indexes, for deep property fetching. If the property does not exist or is undefined, the optional default is returned.",
    "has": "Does the object contain the given key? Identical to object.hasOwnProperty(key), but uses a safe reference to the hasOwnProperty function, in case it's been overridden accidentally.",
    "property": "Returns a function that will return the specified property of any passed-in object. path may be specified as a simple key, or as an array of object keys or array indexes, for deep property fetching.",
    "propertyOf": "Inverse of _.property. Takes an object and returns a function which will return the value of a provided property.",
    "matcher": "Returns a predicate function that will tell you if a passed in object contains all of the key/value properties present in attrs.",
    "isEqual": "Performs an optimized deep comparison between the two objects, to determine if they should be considered equal.",
    "isMatch": "Tells you if the keys and values in properties are contained in object.",
    "isEmpty": "Returns true if collection has no elements. For strings and array-like objects _.isEmpty checks if the length property is 0. For other objects, it returns true if the object has no enumerable own-properties. Note that primitive numbers, booleans and symbols are always empty by this definition.",
    "isElement": "Returns true if object is a DOM element.",
    "isArray": "Returns true if object is an Array.",
    "isObject": "Returns true if value is an Object. Note that JavaScript arrays and functions are objects, while (normal) strings and numbers are not.",
    "isArguments": "Returns true if object is an Arguments object.",
    "isFunction": "Returns true if object is a Function.",
    "isString": "Returns true if object is a String.",
    "isNumber": "Returns true if object is a Number (including NaN).",
    "isFinite": "Returns true if object is a finite Number.",
    "isBoolean": "Returns true if object is either true or false.",
    "isDate": "Returns true if object is a Date.",
    "isRegExp": "Returns true if object is a RegExp.",
    "isError": "Returns true if object inherits from an Error.",
    "isSymbol": "Returns true if object is a Symbol.",
    "isMap": "Returns true if object is a Map.",
    "isWeakMap": "Returns true if object is a WeakMap.",
    "isSet": "Returns true if object is a Set.",
    "isWeakSet": "Returns true if object is a WeakSet.",
    "isArrayBuffer": "Returns true if object is an ArrayBuffer.",
    "isDataView": "Returns true if object is a DataView.",
    "isTypedArray": "Returns true if object is a TypedArray.",
    "isNaN": "Returns true if object is NaN. Note: this is not the same as the native isNaN function, which will also return true for many other not-number values, such as undefined.",
    "isNull": "Returns true if the value of object is null.",
    "isUndefined": "Returns true if value is undefined.",
}

# Preferred Underscore.js argument labels for UI, excluding the first collection arg.
_METHOD_ARG_LABELS: Dict[str, List[str]] = {
    "map": ["iteratee", "context"],
    "reduce": ["iteratee", "memo", "context"],
    "reduceRight": ["iteratee", "memo", "context"],
    "find": ["predicate", "context"],
    "filter": ["predicate", "context"],
    "reject": ["predicate", "context"],
    "every": ["predicate", "context"],
    "some": ["predicate", "context"],
    "all": ["predicate", "context"],
    "any": ["predicate", "context"],
    "contains": ["value", "fromIndex"],
    "pluck": ["propertyName"],
    "include": ["value"],
    "where": ["properties"],
    "findWhere": ["properties"],
    "invoke": ["methodName", "arguments"],
    "max": ["iteratee", "context"],
    "min": ["iteratee", "context"],
    "sortBy": ["iteratee", "context"],
    "groupBy": ["iteratee", "context"],
    "indexBy": ["iteratee", "context"],
    "countBy": ["iteratee", "context"],
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
    "sortedIndex": ["value", "iteratee", "context"],
    "findIndex": ["predicate", "context"],
    "findLastIndex": ["predicate", "context"],
    "range": ["start", "stop", "step"],
    "keys": [],
    "allKeys": [],
    "values": [],
    "mapObject": ["iteratee", "context"],
    "pairs": [],
    "invert": [],
    "create": ["prototype", "props"],
    "functions": [],
    "findKey": ["predicate", "context"],
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
    "context": ["context"],
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
            coll_orig = us.obj if _is_underscore_instance(us) else base_obj
            # Create a deep copy to avoid mutation
            coll = copy.deepcopy(coll_orig)
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

        # Translate UI-labeled args back to internal parameter names
        ui_labels = _METHOD_ARG_LABELS.get(method_name)
        translated: Dict[str, Any] = {}
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
                    # Allow JSON text that decodes to a list/tuple
                    if isinstance(val, str):
                        val = _parse_json(val, val)
                    if isinstance(val, (list, tuple)):
                        call_args.extend(val)
                    else:
                        call_args.append(val)
                else:
                    call_args.append(val)

        # Append json-based extras
        if isinstance(extra_args, list):
            call_args.extend(extra_args)
        call_kwargs: Dict[str, Any] = {}
        if isinstance(extra_kwargs, dict):
            call_kwargs.update(extra_kwargs)

        m = getattr(us, method_name)
        result_value = m(*call_args, **call_kwargs)
        # Always return both the chain (for further chaining) and the immediate value
        if iteratee_present:
            # When iteratee is present but not using graph expansion, the method may
            # return a list or other structure. Expose it as the second output in addition
            # to the chain, to keep consistency with non-graph path.
            # Extract the actual value if it's a chained instance
            actual_value = result_value.value() if _is_underscore_instance(result_value) else result_value
            return (us, actual_value if actual_value is not None else [])
        # Extract the actual value if it's a chained instance
        actual_value = result_value.value() if _is_underscore_instance(result_value) else result_value
        return (us, actual_value)

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
        # Chain + immediate value (list for map-like), expose as 'result'
        cd["RETURN_TYPES"] = (CHAIN_T, LIST_T)
        sec_name = "result" if method_name == "map" else "result"
        # cd["RETURN_NAMES"] = ("chain", sec_name)
        cd["OUTPUT_IS_LIST"] = (False, True)
    else:
        # Chain + immediate value; specialize common known methods
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
        if method_name in boolean_returns:
            cd["RETURN_TYPES"] = (CHAIN_T, BOOLEAN_T)
        elif method_name in list_returns:
            cd["RETURN_TYPES"] = (CHAIN_T, LIST_T)
            cd["OUTPUT_IS_LIST"] = (False, True)
        elif method_name in dict_returns:
            cd["RETURN_TYPES"] = (CHAIN_T, DICT_T)
        elif method_name in int_returns:
            cd["RETURN_TYPES"] = (CHAIN_T, INT_T)
        else:
            cd["RETURN_TYPES"] = (CHAIN_T, ANYTYPE)
        # cd["RETURN_NAMES"] = ("chain", "result")

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
        # Preferred Underscore.js labels for this method
        labels = _METHOD_ARG_LABELS.get(method_name)
        if labels is None:
            # Fallback: show internal parameter names
            for pname in param_names:
                optional[pname] = (ANYTYPE, {"tooltip": f"Argument: {pname} (JSON allowed for arrays/objects)"})
        else:
            for lbl in labels:
                optional[lbl] = (ANYTYPE, {"tooltip": f"{lbl}: JSON allowed for arrays/objects where applicable."})
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
CLAZZES = [UnderscoreChain, UnderscoreValue, ] + _generated_classes
