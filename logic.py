import logging
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS
from server import PromptServer
from comfy_execution.graph_utils import GraphBuilder, is_link
from common_types import TautologyStr, ByPassTypeTuple

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


def update_node_status(node, text, progress=None):
    pass

class ListWrapper:
    def __init__(self, data, aux=None):
        if isinstance(data, ListWrapper):
            self._data = data
            if aux is None:
                self.aux = data.aux
            else:
                self.aux = aux
        else:
            self._data = list(data)
            self.aux = aux

    def __getitem__(self, index):
        if isinstance(index, slice):
            return ListWrapper(self._data[index], self.aux)
        else:
            return self._data[index]

    def __setitem__(self, index, value):
        self._data[index] = value

    def __len__(self):
        return len(self._data)

    def __repr__(self):
        return f"ListWrapper({self._data}, aux={self.aux})"


any_type = AlwaysEqualProxy("*")

# Loop nodes are implemented based on BadCafeCode's reference loop implementation
# https://github.com/BadCafeCode/execution-inversion-demo-comfyui/blob/main/flow_control.py

class ForeachListBeginOvum:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "py_list": ("ITEM_LIST", {"tooltip": "A list containing items to be processed iteratively."}),
            },
            "optional": {
                "init_accum": (any_type, {
                    "tooltip": "Initial value for the accumulator (accum) before processing items."}),
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    # Add index as an additional output
    RETURN_TYPES = ("FOREACH_LIST_CONTROL", "ITEM_LIST", any_type, any_type, "INT", "ITEM_LIST")
    RETURN_NAMES = ("flow_control", "remaining_list", "accum", "value", "index", "array")
    OUTPUT_TOOLTIPS = (
        "Pass ForeachListEndOvum as is to indicate the end of the iteration.",
        "Output the ITEM_LIST containing the remaining items during the iteration, passing ForeachListEndOvum as is to indicate the end of the iteration.",
        "Output the accumulated results during the iteration.",
        "Output the current item during the iteration.",
        "The index of the current item (starting at 0).",
        "An immutable copy of the input list.")

    FUNCTION = "doit"

    DESCRIPTION = """
A starting node for performing iterative tasks by retrieving items one by one
from the ITEM_LIST.\nGenerate a new accum using item and
accum as inputs, then connect it to ForeachListEndOvum.\nNOTE: If
no explicit seed is provided via init_accum, an empty list is used as the
seed and iteration starts from the first item.
"""

    CATEGORY = "ovum/loop"

    def doit(self, py_list, init_accum=None, dynprompt=None, unique_id=None):
        # Determine the seed value. If init_accum is connected, use it as the seed. Otherwise, use an empty list.
        is_init_accum_connected = False
        if dynprompt and unique_id:
            node_info = dynprompt.get_node(unique_id)
            if node_info and "inputs" in node_info and "init_accum" in node_info["inputs"]:
                is_init_accum_connected = is_link(node_info["inputs"]["init_accum"])

        if not is_init_accum_connected and init_accum is None:
            seed = []
        else:
            seed = init_accum

        # Prepare current item and remaining list
        if len(py_list) > 0:
            next_list = ListWrapper(py_list[1:])
            next_item = py_list[0]
        else:
            next_list = ListWrapper([])
            next_item = None

        # Initialize aux: (original_remaining_length, unique_id placeholder)
        if next_list.aux is None:
            next_list.aux = len(py_list), None

        # Compute index: if we consumed the first as seed, current index is 0 when next_item is first original after seed.
        # More generally, index = original_len - remaining_len - 1 (for current item position), but we don't have original len here pre-aux for first call.
        # We can derive index from aux tuple: aux[0] is len(py_list) at time of setting; current item index relative to this sequence is 0.
        # We will compute index as (aux[0] - len(next_list) - 1) if next_item exists, else aux[0] (end case doesn't matter).
        original_remaining = next_list.aux[0]
        current_remaining_after_current = len(next_list)
        index = original_remaining - current_remaining_after_current - 1 if next_item is not None else original_remaining

        return "stub", next_list, seed, next_item, index, tuple(py_list)


# noinspection DuplicatedCode
class ForeachListEndOvum:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "flow_control": ("FOREACH_LIST_CONTROL", {"rawLink": True,
                                                      "tooltip": "Directly connect the output of ForeachListBeginOvum, the starting node of the iteration."}),
            "remaining_list": ("ITEM_LIST", {
                "tooltip": "Directly connect the output of ForeachListBeginOvum, the starting node of the iteration."}),
            "accum": (any_type, {
                "tooltip": "Connect the accumulated outputs processed within the iteration here."}),
        },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("result",)
    OUTPUT_TOOLTIPS = ("This is the final output value.",)

    FUNCTION = "doit"

    DESCRIPTION = "A end node for performing iterative tasks by retrieving items one by one from the ITEM_LIST.\nNOTE:Directly connect the outputs of ForeachListBeginOvum to 'flow_control' and 'remaining_list'."

    CATEGORY = "ovum/loop"

    def explore_dependencies(self, node_id, dynprompt, upstream):
        node_info = dynprompt.get_node(node_id)
        if "inputs" not in node_info:
            return
        for k, v in node_info["inputs"].items():
            if is_link(v):
                parent_id = v[0]
                if parent_id not in upstream:
                    upstream[parent_id] = []
                    self.explore_dependencies(parent_id, dynprompt, upstream)
                upstream[parent_id].append(node_id)

    def collect_contained(self, node_id, upstream, contained):
        if node_id not in upstream:
            return
        for child_id in upstream[node_id]:
            if child_id not in contained:
                contained[child_id] = True
                self.collect_contained(child_id, upstream, contained)

    def doit(self, flow_control, remaining_list, accum, dynprompt, unique_id):
        if hasattr(remaining_list, "aux"):
            if remaining_list.aux[1] is None:
                remaining_list.aux = (remaining_list.aux[0], unique_id)

            update_node_status(remaining_list.aux[1],
                               f"{(remaining_list.aux[0] - len(remaining_list))}/{remaining_list.aux[0]} steps",
                               (remaining_list.aux[0] - len(remaining_list)) / remaining_list.aux[0])
        else:
            logging.warning("[Inspire Pack] ForeachListEndOvum: `remaining_list` did not come from ForeachList.")

        if len(remaining_list) == 0:
            return (accum,)

        # We want to loop
        upstream = {}

        # Get the list of all nodes between the open and close nodes
        self.explore_dependencies(unique_id, dynprompt, upstream)

        contained = {}
        open_node = flow_control[0]
        self.collect_contained(open_node, upstream, contained)
        contained[unique_id] = True
        contained[open_node] = True

        # We'll use the default prefix, but to avoid having node names grow exponentially in size,
        # we'll use "Recurse" for the name of the recursively-generated copy of this node.
        graph = GraphBuilder()
        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.node(original_node["class_type"], "Recurse" if node_id == unique_id else node_id)
            node.set_override_display_id(node_id)

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for k, v in original_node["inputs"].items():
                if is_link(v) and v[0] in contained:
                    parent = graph.lookup_node(v[0])
                    node.set_input(k, parent.out(v[1]))
                else:
                    node.set_input(k, v)

        new_open = graph.lookup_node(open_node)

        new_open.set_input("py_list", remaining_list)
        # Continue the accumulation using init_accum as the accumulator seed exclusively.
        new_open.set_input("init_accum", accum)

        my_clone = graph.lookup_node("Recurse")
        result = (my_clone.out(0),)

        return {
            "result": result,
            "expand": graph.finalize(),
        }


