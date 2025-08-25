import json

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
        if index>0:
            index=0
        item = super().__getitem__(index)
        if isinstance(item, str):
            return TautologyStr(item)
        return item

any_type = AlwaysEqualProxy("*")

class TextFormatNode:
    """
    Base class for nodes that take a number of inputs and format them
    into a single string.
    """

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)

    CATEGORY = "ovum"
    FUNCTION = "process"

    # noinspection PyMethodMayBeStatic
    def process(self, fmt, **kwargs) -> tuple:

        # Build ordered values list where values[i] corresponds to arg{i}
        values = []
        arg_items = []
        for key, val in kwargs.items():
            if isinstance(key, str) and key.startswith("arg"):
                try:
                    idx = int(key[3:])
                except Exception:
                    continue
                try:
                    if isinstance(val, str):
                        tv = val
                    elif isinstance(val, list):
                        tv = val
                    elif isinstance(val, (int, float, bool)):
                        # Keep scalar types as-is (no string conversion)
                        tv = val
                    else:
                        # Non-scalar, non-list, non-str: JSON serialize
                        tv = json.dumps(val)
                except Exception:
                    tv = str(val)
                arg_items.append((idx, tv))

        if arg_items:
            max_idx = max(i for i, _ in arg_items)
            values = [None] * (max_idx + 1)
            for i, tv in arg_items:
                if 0 <= i < len(values):
                    values[i] = tv
            # Trim trailing None entries
            while values and values[-1] is None:
                values.pop()
            # Replace any interior None with empty strings
            for i, x in enumerate(values):
                if x is None:
                    values[i] = ""
        else:
            values = []

        # if not extra_pnginfo:
        #     pass
        # elif (not isinstance(extra_pnginfo[0], dict) or "workflow" not in extra_pnginfo[0]):
        #     pass
        # else:
        #     workflow = extra_pnginfo[0]["workflow"]
        #     node = next((x for x in workflow["nodes"] if str(x["id"]) == unique_id[0]), None)
        #     if node:
        #         node["widgets_values"] = [values]
        # if isinstance(values, list) and len(values) == 1:
        #     return {"ui": {"text": values}, "result": (values[0],), }
        # else:
        #     return {"ui": {"text": values}, "result": (values,), }
        result = fmt.format(**kwargs)
        return (result,)


class PythonStringFormat(TextFormatNode):
    NAME = "Python String Format"
    @classmethod
    def INPUT_TYPES(s):
        # dyn_inputs = {"arg0": (any_type, {"lazy": True, "tooltip": "Any input. When connected, one more input slot is added."}), }

        inputs = {
            "required": {
                "fmt": ("STRING", {"multiline": True, "tooltip": "A python format string. Use {arg0} to insert the first input, {arg1} for the second, etc. Anything that works in python's .format works here."}),
                # "select": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1, "tooltip": "The input number you want to output among the inputs"}),
                # "sel_mode": ("BOOLEAN", {"default": False, "label_on": "select_on_prompt", "label_off": "select_on_execution", "forceInput": False,
                #                          "tooltip": "In the case of 'select_on_execution', the selection is dynamically determined at the time of workflow execution. 'select_on_prompt' is an option that exists for older versions of ComfyUI, and it makes the decision before the workflow execution."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO", },
            # "optional": dyn_inputs,
        }

        return inputs


class TextFormat2Node(TextFormatNode):
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "fmt": ("STRING", {"multiline": True}),
            },
            "optional": {
                "arg0": ("STRING", {"forceInput": True}),
                "arg1": ("STRING", {"forceInput": True}),
            }
        }


class TextFormat5Node(TextFormatNode):
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "fmt": ("STRING", {"multiline": True}),
            },
            "optional": {
                "arg0": ("STRING", {"forceInput": True}),
                "arg1": ("STRING", {"forceInput": True}),
                "arg2": ("STRING", {"forceInput": True}),
                "arg3": ("STRING", {"forceInput": True}),
                "arg4": ("STRING", {"forceInput": True}),
            }
        }


class TextFormat10Node(TextFormatNode):
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "fmt": ("STRING", {"multiline": True}),
            },
            "optional": {
                "arg0": ("STRING", {"forceInput": True}),
                "arg1": ("STRING", {"forceInput": True}),
                "arg2": ("STRING", {"forceInput": True}),
                "arg3": ("STRING", {"forceInput": True}),
                "arg4": ("STRING", {"forceInput": True}),
                "arg5": ("STRING", {"forceInput": True}),
                "arg6": ("STRING", {"forceInput": True}),
                "arg7": ("STRING", {"forceInput": True}),
                "arg8": ("STRING", {"forceInput": True}),
                "arg9": ("STRING", {"forceInput": True}),
            }
        }

CLAZZES = [PythonStringFormat]
