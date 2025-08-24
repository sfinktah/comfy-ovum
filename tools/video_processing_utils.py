# Python
import os
import sys
import subprocess
import tempfile
import time
import winreg
from typing import List, Optional


def extract_last_frame(video_path: str) -> Optional[str]:
    """
    Extract the last frame from a single MP4 file using ffmpeg/ffprobe.
    Returns the absolute path to the saved image, or None on failure.
    """
    if not video_path.lower().endswith(".mp4"):
        print(f"Skipping (not .mp4): {video_path}")
        return None

    if not os.path.isfile(video_path):
        print(f"File not found: {video_path}")
        return None

    base, _ = os.path.splitext(video_path)
    output_image = f"{base}_last.png"

    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )

    try:
        duration = float(result.stdout.strip())
    except ValueError:
        print(f"Could not determine video duration: {video_path}")
        return None

    # Seek a tiny bit before the end to reliably get a frame
    timestamp = max(0, duration - 0.1)

    ff = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-ss",
            str(timestamp),
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            output_image,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if ff.returncode == 0:
        print(f"✅ Saved: {output_image}")
        return os.path.abspath(output_image)
    else:
        print(f"❌ ffmpeg failed for: {video_path}")
        return None


def ffmpeg_concat(paths: List[str]) -> Optional[str]:
    """
    Windows-native port of ffmpeg-concat.sh.
    - Validates at least two input files.
    - Builds a temporary concat list file.
    - Re-encodes to H.264 CRF 18, AAC audio, 30 fps, veryfast preset.
    Returns absolute path to the created output.mp4 or None on failure.
    """
    files = [p for p in paths if p.lower().endswith(".mp4")]
    if len(files) < 2:
        print("Usage (needs 2+ mp4 files): --concat file1.mp4 file2.mp4 [...]")
        return None

    for f in files:
        if not os.path.isfile(f):
            print(f"File not found: {f}")
            return None

    # Output alongside the first file, with a timestamp to avoid overwrite
    first_dir = os.path.dirname(os.path.abspath(files[0])) or os.getcwd()
    ts = time.strftime("%Y%m%d-%H%M%S")
    output_path = os.path.join(first_dir, f"concat_{ts}.mp4")

    # Create a temporary file list for ffmpeg -f concat
    with tempfile.NamedTemporaryFile(mode="w", prefix=".ffmpeg-concat_", suffix=".tmp", delete=False, encoding="utf-8") as tf:
        tmp_list = tf.name
        for f in files:
            tf.write(f"file '{os.path.abspath(f)}'\n")

    print(f"Concat list: {tmp_list}")
    try:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            tmp_list,
            "-movflags",
            "+faststart",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-vsync",
            "cfr",
            "-r",
            "30",  # target 30fps
            output_path,
        ]
        rc = subprocess.run(cmd).returncode
        if rc == 0 and os.path.isfile(output_path):
            print(f"✅ Concatenated: {output_path}")
            return os.path.abspath(output_path)
        else:
            print("❌ ffmpeg concat failed.")
            return None
    finally:
        try:
            os.remove(tmp_list)
        except OSError:
            pass


def ffmpeg_interpolate_30fps(paths: List[str]) -> List[str]:
    """
    Frame-interpolate each provided .mp4 to 30fps using ffmpeg's minterpolate filter,
    otherwise duplicating the encoding settings used by ffmpeg_concat.
    Returns a list of absolute output paths that were produced successfully.
    """
    outputs: List[str] = []
    files = [p for p in paths if p.lower().endswith(".mp4")]
    if not files:
        print("Usage: --interp30 <file1.mp4> [file2.mp4 ...]")
        return outputs

    for f in files:
        if not os.path.isfile(f):
            print(f"File not found: {f}")
            continue

        base, _ = os.path.splitext(os.path.abspath(f))
        out_path = f"{base}_30fps.mp4"

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            f,
            "-vf",
            "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff",
            "-movflags",
            "+faststart",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-vsync",
            "cfr",
            out_path,
        ]
        rc = subprocess.run(cmd).returncode
        if rc == 0 and os.path.isfile(out_path):
            print(f"✅ Interpolated to 30fps: {out_path}")
            outputs.append(os.path.abspath(out_path))
        else:
            print(f"❌ Interpolation failed: {f}")

    return outputs


# ---------------- Context menu install/uninstall ---------------- #

def _set_reg_value(key, name: str, value: str, vtype=winreg.REG_SZ):
    winreg.SetValueEx(key, name, 0, vtype, value)


