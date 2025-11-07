import os
import logging
from typing import List, Tuple, Union, Any
import folder_paths

# Comfy types are provided by ComfyUI at runtime; we only need the names here
STRING = "STRING"

# Module logger
logger = logging.getLogger(__name__)


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
    DESCRIPTION = """
Deletes .png files created by Video Helper Suite (VHS) from the filesystem and filters them out of an input list of filenames.
"""

    # Allow list inputs/outputs (list of STRING)
    # INPUT_IS_LIST = True
    # OUTPUT_IS_LIST = (True,)

    RETURN_TYPES = ("VHS_FILENAMES", STRING)
    RETURN_NAMES = ("filenames", "first_filename")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filenames": ("VHS_FILENAMES", ),
            }
        }

    @staticmethod
    def _filter_and_delete_pngs(items: List[Any]) -> List[Any]:
        # Perhaps we should: Find a way to confirm the location of the deleted file with regard to the output directory
        # that doesn't involve `realpath` as there are symbolic links that will make things very confusing? Lets see how
        # this goes for now.
        remaining: List[Any] = []
        base_output_dir = os.path.realpath(folder_paths.get_output_directory())
        for item in items:
            if isinstance(item, str):
                _, ext = os.path.splitext(item)
                if ext.lower() == ".png":
                    item_path = os.path.realpath(item)
                    should_delete = False
                    reason = None
                    try:
                        if not os.path.exists(item_path):
                            reason = "does not exist"
                        elif not os.path.isfile(item_path):
                            reason = "is not a file"
                        else:
                            try:
                                in_output = os.path.commonpath([base_output_dir, item_path]) == base_output_dir
                            except Exception:
                                in_output = False
                            if in_output:
                                should_delete = True
                            else:
                                reason = f"outside output directory ({base_output_dir})"
                        if should_delete:
                            try:
                                os.remove(item_path)
                            except Exception as e:
                                # Log deletion failure as warning, but continue filtering
                                logger.warning("Failed to delete PNG '%s': %s", item_path, e)
                        else:
                            logger.warning("Refusing to delete PNG '%s': %s", item_path, reason)
                    except Exception:
                        # Never let unexpected errors break the node; still filter out the PNG
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
            # Determine first filename (first string) after filtering
            first_filename = next((x for x in remaining if isinstance(x, str)), '')
            return ((flag, remaining), first_filename)

        # If it's a list, drop .png entries and delete them from disk
        if isinstance(filenames, list):
            remaining = self._filter_and_delete_pngs(filenames)
            first_filename = next((x for x in remaining if isinstance(x, str)), '')
            return (remaining, first_filename)

        # Otherwise just return the input unchanged; no list was found
        return (filenames, '')


CLAZZES = [VhsPngDeletingOvum]
