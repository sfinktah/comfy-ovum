try:
    from comfy_execution.graph_utils import GraphBuilder as _BaseGraphBuilder, is_link
except Exception:
    _BaseGraphBuilder = None

# Wrapper GraphBuilder that logs node creation, input assignments, output handles, and display-id changes
if _BaseGraphBuilder is not None:
    def _safe_str(x, maxlen=120):
        try:
            s = repr(x)
        except Exception:
            try:
                s = str(x)
            except Exception:
                s = f"<unprintable {type(x).__name__}>"
        if s is None:
            s = "None"
        if len(s) > maxlen:
            s = s[:maxlen] + "…"
        return s

    class GraphBuilder(_BaseGraphBuilder):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            # Maps id(handle) -> {node_id, class_type, port}
            self.__output_handles = {}
            # Cache for wrapped node proxies: id(real_node) -> proxy
            self.__wrap_cache = {}
            # Optional: remember class_type per node object id
            self.__node_classes = {}

        def _wrap_node(self, real, class_type=None):
            key = id(real)
            if key in self.__wrap_cache:
                return self.__wrap_cache[key]
            if class_type is None:
                # Best-effort introspection
                try:
                    class_type = getattr(real, "class_type", None)
                except Exception:
                    class_type = None
            proxy = _LoggingNode(self, real, class_type)
            self.__wrap_cache[key] = proxy
            if class_type:
                self.__node_classes[key] = class_type
            return proxy

        def _record_output(self, handle, src_node_proxy, port):
            try:
                self.__output_handles[id(handle)] = {
                    "node_id": src_node_proxy._dbg_id(),
                    "class_type": src_node_proxy._dbg_class(),
                    "port": port,
                }
            except Exception:
                pass

        def _describe_value(self, v):
            try:
                # If it's an output handle seen via out()
                if id(v) in self.__output_handles:
                    m = self.__output_handles[id(v)]
                    return f"link(output): {m['node_id']}:{m['port']} ({m['class_type']})"
                # If it's a "link by id" style [node_id, out_index/name]
                if isinstance(v, (list, tuple)) and len(v) == 2 and isinstance(v[0], (str, int, float)):
                    return f"link(by_id): {v[0]}:{v[1]}"
                # Otherwise it's a literal
                return f"literal({type(v).__name__})={_safe_str(v)}"
            except Exception:
                return f"literal({type(v).__name__})"

        def node(self, class_type, *args, **kwargs):
            created = super().node(class_type, *args, **kwargs)
            proxy = self._wrap_node(created, class_type)

            # Determine passed id if provided positionally
            passed_id = None
            if len(args) > 0 and isinstance(args[0], (str, int, float)):
                passed_id = args[0]
            try:
                # print(f"[GraphBuilder] node created: class_type={class_type}, id={proxy._dbg_id()}, passed_id={passed_id}")
                # Log all inputs assigned at creation time
                if kwargs:
                    for k, v in kwargs.items():
                        desc = self._describe_value(v)
                        # print(f"[GraphBuilder]   input on create: target={proxy._dbg_id()}({class_type}) .{k} = {desc}")
            except Exception:
                pass
            return proxy

        def lookup_node(self, name):
            real = super().lookup_node(name)
            proxy = self._wrap_node(real)
            return proxy

    class _LoggingNode:
        def __init__(self, builder, real, class_type):
            self.__builder = builder
            self.__real = real
            self.__class_type = class_type
            self.__cached_id = None

        def _dbg_class(self):
            return self.__class_type or getattr(self.__real, "class_type", None) or "?"

        def _dbg_id(self):
            if self.__cached_id is not None:
                return self.__cached_id
            node_id = None
            for attr in ("display_id", "id", "node_id", "name", "_id", "identifier"):
                try:
                    val = getattr(self.__real, attr, None)
                    if isinstance(val, (str, int, float)):
                        node_id = val
                        break
                except Exception:
                    pass
            self.__cached_id = node_id
            return node_id

        def set_input(self, key, value):
            try:
                desc = self.__builder._describe_value(value)
                # print(f"[GraphBuilder] set_input: target={self._dbg_id()}({self._dbg_class()}).{key} = {desc}")
            except Exception:
                pass
            return self.__real.set_input(key, value)

        def out(self, port):
            handle = self.__real.out(port)
            try:
                self.__builder._record_output(handle, self, port)
                # print(f"[GraphBuilder] out: source={self._dbg_id()}({self._dbg_class()}), port={port}, handle_id={id(handle)}")
            except Exception:
                pass
            return handle

        def set_override_display_id(self, display_id):
            # try:
            #     print(f"[GraphBuilder] set_override_display_id: node={self._dbg_id()}({self._dbg_class()}) -> {display_id}")
            # except Exception:
            #     pass
            ret = self.__real.set_override_display_id(display_id)
            self.__cached_id = display_id
            return ret

        def __getattr__(self, item):
            return getattr(self.__real, item)
else:
    GraphBuilder = None
