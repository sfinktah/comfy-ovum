import os
from pathlib import Path
from prompt_server_routes import folder_paths


def normalize_path(path: str, forward_slashes: bool = True) -> str:
    """Normalize a path and optionally convert to forward slashes."""
    normalized = os.path.normpath(path)
    if forward_slashes:
        normalized = normalized.replace('\\', '/')
    return normalized


class FolderPathsNode:
    NAME = "Folder Paths"
    CATEGORY = "ovum/utils"
    FUNCTION = "get_paths"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path",)
    OUTPUT_IS_LIST = (False,)

    @classmethod
    def INPUT_TYPES(cls):
        # Dynamically get available methods from folder_paths
        available_methods = []
        if hasattr(folder_paths, '__dict__'):
            for attr_name in dir(folder_paths):
                if attr_name.startswith('get') and callable(getattr(folder_paths, attr_name, None)):
                    # Check if it's a method that returns a path or list of paths
                    try:
                        method = getattr(folder_paths, attr_name)
                        # Try to call it to see if it returns something path-like
                        # We'll be conservative and only include methods that don't require parameters
                        import inspect
                        sig = inspect.signature(method)
                        # Only include methods with no required parameters
                        if len([p for p in sig.parameters.values() if p.default == inspect.Parameter.empty]) == 0:
                            available_methods.append(attr_name)
                    except Exception:
                        continue


            available_methods.append("base_path")
            available_methods.append("models_dir")

        # Add some known common methods if not found dynamically
        # common_methods = ['get_input_directory', 'get_output_directory', 'get_temp_directory',
        #                  'get_user_directory', 'get_models_directory']
        # for method in common_methods:
        #     if hasattr(folder_paths, method) and method not in available_methods:
        #         available_methods.append(method)
        #
        # if not available_methods:
        #     available_methods = ['get_output_directory']  # fallback

        return {
            "required": {
                "method": (available_methods, {"default": available_methods[0] if available_methods else ""}),
            },
            "optional": {
                "absolute_paths": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "normalize_paths": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
                "forward_slashes": ("BOOLEAN", {"default": True, "label_on": "enabled", "label_off": "disabled"}),
            }
        }

    def get_paths(self, method: str, absolute_paths: bool = True, normalize_paths: bool = True, forward_slashes: bool = True):
        try:
            # Get the method from folder_paths
            if not hasattr(folder_paths, method):
                return (f"Error: Method '{method}' not found in folder_paths",)

            method_func = getattr(folder_paths, method)
            if method_func is str:
                result = method_func
            elif not callable(method_func):
                return (f"Error: '{method}' is not callable",)
            else:
                result = method_func()

            # Convert result to string
            if isinstance(result, (str, Path)):
                path_str = str(result)
            else:
                path_str = str(result)

            if not path_str:
                return ("",)

            path = Path(path_str)

            # Convert to absolute if requested
            if absolute_paths:
                path = path.resolve()

            final_path = str(path)

            # Normalize if requested
            if normalize_paths:
                final_path = normalize_path(final_path, forward_slashes=forward_slashes)
            elif forward_slashes:
                final_path = final_path.replace('\\', '/')

            return (final_path,)

        except Exception as e:
            return (f"Error calling {method}: {str(e)}",)


CLAZZES = [FolderPathsNode]
