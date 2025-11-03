import os
from typing import List, Tuple, Optional, Union, Any
from pathlib import PurePath

# Basic comfy types
STRING = "STRING"
BOOLEAN = "BOOLEAN"

# Define PATHLIKE type marker for ComfyUI
# PATHLIKE = "PATHLIKE"
PATHLIKE = "PATHLIKE,STRING"

# Allow multi-type inputs like VideoHelperSuite's MultiInput
class MultiInput(str):
    def __new__(cls, string, allowed_types="*"):
        res = super().__new__(cls, string)
        res.allowed_types = allowed_types
        return res
    def __ne__(self, other):
        return False

        if getattr(self, 'allowed_types', "*") == "*" or other == "*":
            return False
        return other not in getattr(self, 'allowed_types', [])

PATH_OR_STRING = PATHLIKE

# Utilities

def _to_pathlike(x: Union[str, os.PathLike, Any]) -> os.PathLike:
    if isinstance(x, str):
        return PurePath(x)
    return x  # assume already path-like

def _maybe_forward(p: str, forward_slashes: bool) -> str:
    return p.replace("\\", "/") if forward_slashes else p

# Converter node: STRING -> PATHLIKE via pathlib.PurePath
class OvumPathToPathLike:
    NAME = "STRING to PATHLIKE (PurePath)"
    CATEGORY = "ovum/path"
    RETURN_TYPES = (PATHLIKE,)
    RETURN_NAMES = ("pathlike",)
    DESCRIPTION = "Convert a path string to a pathlib.PurePath (PATHLIKE) object."
    DESCRIPTION_HTML = "Convert a path string to a pathlib.PurePath (PATHLIKE) object."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"path": (STRING, {"default": ""})}}

    FUNCTION = "run"

    def run(self, path: str):
        return (PurePath(path),)

# Slash conversion node
class OvumPathBackToForward:
    NAME = "Backslashes → Forward"
    CATEGORY = "ovum/path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Convert backslashes to forward slashes."
    DESCRIPTION_HTML = "Convert backslashes to forward slashes."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"path": (STRING, {"default": ""})}}

    FUNCTION = "run"

    def run(self, path: str):
        return (path.replace("\\", "/"),)

# Base to support first-argument widget or link (STRING or PATHLIKE)
class _FirstArgPathBase:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"path": (STRING, {"default": ""})},
            "optional": {"path_in": (PATH_OR_STRING, {"forceInput": True})},
        }

    def _get_path_arg(self, path: str, path_in: Optional[PATHLIKE]) -> os.PathLike:
        if path_in is not None:
            return _to_pathlike(path_in)
        return _to_pathlike(path)

# Individual os.path functions

