import logging
from typing import Any
from nodes import PreviewImage, SaveImage
from server import PromptServer
import comfy

logger = logging.getLogger(__name__)


class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __ne__(self, __value: object) -> bool:
        return False


anyType = AnyType("*")

class HaltToggle:
    """
    Halt workflow execution when 'stop_now' is True.

    If 'reset_after_stop' is True and a stop occurs, the node will auto-disable
    stopping exactly once on the next run for this same node instance, allowing
    the workflow to continue next time without manual intervention.

    The frontend will automatically handle halting and resetting based on .ui output values.

    Outputs:
      - passthrough: forwards any_input for convenience
      - effective_stop: the stop state actually applied on this invocation (after considering one-shot override)
      - reset_applied: True if a one-shot override was consumed this invocation
    """

    NAME = "Halt Toggle"
    DESCRIPTION = "Halts execution when enabled. Can auto-reset so the next run proceeds."
    CATEGORY = "ovum/control"
    FUNCTION = "run"

    RETURN_TYPES = (anyType, "BOOLEAN", "BOOLEAN")
    RETURN_NAMES = ("passthrough", "effective_stop", "reset_applied")
    OUTPUT_NODE = True
    OUTPUT_TOOLTIPS = ("Passthrough of any_input", "Whether stopping was actually applied", "Whether auto-reset was applied")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_input": (anyType, {"tooltip": "Optional passthrough input to keep graph wiring simple."}),
            },
            "required": {
                "stop_now": ("BOOLEAN", {"default": True, "tooltip": "When True, halt the workflow at this node."}),
                "reset_after_stop": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "If True and a stop occurs, automatically set stop_now to False on the next run.",
                    },
                ),
                "delay": ("INT", {"default": 0, "min": 0, "max": 60000, "tooltip": "Delay in milliseconds before halting workflow."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, stop_now: bool = True, reset_after_stop: bool = True, delay: int = 0, **kwargs):
        return (bool(stop_now), bool(reset_after_stop), int(delay))

    def run(self, stop_now: bool, reset_after_stop: bool, delay: int = 0, any_input: Any = None, unique_id: Any = None):
        effective_stop = bool(stop_now)

        # Set up return values (reset_applied is always False now since frontend handles reset)
        result = (any_input, effective_stop, False)

        # If we need to halt, communicate this via .ui
        if effective_stop:
            msg = f"[HaltToggle] Halting workflow because 'stop_now' is True (delay: {delay}ms)."
            logger.warning(msg)
            print(msg)

            # Immediate halt path: send UI event via PromptServer to reset toggle, then raise to stop
            if int(delay) == 0:
                try:
                    PromptServer.instance.send_sync("/ovum/halt_toggle", {
                        "node_id": unique_id,
                        "should_reset_toggle": bool(reset_after_stop),
                        "delay": 0,
                    })
                except Exception as e:
                    logger.exception("[HaltToggle] Failed to send PromptServer event: %s", e)
                # Raise ComfyUI interrupt to stop execution now
                raise comfy.model_management.InterruptProcessingException()

            # Delayed halt path: return .ui values telling frontend to halt and whether to reset toggle
            return {
                "ui": {
                    "should_halt": [True],
                    "should_reset_toggle": [bool(reset_after_stop)],
                    "delay": [int(delay)]
                },
                "result": result
            }

        # No halt; pass values through normally
        return {"result": result}



CLAZZES = [HaltToggle]
