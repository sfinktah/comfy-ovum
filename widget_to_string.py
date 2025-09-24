import json
import os
from pathlib import Path
import folder_paths  # type: ignore

# noinspection PyUnresolvedReferences,PyPackageRequirements
from comfy.comfy_types.node_typing import IO
# noinspection PyUnresolvedReferences,PyPackageRequirements
from nodes import PreviewImage, SaveImage
import logging
from metadata.metadata_processor import MetadataProcessor

from numpy.__config__ import CONFIG

logger = logging.getLogger(__name__)
matches = None


class WidgetToStringOvum:
    @classmethod
    def IS_CHANGED(cls,*,id,node_title,any_input,**kwargs):
        if any_input is not None and (id != 0 or node_title != ""):
            return float("NaN")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "id": ("STRING", {"multiline": False}),
                "widget_name": ("STRING", {"multiline": False}),
                "return_all": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "any_input": (IO.ANY, ),
                "node_title": ("STRING", {"multiline": False}),
                "allowed_float_decimals": ("INT", {"default": 2, "min": 0, "max": 10, "tooltip": "Number of decimal places to display for float values"}),

            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO",
                       "prompt": "PROMPT",
                       "unique_id": "UNIQUE_ID",},
        }

    RETURN_TYPES = ("STRING", )
    FUNCTION = "get_widget_value"
    CATEGORY = "ovum/KJNodes"
    DESCRIPTION = """
Selects a node and it's specified widget and outputs the value as a string.  
If no node id or title is provided it will use the 'any_input' link and use that node.  
To see node id's, enable node id display from Manager badge menu.  
Alternatively you can search with the node title. Node titles ONLY exist if they  
are manually edited!  
The 'any_input' is required for making sure the node you want the value from exists in the workflow.
"""

    @classmethod
    def get_widget_value(cls, id, widget_name, extra_pnginfo, prompt, unique_id, return_all=False, any_input=None, node_title="", allowed_float_decimals=2):
        from .metadata.metadata_processor import MetadataProcessor
        workflow = extra_pnginfo["workflow"]
        meta = MetadataProcessor(workflow, prompt)
        # find node
        node_full_id = meta.findWorkflowNodeFullId(id=id, node_title=node_title, any_input=any_input, unique_id=unique_id)
        # return value
        if return_all:
            # Build string from native inputs
            values = prompt.get(str(node_full_id))
            if not values or 'inputs' not in values:
                raise ValueError(f"No prompt entry found for node id: {node_full_id}")
            formatted_items = []
            for k, v in (values.get('inputs') or {}).items():
                if isinstance(v, float):
                    formatted_items.append(f"{k}: {v:.{allowed_float_decimals}f}")
                else:
                    formatted_items.append(f"{k}: {str(v)}")
            return (', '.join(formatted_items),)
        else:
            native = meta.getPromptInputValue(node_full_id, widget_name)[0]
            if isinstance(native, float):
                return (f"{native:.{allowed_float_decimals}f}",)
            return (str(native),)