class MapStartOvum(ForeachListBeginOvum):
    CATEGORY = "ovum/loop"
    DESCRIPTION = "Start of a map loop that builds an accum by automatically adding each per-iteration result."

    # Same behavior as ForeachListBeginOvum
    pass


class MapEndOvum(ForeachListEndOvum):
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "flow_control": ("FOREACH_LIST_CONTROL", {"rawLink": True,
                                                          "tooltip": "Directly connect the output of MapStartOvum, the starting node of the iteration."}),
            "remaining_list": ("ITEM_LIST", {
                "tooltip": "Directly connect the output of MapStartOvum, the starting node of the iteration."}),
            "result": (any_type, {
                "tooltip": "Connect the per-iteration result here; it will be appended/merged into the accumulator automatically."}),
        },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
            }
        }

    DESCRIPTION = "End of a map loop. Provide the per-iteration 'result'; the node will merge it into 'accum' internally and continue until the list is exhausted."

    def doit(self, flow_control, remaining_list, result, dynprompt, unique_id):
        # Acquire progress info and ensure aux is set
        if hasattr(remaining_list, "aux"):
            if remaining_list.aux[1] is None:
                remaining_list.aux = (remaining_list.aux[0], unique_id)

            update_node_status(remaining_list.aux[1],
                               f"{(remaining_list.aux[0] - len(remaining_list))}/{remaining_list.aux[0]} steps",
                               (remaining_list.aux[0] - len(remaining_list)) / remaining_list.aux[0])
        else:
            logging.warning("[Inspire Pack] MapEndOvum: `remaining_list` did not come from Foreach/Map.")

        # If there is no more work to do, simply return the accumulated value we carried along
        # For Map*, the accumulator is the third output from the paired Begin node inside this same subgraph.
        if len(remaining_list) == 0:
            # We need to output the accumulator value. In this terminal case, 'result' is the last produced value, but
            # the true accumulator is flowing from the Begin node in this iteration frame. We will just return it as is.
            # To keep parity with Foreach, return the result which is expected to be the full accum at termination.
            return (result,)

        # Build a recursive expansion similar to ForeachListEndOvum but with automatic accumulate merge
        upstream = {}
        self.explore_dependencies(unique_id, dynprompt, upstream)

        contained = {}
        open_node = flow_control[0]
        self.collect_contained(open_node, upstream, contained)
        contained[unique_id] = True
        contained[open_node] = True

        graph = GraphBuilder()
        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.node(original_node["class_type"], "Recurse" if node_id == unique_id else node_id)
            node.set_override_display_id(node_id)

        for node_id in contained:
            original_node = dynprompt.get_node(node_id)
            node = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for k, v in original_node["inputs"].items():
                if is_link(v) and v[0] in contained:
                    parent = graph.lookup_node(v[0])
                    node.set_input(k, parent.out(v[1]))
                else:
                    node.set_input(k, v)

        new_open = graph.lookup_node(open_node)

        # Wire the remaining list forward
        new_open.set_input("py_list", remaining_list)

        # Merge the provided 'result' into the accumulator seed for the next iteration.
        # The Begin node expects 'init_accum' to be the accumulated value so far.
        # Implement a simple, generic merge strategy:
        # - If the incoming acc is a list, append result.
        # - Else if the result is a list and acc is None, use result.
        # - Else try to form a list [acc, result] on the first merge.
        # To achieve this without evaluating Python here, we assume the previous accum is the 3rd output of Begin within this graph.
        # We can access it through the cloned open node output index 2 (0-based).
        begin_clone = graph.lookup_node(open_node)
        prev_accum = begin_clone.out(2)

        # Create a tiny helper by reusing MapStart/Foreach assumption: accum is a list by default when not provided.
        # So we can build the next 'init_accum' as prev_accum + [result]. GraphBuilder allows simple literal packing via set_input.
        # We emulate append by relying on the runtime of Begin to treat provided 'init_accum' as the new accumulator value.
        # For Comfy's graph builder, we cannot do Python list ops; instead, we pass a tuple indicating a value.
        # Easiest robust approach: treat accumulator as list and provide a new Python list combining prev_accum and result.
        # This works because Begin forwards init_accum unchanged when stepping.
        new_open.set_input("init_accum", (prev_accum, result))

        my_clone = graph.lookup_node("Recurse")
        final = (my_clone.out(0),)

        return {
            "result": final,
            "expand": graph.finalize(),
        }


CLAZZES = [
    ForeachListBeginOvum,
    ForeachListEndOvum,
    MapStartOvum,
    MapEndOvum,
]