class OvumOsPathAbspath(_FirstArgPathBase):
    NAME = "os.path.abspath"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return a normalized absolutized version of the pathname path."
    DESCRIPTION_HTML = "Return a normalized absolutized version of the pathname path."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.abspath(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathExpanduser(_FirstArgPathBase):
    NAME = "os.path.expanduser"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Expand ~ and ~user constructions."
    DESCRIPTION_HTML = "Expand ~ and ~user constructions."
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.expanduser(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathExpandvars(_FirstArgPathBase):
    NAME = "os.path.expandvars"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Expand environment variables of the form $name or ${name}."
    DESCRIPTION_HTML = "Expand environment variables of the form $name or ${name}."
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.expandvars(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathRealpath(_FirstArgPathBase):
    NAME = "os.path.realpath"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return the canonical path of the specified filename, eliminating any symbolic links encountered in the path."
    DESCRIPTION_HTML = "Return the canonical path of the specified filename, eliminating any symbolic links encountered in the path."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.realpath(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathDirname(_FirstArgPathBase):
    NAME = "os.path.dirname"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return the directory name of pathname path."
    DESCRIPTION_HTML = "Return the directory name of pathname path."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.dirname(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathBasename(_FirstArgPathBase):
    NAME = "os.path.basename"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return the base name of pathname path."
    DESCRIPTION_HTML = "Return the base name of pathname path."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        # t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return os.path.basename(p)  # type: ignore[arg-type]

class OvumOsPathSplit(_FirstArgPathBase):
    NAME = "os.path.split"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING, STRING)
    RETURN_NAMES = ("head", "tail")
    DESCRIPTION = "Split the pathname path into a pair, (head, tail)."
    DESCRIPTION_HTML = "Split the pathname path into a pair, (head, tail)."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        h, t = os.path.split(p)  # type: ignore[arg-type]
        return (h, t)

class OvumOsPathSplitAll(_FirstArgPathBase):
    NAME = "os.path.split (all)"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = ("LIST",)
    RETURN_NAMES = ("parts",)
    DESCRIPTION = "Repeatedly split until no more splitting can be done, returning all pieces."
    DESCRIPTION_HTML = "Repeatedly split until no more splitting can be done, returning all pieces."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        s = str(p)
        parts: List[str] = []
        while True:
            h, t = os.path.split(s)
            if t:
                parts.insert(0, t)
                s = h
                if h == s:
                    break
            else:
                if h:
                    parts.insert(0, h)
                break
        return (parts,)

class OvumOsPathSplitext(_FirstArgPathBase):
    NAME = "os.path.splitext"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING, STRING)
    RETURN_NAMES = ("root", "ext")
    DESCRIPTION = "Split the pathname path into a pair (root, ext)."
    DESCRIPTION_HTML = "Split the pathname path into a pair (root, ext)."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return os.path.splitext(p)  # type: ignore[arg-type]

class OvumOsPathIsAbs(_FirstArgPathBase):
    NAME = "os.path.isabs"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("isabs",)
    DESCRIPTION = "Return True if path is an absolute pathname."
    DESCRIPTION_HTML = "Return True if path is an absolute pathname."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.isabs(p),)  # type: ignore[arg-type]

class OvumOsPathNormPath(_FirstArgPathBase):
    NAME = "os.path.normpath"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Normalize path, eliminating double slashes, etc."
    DESCRIPTION_HTML = "Normalize path, eliminating double slashes, etc."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.normpath(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathNormCase(_FirstArgPathBase):
    NAME = "os.path.normcase"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Normalize the case of a pathname."
    DESCRIPTION_HTML = "Normalize the case of a pathname."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        out = os.path.normcase(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathIsfile(_FirstArgPathBase):
    NAME = "os.path.isfile"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("isfile",)
    DESCRIPTION = "Return True if path is an existing regular file."
    DESCRIPTION_HTML = "Return True if path is an existing regular file."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.isfile(p),)  # type: ignore[arg-type]

class OvumOsPathIsdir(_FirstArgPathBase):
    NAME = "os.path.isdir"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("isdir",)
    DESCRIPTION = "Return True if path is an existing directory."
    DESCRIPTION_HTML = "Return True if path is an existing directory."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.isdir(p),)  # type: ignore[arg-type]

class OvumOsPathExists(_FirstArgPathBase):
    NAME = "os.path.exists"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("exists",)
    DESCRIPTION = "Return True if path refers to an existing path."
    DESCRIPTION_HTML = "Return True if path refers to an existing path."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.exists(p),)  # type: ignore[arg-type]

class OvumOsPathJoin:
    NAME = "os.path.join"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Join one or more path components intelligently."
    DESCRIPTION_HTML = "Join one or more path components intelligently."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "a": (STRING, {"default": ""}),
            },
            "optional": {
                "a_in": (PATH_OR_STRING, {"forceInput": True}),
                "b": (STRING, {"default": ""}),
                "b_in": (PATH_OR_STRING, {"forceInput": True}),
                "c": (STRING, {"default": ""}),
                "c_in": (PATH_OR_STRING, {"forceInput": True}),
                "d": (STRING, {"default": ""}),
                "d_in": (PATH_OR_STRING, {"forceInput": True}),
                "forward_slashes": (BOOLEAN, {"default": False}),
            },
        }

    FUNCTION = "run"

    def run(self, a: str, b: str = "", c: str = "", d: str = "", a_in: Optional[PATHLIKE] = None, b_in: Optional[PATHLIKE] = None, c_in: Optional[PATHLIKE] = None, d_in: Optional[PATHLIKE] = None, forward_slashes: bool = False):
        parts = []
        parts.append(str(_to_pathlike(a_in if a_in is not None else a)))
        if b or b_in is not None:
            parts.append(str(_to_pathlike(b_in if b_in is not None else b)))
        if c or c_in is not None:
            parts.append(str(_to_pathlike(c_in if c_in is not None else c)))
        if d or d_in is not None:
            parts.append(str(_to_pathlike(d_in if d_in is not None else d)))
        out = os.path.join(*parts)
        return (_maybe_forward(out, forward_slashes),)

