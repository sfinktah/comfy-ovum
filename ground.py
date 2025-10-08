from __future__ import annotations
from typing import Dict, List, Tuple, Any
from autonode import validate, node_wrapper, get_node_names_mappings, anytype

classes = []
node = node_wrapper(classes)


# ComfyUI node: Ground
# Purpose: An output-only sink node to force graph output semantics, analogous to connecting a component to ground.
# This node has no outputs. It exposes dynamically allocated inputs handled by the frontend UI.

@node
class Ground:
    custom_name = "Ground Ovum (GND)"
    FUNCTION = "sink"
    DESCRIPTION = """
A special sink/output node that acts like electrical ground. It has no outputs and is intended
to be the terminal that other nodes connect to in order to force output/realization of values.
In ComfyUI terms, this node sets OUTPUT_NODE = True specifically to force execution at the end
of a chain, much like you must connect a circuit to ground for current to flow.

Inputs are dynamic and created on the UI side (named gnd_1, gnd_2, ...). Backend accepts any
number of inputs and simply passes without producing outputs.
"""

    RETURN_TYPES: Tuple = ()
    OUTPUT_NODE = True
    CATEGORY = "ovum/util"

    @classmethod
    def INPUT_TYPES(cls):
        # Use a catch-all star type for dynamic inputs; UI will manage the slots
        # Returning at least one input name helps initial placement; name will be rewritten by UI
        return {
            "required": {
                "arg0": ("*",),
            }
        }

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # This node does not compute outputs; marking changed ensures execution paths are honored
        return float("NaN")


    def sink(self, *args, **kwargs):
        # No outputs by design; simply consume inputs
        return { "ui": { "nothing": "nothing" } }

CLASS_MAPPINGS, CLASS_NAMES = get_node_names_mappings(classes)
validate(classes)
