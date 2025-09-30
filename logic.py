from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS

try:
    from comfy_execution.graph_utils import GraphBuilder, is_link
except:
    GraphBuilder = None

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

DEFAULT_FLOW_NUM = 2
MAX_FLOW_NUM = 20
any_type = AlwaysEqualProxy("*")

class whileLoopStart:
    NAME = "While Loop Start"

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "condition": ("BOOLEAN", {"default": True}),
            },
            "optional": {
            },
        }
        for i in range(MAX_FLOW_NUM):
            inputs["optional"]["initial_value%d" % i] = (any_type,)
        return inputs

    RETURN_TYPES = ByPassTypeTuple(tuple(["FLOW_CONTROL"] + [any_type] * MAX_FLOW_NUM))
    RETURN_NAMES = ByPassTypeTuple(tuple(["flow"] + ["value%d" % i for i in range(MAX_FLOW_NUM)]))
    FUNCTION = "while_loop_open"

    CATEGORY = "ovum/easy/while Loop"

    def while_loop_open(self, condition, **kwargs):
        values = []
        for i in range(MAX_FLOW_NUM):
            values.append(kwargs.get("initial_value%d" % i, None))
        return tuple(["stub"] + values)


class whileLoopEnd:
    NAME = "While Loop End"

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "condition": ("BOOLEAN", {}),
            },
            "optional": {
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }
        for i in range(MAX_FLOW_NUM):
            inputs["optional"]["initial_value%d" % i] = (any_type,)
        return inputs

    RETURN_TYPES = ByPassTypeTuple(tuple([any_type] * MAX_FLOW_NUM))
    RETURN_NAMES = ByPassTypeTuple(tuple(["value%d" % i for i in range(MAX_FLOW_NUM)]))
    FUNCTION = "while_loop_close"

    CATEGORY = "ovum/easy/while Loop"

    def explore_dependencies(self, node_id, dynprompt, upstream, parent_ids):
        node_info = dynprompt.get_node(node_id)
        if "inputs" not in node_info:
            return

        for k, v in node_info["inputs"].items():
            if is_link(v):
                parent_id = v[0]
                display_id = dynprompt.get_display_node_id(parent_id)
                display_node = dynprompt.get_node(display_id)
                class_type = display_node["class_type"]
                if class_type not in ['forLoopEnd', 'whileLoopEnd']:
                    parent_ids.append(display_id)
                if parent_id not in upstream:
                    upstream[parent_id] = []
                    self.explore_dependencies(parent_id, dynprompt, upstream, parent_ids)

                upstream[parent_id].append(node_id)

    def explore_output_nodes(self, dynprompt, upstream, output_nodes, parent_ids):
        for parent_id in upstream:
            display_id = dynprompt.get_display_node_id(parent_id)
            for output_id in output_nodes:
                id = output_nodes[output_id][0]
                if id in parent_ids and display_id == id and output_id not in upstream[parent_id]:
                    if '.' in parent_id:
                        arr = parent_id.split('.')
                        arr[len(arr)-1] = output_id
                        upstream[parent_id].append('.'.join(arr))
                    else:
                        upstream[parent_id].append(output_id)

    def collect_contained(self, node_id, upstream, contained):
        if node_id not in upstream:
            return
        for child_id in upstream[node_id]:
            if child_id not in contained:
                contained[child_id] = True
                self.collect_contained(child_id, upstream, contained)

    def while_loop_close(self, flow, condition, dynprompt=None, unique_id=None,**kwargs):
        if not condition:
            # We're done with the loop
            values = []
            for i in range(MAX_FLOW_NUM):
                values.append(kwargs.get("initial_value%d" % i, None))
            return tuple(values)

        # We want to loop
        this_node = dynprompt.get_node(unique_id)
        upstream = {}
        # Get the list of all nodes between the open and close nodes
        parent_ids = []
        self.explore_dependencies(unique_id, dynprompt, upstream, parent_ids)
        parent_ids = list(set(parent_ids))
        # Get the list of all output nodes between the open and close nodes
        prompts = dynprompt.get_original_prompt()
        output_nodes = {}
        for id in prompts:
            node = prompts[id]
            if "inputs" not in node:
                continue
            class_type = node["class_type"]
            class_def = ALL_NODE_CLASS_MAPPINGS[class_type]
            if hasattr(class_def, 'OUTPUT_NODE') and class_def.OUTPUT_NODE == True:
                for k, v in node['inputs'].items():
                    if is_link(v):
                        output_nodes[id] = v

        graph = GraphBuilder()
        self.explore_output_nodes(dynprompt, upstream, output_nodes, parent_ids)
        contained = {}
        open_node = flow[0]
        self.collect_contained(open_node, upstream, contained)
        contained[unique_id] = True
        contained[open_node] = True

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
        for i in range(MAX_FLOW_NUM):
            key = "initial_value%d" % i
            new_open.set_input(key, kwargs.get(key, None))
        my_clone = graph.lookup_node("Recurse")
        result = map(lambda x: my_clone.out(x), range(MAX_FLOW_NUM))
        return {
            "result": tuple(result),
            "expand": graph.finalize(),
        }