# commonprefix/commonpath with list input only
class OvumOsPathCommonPrefix:
    NAME = "os.path.commonprefix"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("prefix",)
    DESCRIPTION = "Return the longest path prefix (taken character-by-character) that is a prefix of all paths in list."
    DESCRIPTION_HTML = "Return the longest path prefix (taken character-by-character) that is a prefix of all paths in list."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"list": ("LIST", {})}}

    FUNCTION = "run"

    def run(self, list: List[str]):
        return (os.path.commonprefix(list),)

class OvumOsPathCommonPath:
    NAME = "os.path.commonpath"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return the longest common sub-path of each pathname in the sequence paths."
    DESCRIPTION_HTML = "Return the longest common sub-path of each pathname in the sequence paths."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"paths": ("LIST", {})}, "optional": {"forward_slashes": (BOOLEAN, {"default": False})}}

    FUNCTION = "run"

    def run(self, paths: List[str], forward_slashes: bool = False):
        out = os.path.commonpath(paths)
        return (_maybe_forward(out, forward_slashes),)

# Combining multiple inputs of path(s) and return a flat list
class OvumCombinePaths:
    NAME = "Combine Paths"
    CATEGORY = "ovum/path"
    RETURN_TYPES = ("LIST",)
    RETURN_NAMES = ("paths",)
    DESCRIPTION = "Combine multiple path inputs (STRING or LIST of STRING) into a flattened list."
    DESCRIPTION_HTML = "Combine multiple path inputs (STRING or LIST of STRING) into a flattened list."

    @classmethod
    def INPUT_TYPES(cls):
        # We will expose 4 inputs; frontend JS can auto-add more
        return {
            "required": {"path1": (STRING, {"default": ""})},
            "optional": {
                "path1_in": ("LIST", {"forceInput": True}),
                "path2": (STRING, {"default": ""}),
                "path2_in": ("LIST", {"forceInput": True}),
                "path3": (STRING, {"default": ""}),
                "path3_in": ("LIST", {"forceInput": True}),
                "path4": (STRING, {"default": ""}),
                "path4_in": ("LIST", {"forceInput": True}),
            },
        }

    FUNCTION = "run"

    def run(self, path1: str, path2: str = "", path3: str = "", path4: str = "", path1_in: Optional[List[str]] = None, path2_in: Optional[List[str]] = None, path3_in: Optional[List[str]] = None, path4_in: Optional[List[str]] = None):
        out: List[str] = []
        def add(x: Optional[Union[str, List[str]]] ):
            if x is None:
                return
            if isinstance(x, list):
                out.extend([str(s) for s in x])
            else:
                s = str(x)
                if s:
                    out.append(s)
        add(path1_in if path1_in is not None else path1)
        add(path2_in if path2_in is not None else path2)
        add(path3_in if path3_in is not None else path3)
        add(path4_in if path4_in is not None else path4)
        return (out,)

class OvumOsPathRelpath(_FirstArgPathBase):
    NAME = "os.path.relpath"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("path",)
    DESCRIPTION = "Return a relative filepath to path from the current directory or start."
    DESCRIPTION_HTML = "Return a relative filepath to path from the current directory or start."

    @classmethod
    def INPUT_TYPES(cls):
        t = super().INPUT_TYPES()
        t["optional"]["start"] = (STRING, {"default": ""})
        t["optional"]["start_in"] = (PATH_OR_STRING, {"forceInput": True})
        t["required"]["forward_slashes"] = (BOOLEAN, {"default": False})
        return t

    FUNCTION = "run"

    def run(self, path: str, forward_slashes: bool = False, start: str = "", path_in: Optional[PATHLIKE] = None, start_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        s = _to_pathlike(start_in) if start_in is not None else (PurePath(start) if start else None)
        out = os.path.relpath(p, s) if s is not None else os.path.relpath(p)  # type: ignore[arg-type]
        return (_maybe_forward(out, forward_slashes),)

class OvumOsPathSplitdrive(_FirstArgPathBase):
    NAME = "os.path.splitdrive"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (STRING, STRING)
    RETURN_NAMES = ("drive", "tail")
    DESCRIPTION = "Split the pathname path into a pair (drive, tail)."
    DESCRIPTION_HTML = "Split the pathname path into a pair (drive, tail)."
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return os.path.splitdrive(p)  # type: ignore[arg-type]

class OvumOsPathIslink(_FirstArgPathBase):
    NAME = "os.path.islink"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("islink",)
    DESCRIPTION = "Return True if path refers to a directory entry that is a symbolic link."
    DESCRIPTION_HTML = "Return True if path refers to a directory entry that is a symbolic link."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.islink(p),)  # type: ignore[arg-type]