class WorkflowWidgetToAnyOvum:
    @classmethod
    def IS_CHANGED(cls,*,id,node_title,**kwargs):
        if id != 0 or node_title != "":
            return float("NaN")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "id": ("STRING", {"multiline": False}),
                "widget_name": ("STRING", {"multiline": False}),
                "return_all": ("BOOLEAN", {"default": False}),
                "PROMPT&WORKFLOW": ("DICT",),
            },
            "optional": {
                "node_title": ("STRING", {"multiline": False}),
            },
            "hidden": {"unique_id": "UNIQUE_ID",},
        }

    RETURN_TYPES = (IO.ANY, )
    FUNCTION = "get_widget_value"
    CATEGORY = "ovum/workflow"
    DESCRIPTION = """
Selects a node and it's specified widget and outputs the value as its original type.  
Takes a PROMPT&WORKFLOW dict input containing 'workflow' and 'prompt' keys.
To see node id's, enable node id display from Manager badge menu.  
Alternatively you can search with the node title. Node titles ONLY exist if they  
are manually edited!
"""

    @classmethod
    def get_widget_value(cls, id, widget_name, unique_id, return_all=False, node_title="", **kwargs):
        promptAndWorkflow = kwargs["PROMPT&WORKFLOW"]
        meta = MetadataProcessor(promptAndWorkflow['workflow'], promptAndWorkflow['prompt'])

        # find node
        node_full_id = meta.findWorkflowNodeFullId(id=id, node_title=node_title, any_input=None, unique_id=unique_id)

        # return value
        if return_all:
            # Build dict from native inputs
            values = promptAndWorkflow['prompt'].get(str(node_full_id))
            if not values or 'inputs' not in values:
                raise ValueError(f"No prompt entry found for node id: {node_full_id}")
            return (values.get('inputs') or {},)
        else:
            result = meta.getPromptInputValue(node_full_id, widget_name)
            if result is None:
                raise ValueError(f"Widget '{widget_name}' not found for node id: {node_full_id}")
            if not isinstance(result, (list, tuple)) or len(result) == 0:
                raise ValueError(f"Invalid result format for widget '{widget_name}' in node id: {node_full_id}")
            native = result[0]
            return (native,)

METADATA_RAW = ("METADATA_RAW", {"forceInput": True})

class CImagePreviewFromMetadata(PreviewImage):
    def __init__(self):
        self.data_cached = None
        self.data_cached_text = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # if it is required, in next node does not receive any value even the cache!
            },
            "optional": {
                "metadata_raw": METADATA_RAW,
            },
        }

    CATEGORY = "ovum/crystools"
    RETURN_TYPES = ("METADATA_RAW",)
    RETURN_NAMES = ("Metadata RAW",)
    OUTPUT_NODE = True

    FUNCTION = "execute"

    def execute(self, metadata_raw=None):
        text = ""
        title = ""
        data = {
            "result": [''],
            "ui": {
                "text": [''],
                "images": [],
            }
        }

        if metadata_raw is not None and metadata_raw != '':
            promptFromImage = {}
            if "prompt" in metadata_raw:
                promptFromImage = metadata_raw["prompt"]

            title = "Source: Metadata RAW\n"
            text += buildPreviewText(metadata_raw)
            text += f"Prompt from image:\n"
            text += json.dumps(promptFromImage, indent=CONFIG["indent"])

            images = self.resolveImage(metadata_raw["fileinfo"]["filename"])
            result = metadata_raw

            data["result"] = [result]
            data["ui"]["images"] = images

            self.data_cached_text = text
            self.data_cached = data

        elif metadata_raw is None and self.data_cached is not None:
            title = "Source: Metadata RAW - CACHED\n"
            data = self.data_cached
            text = self.data_cached_text

        else:
            logger.debug("Source: Empty on CImagePreviewFromMetadata")
            text = "Source: Empty"

        data["ui"]["text"] = [title + text]
        return data

    def resolveImage(self, filename=None):
        images = []

        if filename is not None:
            image_input_folder = os.path.normpath(folder_paths.get_input_directory())
            image_input_folder_abs = Path(image_input_folder).resolve()

            image_path = os.path.normpath(filename)
            image_path_abs = Path(image_path).resolve()

            if Path(image_path_abs).is_file() is False:
                raise Exception('[ovum] file not found')

            try:
                # get common path, should be input/output/temp folder
                common = os.path.commonpath([image_input_folder_abs, image_path_abs])

                if common != image_input_folder:
                    raise Exception("Path invalid (should be in the input folder)")

                relative = os.path.normpath(os.path.relpath(image_path_abs, image_input_folder_abs))

                images.append({
                    "filename": Path(relative).name,
                    "subfolder": os.path.dirname(relative),
                    "type": "input"
                })

            except Exception as e:
                logger.warn(e)

        return images


CLAZZES = [WidgetToStringOvum, WorkflowWidgetToAnyOvum]