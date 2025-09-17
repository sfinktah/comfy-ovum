import subprocess
import os
import platform
import mimetypes

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

any_typ = AnyType("*")

class OpenOutputViaShell:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (any_typ,),
                "filename": ("STRING", {
                    "default": "link.png",
                    "multiline": False,
                    "tooltip": "Usually connected to the output of another node"
                }),
            },
        }

    NAME = "Open output via shell"
    DESCRIPTION = """
    Safely open an image or video file using the system's default application.

    Validates that the file exists and is a supported media type before opening.
    """
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    FUNCTION = "run_command"
    CATEGORY = "ovum"

    def _validate_media_file(self, filepath):
        """Validate that the file exists and is an image or video file."""
        # Remove any shell command prefixes like 'start '
        clean_path = filepath.strip()
        if clean_path.lower().startswith('start '):
            clean_path = clean_path[6:].strip()

        # Remove quotes if present
        clean_path = clean_path.strip('"\'')

        # Check if file exists
        if not os.path.exists(clean_path):
            return False, f"File does not exist: {clean_path}"

        # Check if it's a file (not a directory)
        if not os.path.isfile(clean_path):
            return False, f"Path is not a file: {clean_path}"

        # Get MIME type
        mime_type, _ = mimetypes.guess_type(clean_path)
        if not mime_type:
            return False, f"Cannot determine file type: {clean_path}"

        # Check if it's an image or video
        if not (mime_type.startswith('image/') or mime_type.startswith('video/')):
            return False, f"File is not an image or video (type: {mime_type}): {clean_path}"

        return True, clean_path

    def _get_open_command(self, filepath):
        """Get the appropriate command to open a file based on the OS."""
        system = platform.system().lower()

        if system == 'windows':
            return ['cmd', '/c', 'start', '', filepath]
        elif system == 'darwin':  # macOS
            return ['open', filepath]
        else:  # Linux and other Unix-like systems
            return ['xdg-open', filepath]

    def run_command(self, input, filename):
        try:
            # Validate the file
            is_valid, result_or_path = self._validate_media_file(filename)
            if not is_valid:
                return (f"[ERROR] {result_or_path}",)

            validated_path = result_or_path

            # Get the appropriate command for this OS
            command = self._get_open_command(validated_path)

            # Execute the command securely (no shell=True)
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=10  # Add timeout to prevent hanging
            )

            if result.returncode == 0:
                return (f"Successfully opened: {validated_path}",)
            else:
                error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                return (f"[ERROR] Failed to open file (code {result.returncode}): {error_msg}",)

        except subprocess.TimeoutExpired:
            return ("[ERROR] Command timed out",)
        except FileNotFoundError:
            return ("[ERROR] Required system command not found",)
        except Exception as e:
            return (f"[ERROR] Unexpected error: {str(e)}",)

CLAZZES = [OpenOutputViaShell]
