from .modules.impact import wildcards

class ExtensiblePromptProcessor:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "wildcard_text": (
                    "STRING",
                    {
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": "Enter a prompt using wildcard syntax.",
                    },
                ),
                "populated_text": (
                    "STRING",
                    {
                        "multiline": True,
                        "dynamicPrompts": False,
                        "tooltip": "The actual value passed during the execution of 'ExtensiblePromptProcessor' is what is shown here. The behavior varies slightly depending on the mode. Wildcard syntax can also be used in 'populated_text'.",
                    },
                ),
                "mode": (
                    ["populate", "fixed", "reproduce"],
                    {
                        "default": "populate",
                        "tooltip": "populate: Before running the workflow, it overwrites the existing value of 'populated_text' with the prompt processed from 'wildcard_text'. In this mode, 'populated_text' cannot be edited.\n"
                        "fixed: Ignores wildcard_text and keeps 'populated_text' as is. You can edit 'populated_text' in this mode.\n"
                        "reproduce: This mode operates as 'fixed' mode only once for reproduction, and then it switches to 'populate' mode.",
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xFFFFFFFFFFFFFFFF,
                        "tooltip": "Determines the random seed to be used for wildcard processing.",
                    },
                ),
                "Select to add Wildcard": (["Select the Wildcard to add to the text"],),
            },
        }

    CATEGORY = "ImpactPack/Prompt"

    DESCRIPTION = (
        "The 'ExtensiblePromptProcessor' processes text prompts written in wildcard syntax and outputs the processed text prompt.\n\n"
        "TIP: Before the workflow is executed, the processing result of 'wildcard_text' is displayed in 'populated_text', and the populated text is saved along with the workflow. If you want to use a seed converted as input, write the prompt directly in 'populated_text' instead of 'wildcard_text', and set the mode to 'fixed'."
    )

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("processed text",)
    FUNCTION = "doit"

    @staticmethod
    def process(**kwargs):
        return wildcards.process(**kwargs)

    def doit(self, *args, **kwargs):
        populated_text = ExtensiblePromptProcessor.process(
            text=kwargs["populated_text"], seed=kwargs["seed"]
        )
        return (populated_text,)


CLAZZES = [ExtensiblePromptProcessor]