class forLoopStart:
    NAME = "For Loop Start"

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "total": ("INT", {"default": 1, "min": 1, "max": 100000, "step": 1}),
            },
            "optional": {
                "initial_value%d" % i: (any_type,) for i in range(1, MAX_FLOW_NUM)
            },
            "hidden": {
                "initial_value0": (any_type,),
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID"
            }
        }

    RETURN_TYPES = ByPassTypeTuple(tuple(["FLOW_CONTROL", "INT"] + [any_type] * (MAX_FLOW_NUM - 1)))
    RETURN_NAMES = ByPassTypeTuple(tuple(["flow", "index"] + ["value%d" % i for i in range(1, MAX_FLOW_NUM)]))
    FUNCTION = "for_loop_start"

    CATEGORY = "ovum/easy/for Loop"

    def for_loop_start(self, total, prompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        graph = GraphBuilder()
        i = 0
        if "initial_value0" in kwargs:
            i = kwargs["initial_value0"]

        initial_values = {("initial_value%d" % num): kwargs.get("initial_value%d" % num, None) for num in
                          range(1, MAX_FLOW_NUM)}
        while_open = graph.node("whileLoopStart", condition=total, initial_value0=i, **initial_values)
        outputs = [kwargs.get("initial_value%d" % num, None) for num in range(1, MAX_FLOW_NUM)]
        return {
            "result": tuple(["stub", i] + outputs),
            "expand": graph.finalize(),
        }


class forLoopEnd:
    NAME = "For Loop End"

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
            },
            "optional": {
                "initial_value%d" % i: (any_type, {"rawLink": True}) for i in range(1, MAX_FLOW_NUM)
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID"
            },
        }

    RETURN_TYPES = ByPassTypeTuple(tuple([any_type] * (MAX_FLOW_NUM - 1)))
    RETURN_NAMES = ByPassTypeTuple(tuple(["value%d" % i for i in range(1, MAX_FLOW_NUM)]))
    FUNCTION = "for_loop_end"

    CATEGORY = "ovum/easy/for Loop"



    def for_loop_end(self, flow, dynprompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        graph = GraphBuilder()
        while_open = flow[0]
        total = None

        # Using dynprompt to get the original node
        forstart_node = dynprompt.get_node(while_open)
        if forstart_node['class_type'] == 'forLoopStart':
            inputs = forstart_node['inputs']
            # Print all inputs
            for key, value in inputs.items():
                print(f"{forstart_node['class_type']} Input {key}: {value}")
            total = inputs['total']
        elif forstart_node['class_type'] == 'whileLoopStart':
            print("If you're reading this, then Gemini 2.5 was right and I was wrong -- sfinktah.")
            print(f"The winning class_type was: {forstart_node['class_type']}.")
            inputs = forstart_node['inputs']
            # Print all inputs
            for key, value in inputs.items():
                print(f"{forstart_node['class_type']} Input {key}: {value}")
            total = inputs['condition']
        elif forstart_node['class_type'] == 'mapArrayStart':
            print("If you're reading this, then Gemini 2.5 was wrong and I was less-wrong -- sfinktah.")
            print(f"The winning class_type was: {forstart_node['class_type']}.")
            inputs = forstart_node['inputs']
            # Print all inputs
            for key, value in inputs.items():
                print(f"{forstart_node['class_type']} Input {key}: {value}")
            print(f"Available keys in inputs: {str(inputs.keys())}")
            total = len(inputs['array'])
            print(f"Total was {total}")
        elif forstart_node['class_type'] == 'easy loadImagesForLoop':
            inputs = forstart_node['inputs']
            limit = inputs['limit']
            start_index = inputs['start_index']
            # Filter files by extension
            directory = inputs['directory']
            total = graph.node('easy imagesCountInDirectory', directory=directory, limit=limit, start_index=start_index, extension='*').out(0)
        else:
            print("If you're reading this, then Gemini 2.5 was wrong and I was marginally less clueless -- sfinktah.")
            print(f"The winning class_type was: {forstart_node['class_type']}.")


        sub = graph.node("easy mathInt", operation="add", a=[while_open, 1], b=1)
        cond = graph.node("easy compare", a=sub.out(0), b=total, comparison='a < b')
        input_values = {("initial_value%d" % i): kwargs.get("initial_value%d" % i, None) for i in
                        range(1, MAX_FLOW_NUM)}
        while_close = graph.node("whileLoopEnd",
                                 flow=flow,
                                 condition=cond.out(0),
                                 initial_value0=sub.out(0),
                                 **input_values)
        return {
            "result": tuple([while_close.out(i) for i in range(1, MAX_FLOW_NUM)]),
            "expand": graph.finalize(),
        }

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
    CATEGORY = "ovum/easy/list"

    def get_value(self, py_list, index):
        if not isinstance(py_list, list):
            raise ValueError("Input 'py_list' for getValueFromList must be a list.")
        if index < len(py_list):
            return (py_list[index],)
        else:
            print("getValueFromList: " + f"Index {index} out of bounds for list of length {len(py_list)}. Returning None.")
            return (None,)

class addValueToList:
    NAME = "Add Value to List"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (any_type,),
            },
            "optional": {
                "py_list": (any_type,),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("py_list",)
    FUNCTION = "add_value"
    CATEGORY = "ovum/easy/list"

    def add_value(self, value, py_list=None):
        if py_list is None or py_list == 0:
            new_list = []
        elif isinstance(py_list, list):
            new_list = py_list.copy()
        else:
            raise ValueError(
                f"Input 'py_list' for addValueToList must be a list, received {type(py_list)} ({str(py_list)}).")

        new_list.append(value)
        return (new_list,)


class mapArrayStart:
    NAME = "Map Array Start"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "array": (any_type,),
            },
            "optional": {
                "initial_value%d" % i: (any_type,) for i in range(3, MAX_FLOW_NUM)
            },
        }

    RETURN_TYPES = ByPassTypeTuple(tuple(["FLOW_CONTROL", any_type, "INT"] + [any_type] * (MAX_FLOW_NUM - 3)))
    RETURN_NAMES = ByPassTypeTuple(tuple(["flow", "value", "key"] + ["value%d" % i for i in range(3, MAX_FLOW_NUM)]))
    FUNCTION = "map_array_start"
    CATEGORY = "ovum/easy/map array"

    def map_array_start(self, array, **kwargs):
        if not isinstance(array, list):
            raise ValueError("Input 'array' for mapArrayStart must be a list.")

        graph = GraphBuilder()
        total = len(array)

        initial_values = {("initial_value%d" % i): kwargs.get("initial_value%d" % i, None) for i in range(3, MAX_FLOW_NUM)}

        for_start = graph.node("forLoopStart",
                               total=total,
                               initial_value1=[], # results list
                               initial_value2=array, # original array
                               **initial_values)

        # forLoopStart outputs: 0:flow, 1:index, 2:value1, 3:value2, ...
        # We need original array (value2, output 3) and index (output 1)
        get_value = graph.node("getValueFromList", py_list=for_start.out(3), index=for_start.out(1))

        passthrough_outputs = [for_start.out(i) for i in range(4, MAX_FLOW_NUM - 3 + 4)]

        return {
            "result": tuple([for_start.out(0), get_value.out(0), for_start.out(1)] + passthrough_outputs),
            "expand": graph.finalize(),
        }