class OvumOsPathIsmount(_FirstArgPathBase):
    NAME = "os.path.ismount"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("ismount",)
    DESCRIPTION = "Return True if pathname path is a mount point."
    DESCRIPTION_HTML = "Return True if pathname path is a mount point."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.ismount(p),)  # type: ignore[arg-type]

class OvumOsPathLexists(_FirstArgPathBase):
    NAME = "os.path.lexists"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("lexists",)
    DESCRIPTION = "Return True if path refers to an existing path, or a symlink pointing to a non-existent location."
    DESCRIPTION_HTML = "Return True if path refers to an existing path, or a symlink pointing to a non-existent location."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (os.path.lexists(p),)  # type: ignore[arg-type]

class OvumOsPathGetAtime(_FirstArgPathBase):
    NAME = "os.path.getatime"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("atime",)
    DESCRIPTION = "Return the time of last access of path."
    DESCRIPTION_HTML = "Return the time of last access of path."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (float(os.path.getatime(p)),)  # type: ignore[arg-type]

class OvumOsPathGetMtime(_FirstArgPathBase):
    NAME = "os.path.getmtime"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("mtime",)
    DESCRIPTION = "Return the time of last modification of path."
    DESCRIPTION_HTML = "Return the time of last modification of path."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (float(os.path.getmtime(p)),)  # type: ignore[arg-type]

class OvumOsPathGetCtime(_FirstArgPathBase):
    NAME = "os.path.getctime"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("ctime",)
    DESCRIPTION = "Return the system’s ctime which, on some systems (like Unix), is the time of the last metadata change."
    DESCRIPTION_HTML = "Return the system’s ctime which, on some systems (like Unix), is the time of the last metadata change."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (float(os.path.getctime(p)),)  # type: ignore[arg-type]

class OvumOsPathGetSize(_FirstArgPathBase):
    NAME = "os.path.getsize"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("size",)
    DESCRIPTION = "Return the size, in bytes, of path."
    DESCRIPTION_HTML = "Return the size, in bytes, of path."

    @classmethod
    def INPUT_TYPES(cls):
        return super().INPUT_TYPES()

    FUNCTION = "run"

    def run(self, path: str, path_in: Optional[PATHLIKE] = None):
        p = self._get_path_arg(path, path_in)
        return (int(os.path.getsize(p)),)  # type: ignore[arg-type]

class OvumOsPathSamefile:
    NAME = "os.path.samefile"
    CATEGORY = "ovum/path/os.path"
    RETURN_TYPES = (BOOLEAN,)
    RETURN_NAMES = ("same",)
    DESCRIPTION = "Return True if both pathname arguments refer to the same file or directory."
    DESCRIPTION_HTML = "Return True if both pathname arguments refer to the same file or directory."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"path1": (STRING, {"default": ""})},
            "optional": {"path1_in": (PATH_OR_STRING, {"forceInput": True}), "path2": (STRING, {"default": ""}), "path2_in": (PATH_OR_STRING, {"forceInput": True})},
        }

    FUNCTION = "run"

    def run(self, path1: str, path2: str = "", path1_in: Optional[PATHLIKE] = None, path2_in: Optional[PATHLIKE] = None):
        p1 = _to_pathlike(path1_in if path1_in is not None else path1)
        p2 = _to_pathlike(path2_in if path2_in is not None else path2)
        return (os.path.samefile(p1, p2),)

CLAZZES = [
    OvumPathToPathLike,
    OvumPathBackToForward,
    OvumOsPathAbspath,
    OvumOsPathExpanduser,
    OvumOsPathExpandvars,
    OvumOsPathRealpath,
    OvumOsPathDirname,
    OvumOsPathBasename,
    OvumOsPathSplit,
    OvumOsPathSplitAll,
    OvumOsPathSplitext,
    OvumOsPathIsAbs,
    OvumOsPathNormPath,
    OvumOsPathNormCase,
    OvumOsPathIsfile,
    OvumOsPathIsdir,
    OvumOsPathExists,
    OvumOsPathJoin,
    OvumOsPathCommonPrefix,
    OvumOsPathCommonPath,
    OvumCombinePaths,
    OvumOsPathRelpath,
    OvumOsPathSplitdrive,
    OvumOsPathIslink,
    OvumOsPathIsmount,
    OvumOsPathLexists,
    OvumOsPathGetAtime,
    OvumOsPathGetMtime,
    OvumOsPathGetCtime,
    OvumOsPathGetSize,
    OvumOsPathSamefile,
]
