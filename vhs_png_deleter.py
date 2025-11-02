import os
from typing import List, Tuple, Union, Any

# Comfy types are provided by ComfyUI at runtime; we only need the names here
STRING = "STRING"


class VhsPngDeletingOvum:
    """
    Deletes .png files created by Video Helper Suite (VHS) from the filesystem and
    filters them out of an input list of filenames. If the input is not a list,
    returns it unchanged.

    Also supports a tuple input shaped like (flag: bool, filenames: List[str]) —
    the list is processed the same way and the original flag is preserved in the output.
    """

    NAME = "VHS PNG deleter"
    CATEGORY = "ovum/workflow"
    FUNCTION = "run"

    # Allow list inputs/outputs (list of STRING)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)

    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("filenames",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filenames": (STRING, {"default": ""}),
            }
        }

    @staticmethod
    def _filter_and_delete_pngs(items: List[Any]) -> List[Any]:
        remaining: List[Any] = []
        for item in items:
            if isinstance(item, str):
                _, ext = os.path.splitext(item)
                if ext.lower() == ".png":
                    try:
                        if os.path.exists(item):
                            os.remove(item)
                    except Exception:
                        # Silently ignore any deletion errors
                        pass
                    # Skip adding this png file to remaining
                    continue
            remaining.append(item)
        return remaining

    def run(self, filenames: Union[str, List[str], Tuple[bool, List[str]]]):
        # Support tuple input like: (True, ["file.png", "file.mp4"]) — preserve first element
        if isinstance(filenames, tuple) and len(filenames) == 2 and isinstance(filenames[0], bool) and isinstance(filenames[1], list):
            flag, names_list = filenames
            remaining = self._filter_and_delete_pngs(names_list)
            return ((flag, remaining),)

        # If it's a list, drop .png entries and delete them from disk
        if isinstance(filenames, list):
            remaining = self._filter_and_delete_pngs(filenames)
            return (remaining,)

        # Otherwise just return the input unchanged
        return (filenames,)


CLAZZES = [VhsPngDeletingOvum]