class mapArrayEnd:
    NAME = "Map Array End"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "value_to_map": (any_type, {"rawLink": True}),
            },
            "optional": {
                "initial_value%d" % i: (any_type, {"rawLink": True}) for i in range(3, MAX_FLOW_NUM)
            },
            "hidden": {
                "dynprompt": "DYNPROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID"
            },
        }

    RETURN_TYPES = ByPassTypeTuple(tuple([any_type] + [any_type] * (MAX_FLOW_NUM - 3)))
    RETURN_NAMES = ByPassTypeTuple(tuple(["array"] + ["value%d" % i for i in range(3, MAX_FLOW_NUM)]))
    FUNCTION = "map_array_end"
    CATEGORY = "ovum/easy/map array"

    def map_array_end(self, flow, value_to_map, dynprompt=None, extra_pnginfo=None, unique_id=None, **kwargs):
        graph = GraphBuilder()
        for_start_id = flow[0]

        # for_start outputs: 0:flow, 1:index, 2:value1(results), 3:value2(array), ...
        # The current results list is at output 2 of the for_start node.
        print(f"addValueToList(py_list=[{for_start_id}, 2], value={str(value_to_map)})")
        add_to_list = graph.node("addValueToList", py_list=[for_start_id, 2], value=value_to_map)

        passthrough_values = {("initial_value%d" % i): kwargs.get("initial_value%d" % i, None) for i in
                              range(3, MAX_FLOW_NUM)}

        for_end = graph.node("forLoopEnd",
                             flow=flow,
                             initial_value1=add_to_list.out(0),  # new results list
                             initial_value2=[for_start_id, 3],  # passthrough original array
                             **passthrough_values)

        # for_end outputs: 0:value1, 1:value2, ...
        # The final results array is at output 0 (value1)
        final_passthroughs = [for_end.out(i) for i in range(2, MAX_FLOW_NUM - 1)]

        return {
            "result": tuple([for_end.out(0)] + final_passthroughs),
            "expand": graph.finalize(),
        }

CLAZZES = [
    whileLoopStart,
    whileLoopEnd,
    forLoopStart,
    forLoopEnd,
    getValueFromList,
    addValueToList,
    mapArrayStart,
    mapArrayEnd,
]
