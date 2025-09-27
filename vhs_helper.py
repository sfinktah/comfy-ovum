import os
import re

import folder_paths


class SelectLatestOvum:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"filename_prefix": ("STRING", {'default': 'output/AnimateDiff', 'vhs_path_extensions': []}),
                             "filename_postfix": ("STRING", {"placeholder": ".webm"})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES =("Filename",)
    CATEGORY = "Video Helper Suite 🎥🅥🅗🅢"
    FUNCTION = "select_latest"
    EXPERIMENTAL = True

    def select_latest(self, filename_prefix, filename_postfix):
        assert False, "Not Reachable"

class NextVideoFilenameOvum:
    DESCRIPTION = (
        "Computes the next auto-numbered output base path that the VHS VideoCombine node would use, "
        "without creating any files. Given a filename prefix, it scans the target output folder for "
        "existing files like prefix_00001, prefix_00002, … and returns the next available base path "
        "(full folder plus prefix_00003) plus an extension such as mp4 or webm if required."
    )
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "filename_prefix": ("STRING", {"default": "AnimateDiff"}),
            },
            "optional": {
                "filename_extension": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("Filename",)
    CATEGORY = "ovum/workflow"
    FUNCTION = "get_next_filename"

    def get_next_filename(self, filename_prefix, filename_extension):
        # Assume save_output is True
        output_dir = folder_paths.get_output_directory()
        (full_output_folder, filename, _, _, _) = folder_paths.get_save_image_path(filename_prefix, output_dir)

        # Ensure folder exists before listing
        os.makedirs(full_output_folder, exist_ok=True)

        # Determine next available counter using same logic as VideoCombine
        max_counter = 0
        matcher = re.compile(f"{re.escape(filename)}_(\\d+)\\D*\\..+", re.IGNORECASE)
        for existing_file in os.listdir(full_output_folder):
            match = matcher.fullmatch(existing_file)
            if match:
                file_counter = int(match.group(1))
                if file_counter > max_counter:
                    max_counter = file_counter

        counter = max_counter + 1
        base_path_no_ext = os.path.join(full_output_folder, f"{filename}_{counter:05}")
        if filename_extension:
            return (base_path_no_ext + '.' + filename_extension,)
        return (base_path_no_ext,)

CLAZZES = [NextVideoFilenameOvum]