def install_context_menu():
    """
    Adds a cascading 'ffmpeg tools' submenu with three items:
      - Extract last frame
      - Concat (reencode 30fps)
      - Interpolate to 30fps
    Appears for .mp4 files (classic context menu / 'Show more options').
    """
    script_path = os.path.abspath(sys.argv[0])
    py = sys.executable

    base = r"Software\Classes\SystemFileAssociations\.mp4\shell"
    ffmpeg_menu_path = base + r"\ffmpeg"
    ffmpeg_shell_path = ffmpeg_menu_path + r"\shell"

    try:
        # Create the cascade root with a nicer built-in film icon and point it to its own 'shell' subkey
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, ffmpeg_menu_path) as k:
            _set_reg_value(k, "MUIVerb", "ffmpeg tools")
            _set_reg_value(k, "Icon", r"%SystemRoot%\System32\imageres.dll,-68")
            # Use HKCR-relative path so Explorer resolves the submenu items
            _set_reg_value(k, "ExtendedSubCommandsKey", r"SystemFileAssociations\.mp4\shell\ffmpeg\shell")

        # Create submenu items under the cascade's 'shell' key
        # Item 1: Extract last frame
        item1 = ffmpeg_shell_path + r"\Extract last frame"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item1) as k:
            _set_reg_value(k, "MUIVerb", "Extract last frame")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item1 + r"\command") as c:
            _set_reg_value(c, "", f'"{py}" "{script_path}" --last-frame %*')

        # Item 2: Concat (reencode 30fps)
        item2 = ffmpeg_shell_path + r"\Concat (reencode 30fps)"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item2) as k:
            _set_reg_value(k, "MUIVerb", "Concat (reencode 30fps)")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item2 + r"\command") as c:
            _set_reg_value(c, "", f'"{py}" "{script_path}" --concat %*')

        # Item 3: Interpolate to 30fps
        item3 = ffmpeg_shell_path + r"\Interpolate to 30fps"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item3) as k:
            _set_reg_value(k, "MUIVerb", "Interpolate to 30fps")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, item3 + r"\command") as c:
            _set_reg_value(c, "", f'"{py}" "{script_path}" --interp30 %*')

        print("✅ Context menu 'ffmpeg tools' submenu installed.")
        print("Note: On Windows 11 it appears in 'Show more options' (Shift+Right-Click).")
    except Exception as e:
        print(f"❌ Failed to install: {e}")


def uninstall_context_menu():
    base = r"Software\Classes\SystemFileAssociations\.mp4\shell"
    try:
        # Remove items (handle both old 60fps label and new 30fps label)
        for label in [
            r"\ffmpeg\shell\Extract last frame\command",
            r"\ffmpeg\shell\Extract last frame",
            r"\ffmpeg\shell\Concat (reencode 60fps)\command",
            r"\ffmpeg\shell\Concat (reencode 60fps)",
            r"\ffmpeg\shell\Concat (reencode 30fps)\command",
            r"\ffmpeg\shell\Concat (reencode 30fps)",
            r"\ffmpeg\shell\Interpolate to 30fps\command",
            r"\ffmpeg\shell\Interpolate to 30fps",
        ]:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, base + label)
            except FileNotFoundError:
                pass

        # Remove CommandStore verbs used by SubCommands
        cs_base = r"Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell"
        for v in [r"\ffmpeg_extract_last", r"\ffmpeg_concat_30fps", r"\ffmpeg_interp_30fps"]:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, cs_base + v + r"\command")
            except FileNotFoundError:
                pass
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, cs_base + v)
            except FileNotFoundError:
                pass

        # Remove submenu root
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, base + r"\ffmpeg\shell")
        except FileNotFoundError:
            pass
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, base + r"\ffmpeg")
        print("✅ Context menu 'ffmpeg tools' submenu removed.")
    except FileNotFoundError:
        print("⚠️ Entry not found.")
    except Exception as e:
        print(f"❌ Failed to uninstall: {e}")


# ---------------- Helpers ---------------- #

def open_in_explorer(path: str):
    """Open a single Explorer window and focus the item if possible."""
    try:
        subprocess.run(["explorer", "/select,", path])
    except Exception as e:
        print(f"⚠️ Could not open Explorer: {e}")


def print_usage():
    print("Usage:")
    print("  extract_last_frame.py --install")
    print("  extract_last_frame.py --uninstall")
    print("  extract_last_frame.py --last-frame <file1.mp4> [file2.mp4 ...]")
    print("  extract_last_frame.py --concat <file1.mp4> <file2.mp4> [more.mp4]   # concat to 30fps")
    print("  extract_last_frame.py --interp30 <file1.mp4> [file2.mp4 ...]")


# ---------------- Entry point ---------------- #

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--install":
        install_context_menu()
        sys.exit(0)

    if len(sys.argv) == 2 and sys.argv[1] == "--uninstall":
        uninstall_context_menu()
        sys.exit(0)

    if len(sys.argv) >= 3 and sys.argv[1] == "--concat":
        out = ffmpeg_concat(sys.argv[2:])
        if out:
            open_in_explorer(out)
        sys.exit(0)

    if len(sys.argv) >= 3 and sys.argv[1] == "--interp30":
        outs = ffmpeg_interpolate_30fps(sys.argv[2:])
        if outs:
            open_in_explorer(outs[-1])
        sys.exit(0)

    if len(sys.argv) >= 3 and sys.argv[1] == "--last-frame":
        outputs = []
        for arg in sys.argv[2:]:
            out = extract_last_frame(arg)
            if out:
                outputs.append(out)
        if outputs:
            open_in_explorer(outputs[-1])
        sys.exit(0)

    print_usage()
