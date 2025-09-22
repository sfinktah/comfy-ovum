import re
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

# Comfy type hints
STRING = "STRING"
LIST = "LIST"
DICT = "DICT"
RE_FLAGS_T = "RE_FLAGS"
RE_MATCH_T = "RE_MATCH"
BOOLEAN = "BOOLEAN"
INT = "INT"


# Helpers

def _normalize_strings(widget_string: str, input_value: Optional[Union[str, List[str]]]) -> Tuple[List[str], bool]:
    """Return (list_of_strings, came_from_list). Input link takes priority if provided.
    If input_value is None, use widget_string. If input_value is a string, wrap to list.
    """
    if input_value is None:
        return [widget_string or ""], False
    if isinstance(input_value, list):
        return [str(s) for s in input_value], True
    return [str(input_value)], False


def _compile(pattern: str, flags: int) -> re.Pattern:
    return re.compile(pattern, flags)


def _maybe_int(v: Optional[int]) -> Optional[int]:
    return None if v in (None, "", "None") else int(v)  # widget safety


class OvumReFlags:
    NAME = "re.compile flags (Regex Flags)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (RE_FLAGS_T,)
    RETURN_NAMES = ("flags",)
    DESCRIPTION = """
    Configure flags for regular expression compilation.

    These flags modify how the regular expression engine 
    interprets patterns. Common flags include IGNORECASE, 
    MULTILINE, DOTALL, VERBOSE, ASCII, LOCALE, UNICODE, and 
    DEBUG.
    """
    DESCRIPTION_HTML = """
    Configure flags for regular expression compilation. These flags modify how the regular expression engine interprets patterns.
    Common flags include IGNORECASE, MULTILINE, DOTALL, VERBOSE, ASCII, LOCALE, UNICODE, and DEBUG.
    <a href="https://docs.python.org/3.11/library/re.html#flags">re flags @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        # expose major flags; DEBUG is optional but included
        return {
            "required": {
                "IGNORECASE": (BOOLEAN, {"default": True}),
                "MULTILINE": (BOOLEAN, {"default": False}),
                "DOTALL": (BOOLEAN, {"default": False}),
                "VERBOSE": (BOOLEAN, {"default": False}),
                "ASCII": (BOOLEAN, {"default": False}),
                "LOCALE": (BOOLEAN, {"default": False}),
                "UNICODE": (BOOLEAN, {"default": False}),
                "DEBUG": (BOOLEAN, {"default": False}),
            }
        }

    FUNCTION = "build"

    def build(self, IGNORECASE: bool, MULTILINE: bool, DOTALL: bool, VERBOSE: bool,
              ASCII: bool, LOCALE: bool, UNICODE: bool, DEBUG: bool):
        flags = 0
        if IGNORECASE: flags |= re.IGNORECASE
        if MULTILINE: flags |= re.MULTILINE
        if DOTALL: flags |= re.DOTALL
        if VERBOSE: flags |= re.VERBOSE
        if ASCII: flags |= re.ASCII
        if LOCALE: flags |= re.LOCALE
        if UNICODE: flags |= re.UNICODE
        if DEBUG: flags |= re.DEBUG
        return (flags,)


# Base for nodes that operate on a string/list input
class OvumRegexStringBase:
    CATEGORY = "ovum/regex"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "pattern": (STRING, {"default": "", "multiline": True}),
                "string": (STRING, {"default": ""}),
            },
            "optional": {
                "flags": (RE_FLAGS_T, {"default": re.IGNORECASE}),
                "string_in": (STRING, {"forceInput": True}),  # can be STRING or LIST; normalization handles both
            },
        }

    @staticmethod
    def _get_strings(string: str, string_in: Optional[Union[str, List[str]]]) -> Tuple[List[str], bool]:
        return _normalize_strings(string, string_in)


class OvumReSearch(OvumRegexStringBase):
    NAME = "re.search (Regex Search)"
    RETURN_TYPES = (RE_MATCH_T,)
    RETURN_NAMES = ("match",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.search(pattern, string, flags=0)

    Scan through string[s] looking for the first location 
    where the regular expression pattern produces a match, 
    and return a corresponding RE_MATCH_T. Return None if no 
    position in the string matches the pattern; note that 
    this is different from finding a zero-length match at 
    some point in the string.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>search</b>(<i>pattern, string, flags=0</i>)</code>
    Scan through <i>string<b>[s]</b></i> looking for the first location 
    where the regular expression pattern produces a match, and return a 
    corresponding <code>RE_MATCH_T</code>. Return <code>None</code>
    if no position in the string matches the pattern; note that this is different 
    from finding a zero-length match at some point in the string.
    <a href="https://docs.python.org/3.11/library/re.html#re.search">re.search @ docs.python.org</a>
    """

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE, pos: Optional[int] = None, endpos: Optional[int] = None):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        results: List[Optional[re.Match]] = []
        for s in strings:
            m = pat.search(s, _maybe_int(pos) or 0, _maybe_int(endpos) or len(s))
            results.append(m)
        return (results,)

    @classmethod
    def INPUT_TYPES(cls):
        base = super().INPUT_TYPES()
        base["optional"].update({
            "pos": (INT, {"default": 0, "min": 0}),
            "endpos": (INT, {"default": 0, "min": 0}),
        })
        return base


class OvumReMatch(OvumRegexStringBase):
    NAME = "re.match (Regex Match)"
    RETURN_TYPES = (RE_MATCH_T,)
    RETURN_NAMES = ("match",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.match(pattern, string, flags=0)

    If zero or more characters at the beginning of string[s] 
    match the regular expression pattern, return a 
    corresponding RE_MATCH_T. Return None if the string does 
    not match the pattern; note that this is different from 
    a zero-length match.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>match</b>(<i>pattern, string, flags=0</i>)</code>
    If zero or more characters at the beginning of <i>string<b>[s]</b></i> match the regular 
    expression pattern, return a corresponding <code>RE_MATCH_T</code>. Return <code>None</code> 
    if the string does not match the pattern; note that this is different from a zero-length match.
    <a href="https://docs.python.org/3.11/library/re.html#re.match">re.match @ docs.python.org</a>
    """

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE, pos: Optional[int] = None, endpos: Optional[int] = None):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        results: List[Optional[re.Match]] = []
        for s in strings:
            m = pat.match(s, _maybe_int(pos) or 0, _maybe_int(endpos) or len(s))
            results.append(m)
        return (results,)

    @classmethod
    def INPUT_TYPES(cls):
        base = super().INPUT_TYPES()
        base["optional"].update({
            "pos": (INT, {"default": 0, "min": 0}),
            "endpos": (INT, {"default": 0, "min": 0}),
        })
        return base


class OvumReFullMatch(OvumRegexStringBase):
    NAME = "re.fullmatch (Regex FullMatch)"
    RETURN_TYPES = (RE_MATCH_T,)
    RETURN_NAMES = ("match",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.fullmatch(pattern, string, flags=0)

    If the whole string[s] matches the regular expression 
    pattern, return a corresponding RE_MATCH_T. Return None 
    if the string does not match the pattern; this is 
    different from a zero-length match.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>fullmatch</b>(<i>pattern, string, flags=0</i>)</code>
    If the whole <i>string<b>[s]</b></i> matches the regular expression pattern, return a 
    corresponding <code>RE_MATCH_T</code>. Return <code>None</code> if the string does not match 
    the pattern; this is different from a zero-length match.
    <a href="https://docs.python.org/3.11/library/re.html#re.fullmatch">re.fullmatch @ docs.python.org</a>
    """

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        results: List[Optional[re.Match]] = []
        for s in strings:
            m = pat.fullmatch(s)
            results.append(m)
        return (results,)


class OvumReSplit(OvumRegexStringBase):
    NAME = "re.split (Regex Split)"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("parts",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.split(pattern, string, maxsplit=0, flags=0)

    Split string[s] by the occurrences of pattern. If 
    capturing parentheses are used in pattern, then the text 
    of all groups in the pattern are also returned as part 
    of the resulting list. If maxsplit is nonzero, at most 
    maxsplit splits occur.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>split</b>(<i>pattern, string, maxsplit=0, flags=0</i>)</code>
    Split <i>string<b>[s]</b></i> by the occurrences of pattern. If capturing parentheses are used 
    in pattern, then the text of all groups in the pattern are also returned as part of the 
    resulting list. If maxsplit is nonzero, at most maxsplit splits occur.
    <a href="https://docs.python.org/3.11/library/re.html#re.split">re.split @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        base = super().INPUT_TYPES()
        base["optional"]["maxsplit"] = (INT, {"default": 0, "min": 0})
        return base

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE, maxsplit: int = 0):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        outputs: List[List[str]] = []
        for s in strings:
            outputs.append(pat.split(s, maxsplit))
        return (outputs,)


class OvumReFindAll(OvumRegexStringBase):
    NAME = "re.findall (Regex FindAll)"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("results",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.findall(pattern, string, flags=0)

    Return all non-overlapping matches of pattern in 
    string[s], as a list of strings. The string is scanned 
    left-to-right, and matches are returned in the order 
    found. If one or more groups are present in the pattern, 
    return a list of groups.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>findall</b>(<i>pattern, string, flags=0</i>)</code>
    Return all non-overlapping matches of pattern in <i>string<b>[s]</b></i>, as a list of strings. 
    The string is scanned left-to-right, and matches are returned in the order found. 
    If one or more groups are present in the pattern, return a list of groups.
    <a href="https://docs.python.org/3.11/library/re.html#re.findall">re.findall @ docs.python.org</a>
    """

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        outputs: List[List[Any]] = []
        for s in strings:
            outputs.append(pat.findall(s))
        return (outputs,)


class OvumReFindIter(OvumRegexStringBase):
    NAME = "re.finditer (Regex FindIter)"
    RETURN_TYPES = (RE_MATCH_T,)
    RETURN_NAMES = ("matches",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.finditer(pattern, string, flags=0)

    Return an iterator over all non-overlapping matches in 
    string[s]. For each match, the iterator returns a 
    RE_MATCH_T. The string is scanned left-to-right, and 
    matches are returned in the order found.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>finditer</b>(<i>pattern, string, flags=0</i>)</code>
    Return an iterator over all non-overlapping matches in <i>string<b>[s]</b></i>. For each match, 
    the iterator returns a <code>RE_MATCH_T</code>. The string is scanned left-to-right, 
    and matches are returned in the order found.
    <a href="https://docs.python.org/3.11/library/re.html#re.finditer">re.finditer @ docs.python.org</a>
    """

    def run(self, pattern: str, string: str, string_in: Optional[Union[str, List[str]]] = None,
            flags: int = re.IGNORECASE):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        outputs: List[List[re.Match]] = []
        for s in strings:
            outputs.append(list(pat.finditer(s)))
        return (outputs,)


class OvumReSubBase(OvumRegexStringBase):
    """Base class for regex substitution operations that share common logic."""
    RETURN_TYPES = (STRING, INT)
    RETURN_NAMES = ("result", "count")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        base = super().INPUT_TYPES()
        base["required"]["repl"] = (STRING, {"default": "", "multiline": True})
        base["optional"]["count"] = (INT, {"default": 0, "min": 0})
        return base

    def run(self, pattern: str, string: str, repl: str,
            string_in: Optional[Union[str, List[str]]] = None, flags: int = re.IGNORECASE, count: int = 0):
        pat = _compile(pattern, flags)
        strings, from_list = self._get_strings(string, string_in)
        out_strings: List[str] = []
        counts: List[int] = []
        for s in strings:
            res, n = pat.subn(repl, s, count)
            out_strings.append(res)
            counts.append(n)
        return (out_strings, counts)


class OvumReSub(OvumReSubBase):
    NAME = "re.sub (Regex Sub)"
    DESCRIPTION = """
    re.sub(pattern, repl, string, count=0, flags=0)

    Return the string obtained by replacing the leftmost 
    non-overlapping occurrences of pattern in string[s] by 
    the replacement repl. If the pattern isn't found, string 
    is returned unchanged. count is the maximum number of 
    pattern occurrences to be replaced.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>sub</b>(<i>pattern, repl, string, count=0, flags=0</i>)</code>
    Return the string obtained by replacing the leftmost non-overlapping occurrences of 
    pattern in <i>string<b>[s]</b></i> by the replacement repl. If the pattern isn't found, 
    string is returned unchanged. count is the maximum number of pattern occurrences to be replaced.
    <a href="https://docs.python.org/3.11/library/re.html#re.sub">re.sub @ docs.python.org</a>
    """


class OvumReSubN(OvumReSubBase):
    NAME = "re.subn (Regex SubN)"
    DESCRIPTION = """
    re.subn(pattern, repl, string, count=0, flags=0)

    Perform the same operation as sub(), but return a tuple 
    (new_string, number_of_subs_made). The replacement repl 
    can be either a string or a callable; if a string, 
    backslash escapes in it are processed.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>subn</b>(<i>pattern, repl, string, count=0, flags=0</i>)</code>
    Perform the same operation as <b>sub()</b>, but return a tuple <code>(new_string, number_of_subs_made)</code>. 
    The replacement repl can be either a string or a callable; if a string, backslash escapes in it are processed.
    <a href="https://docs.python.org/3.11/library/re.html#re.subn">re.subn @ docs.python.org</a>
    """


class OvumReEscape:
    NAME = "re.escape (Regex Escape)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("escaped",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "run"
    DESCRIPTION = """
    re.escape(pattern)

    Escape special characters in pattern[s]. This is useful 
    if you want to match an arbitrary literal string that 
    may have regular expression metacharacters in it. As of 
    Python 3.7, only characters that can change the meaning 
    of a regular expression are escaped.
    """
    DESCRIPTION_HTML = """
    <code>re.<b>escape</b>(<i>pattern</i>)</code>
    Escape special characters in <i>pattern<b>[s]</b></i>. This is useful if you want to match an arbitrary 
    literal string that may have regular expression metacharacters in it. As of Python 3.7, 
    only characters that can change the meaning of a regular expression are escaped.
    <a href="https://docs.python.org/3.11/library/re.html#re.escape">re.escape @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "string": (STRING, {"default": ""}),
            },
            "optional": {
                "string_in": (STRING, {"forceInput": True}),
            },
        }

    def run(self, string: str, string_in: Optional[Union[str, List[str]]] = None):
        strings, from_list = _normalize_strings(string, string_in)
        results = [re.escape(s) for s in strings]
        return (results,)


# Match processors

def _ensure_list_matches(m: Union[None, re.Match, List[Optional[re.Match]], List[re.Match]]):
    if isinstance(m, list):
        return m, True
    return [m], False


# noinspection PyPep8Naming
class OvumReMatchInfo:
    NAME = "re.Match (Regex Match Result)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (STRING, STRING, INT, INT, INT)
    RETURN_NAMES = ("string", "pattern", "flags", "lastindex", "lastgroup")
    OUTPUT_IS_LIST = (True, True, True, True, True)
    DESCRIPTION = """
    Extract information from RE_MATCH_T objects:

    The original string, pattern, flags used for matching, 
    the index of the last matched capturing group, and the 
    name of the last matched capturing group. These are 
    read-only attributes of the match object.
    """
    DESCRIPTION_HTML = """
    Extract information from <code>RE_MATCH_T</code> objects: the original string, pattern, flags used for matching, 
    the index of the last matched capturing group, and the name of the last matched capturing group.
    These are read-only attributes of the match object.
    <a href="https://docs.python.org/3.11/library/re.html#match-objects">Match Objects @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "match": (RE_MATCH_T, {}),
            }
        }

    FUNCTION = "run"

    def run(self, match: Union[re.Match, List[Optional[re.Match]]]):
        matches, _ = _ensure_list_matches(match)
        strings: List[str] = []
        patterns: List[str] = []
        flags: List[int] = []
        lastindex: List[Optional[int]] = []
        lastgroup: List[Optional[str]] = []
        for m in matches:
            if m is None:
                strings.append("")
                patterns.append("")
                flags.append(0)
                lastindex.append(None)
                lastgroup.append(None)
            else:
                strings.append(m.string if isinstance(m.string, str) else str(m.string))
                patterns.append(m.re.pattern)
                flags.append(m.re.flags)
                lastindex.append(m.lastindex)
                lastgroup.append(m.lastgroup)
        return (strings, patterns, flags, lastindex, lastgroup)


class OvumReMatchGroup:
    NAME = "re.Match.group (Regex Match Group Selector)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (STRING, STRING, DICT)
    RETURN_NAMES = ("group", "groups", "groupdict")
    OUTPUT_IS_LIST = (True, True, True)
    DESCRIPTION = """
    match.group(group1, ...), match.groups(default=None), match.groupdict(default=None)

    Return subgroups of the match. group() returns one or 
    more subgroups, groups() returns a tuple containing all 
    subgroups, and groupdict() returns a dictionary 
    containing all named subgroups.
    """
    DESCRIPTION_HTML = """
    <code>match.<b>group</b>(<i>group1, ...</i>)</code>, <code>match.<b>groups</b>(<i>default=None</i>)</code>, <code>match.<b>groupdict</b>(<i>default=None</i>)</code>
    Return subgroups of the match. <b>group()</b> returns one or more subgroups, <b>groups()</b> returns a tuple 
    containing all subgroups, and <b>groupdict()</b> returns a dictionary containing all named subgroups.
    <a href="https://docs.python.org/3.11/library/re.html#re.Match.group">Match.group @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "match": (RE_MATCH_T, {}),
            },
            "optional": {
                "n": (INT, {"default": 0}),
                "default": (STRING, {"default": ""}),
            }
        }

    FUNCTION = "run"

    def run(self, match: Union[re.Match, List[Optional[re.Match]]], n: int = 0, default: str = ""):
        matches, _ = _ensure_list_matches(match)
        out_group: List[Optional[str]] = []
        out_groups: List[Tuple] = []
        out_groupdict: List[Dict[str, Optional[str]]] = []
        for m in matches:
            if m is None:
                out_group.append(None)
                out_groups.append(())
                out_groupdict.append({})
            else:
                try:
                    out_group.append(m.group(n))
                except IndexError:
                    out_group.append(None)
                out_groups.append(m.groups(default=default))
                out_groupdict.append(m.groupdict(default=default))
        return (out_group, out_groups, out_groupdict)


class OvumReMatchSpan:
    NAME = "re.Match.span/start/end (Regex Match Span)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (INT, INT, INT)
    RETURN_NAMES = ("span", "start", "end")
    OUTPUT_IS_LIST = (True, True, True)
    DESCRIPTION = """
    match.span(group), match.start(group), match.end(group)

    Return the indices of the start and end of the substring 
    matched by group. span() returns a 2-tuple (start, end), 
    start() returns the start index, and end() returns the 
    end index.
    """
    DESCRIPTION_HTML = """
    <code>match.<b>span</b>(<i>group</i>)</code>, <code>match.<b>start</b>(<i>group</i>)</code>, <code>match.<b>end</b>(<i>group</i>)</code>
    Return the indices of the start and end of the substring matched by group. <b>span()</b> returns a 2-tuple 
    <code>(start, end)</code>, <b>start()</b> returns the start index, and <b>end()</b> returns the end index.
    <a href="https://docs.python.org/3.11/library/re.html#re.Match.span">Match.span @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "match": (RE_MATCH_T, {}),
            },
            "optional": {
                "n": (INT, {"default": 0}),
            }
        }

    FUNCTION = "run"

    def run(self, match: Union[re.Match, List[Optional[re.Match]]], n: int = 0):
        matches, _ = _ensure_list_matches(match)
        spans: List[Optional[Tuple[int, int]]] = []
        starts: List[Optional[int]] = []
        ends: List[Optional[int]] = []
        for m in matches:
            if m is None:
                spans.append(None)
                starts.append(None)
                ends.append(None)
            else:
                spans.append(m.span(n))
                starts.append(m.start(n))
                ends.append(m.end(n))
        return (spans, starts, ends)


class OvumReMatchExpand:
    NAME = "re.Match.expand (Regex Match Expand)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (LIST,)
    RETURN_NAMES = ("expanded",)
    OUTPUT_IS_LIST = (True,)
    DESCRIPTION = """
    match.expand(template)

    Return the string obtained by doing backslash 
    substitution on the template string, similar to the 
    sub() method. Escapes such as \\n are converted to the 
    appropriate characters, and numeric backreferences (\\1, 
    \\2) and named backreferences (\\g<name>) are 
    substituted.
    """
    DESCRIPTION_HTML = """
    <code>match.<b>expand</b>(<i>template</i>)</code>
    Return the string obtained by doing backslash substitution on the template string, 
    similar to the <b>sub()</b> method. Escapes such as <code>\\n</code> are converted to the appropriate characters, 
    and numeric backreferences (<code>\\1</code>, <code>\\2</code>) and named backreferences (<code>\\g&lt;name&gt;</code>) are substituted.
    <a href="https://docs.python.org/3.11/library/re.html#re.Match.expand">Match.expand @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "match": (RE_MATCH_T, {}),
                "template": (STRING, {"default": ""}),
            }
        }

    FUNCTION = "run"

    def run(self, match: Union[re.Match, List[Optional[re.Match]]], template: str):
        matches, _ = _ensure_list_matches(match)
        outs: List[str] = []
        for m in matches:
            if m is None:
                outs.append("")
            else:
                outs.append(m.expand(template))
        return (outs,)


class OvumReMatchSelect:
    NAME = "re.Match[index] (Regex Match Select)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (RE_MATCH_T,)
    RETURN_NAMES = ("match",)
    DESCRIPTION = """
    Select a specific match from a list of RE_MATCH_T objects by index.

    This utility node helps extract individual matches from 
    operations that return multiple matches, such as 
    finditer(). Index is clamped to valid range.
    """
    DESCRIPTION_HTML = """
    Select a specific match from a list of <code>RE_MATCH_T</code> objects by index. 
    This utility node helps extract individual matches from operations that return multiple matches, 
    such as <b>finditer()</b>. Index is clamped to valid range.
    <a href="https://docs.python.org/3.11/library/re.html#match-objects">Match Objects @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "matches": (RE_MATCH_T, {}),
                "index": (INT, {"default": 0, "min": 0}),
            }
        }

    FUNCTION = "run"

    def run(self, matches: List[Optional[re.Match]], index: int = 0):
        if not isinstance(matches, list):
            return ([matches],)
        if not matches:
            return ([None],)
        idx = max(0, min(index, len(matches) - 1))
        return ([matches[idx]],)


class OvumReMatchView:
    NAME = "re.Match.__repr__ (Regex Match View)"
    CATEGORY = "ovum/regex"
    RETURN_TYPES = (STRING,)
    RETURN_NAMES = ("text",)
    OUTPUT_IS_LIST = (False,)
    DESCRIPTION = """
    Generate a human-readable representation of RE_MATCH_T objects for debugging and inspection.

    Shows the pattern, flags, span, matched text, groups, 
    and named groups in a formatted string. Useful for 
    understanding what was matched and how.
    """
    DESCRIPTION_HTML = """
    Generate a human-readable representation of <code>RE_MATCH_T</code> objects for debugging and inspection. 
    Shows the pattern, flags, span, matched text, groups, and named groups in a formatted string. 
    Useful for understanding what was matched and how.
    <a href="https://docs.python.org/3.11/library/re.html#match-objects">Match Objects @ docs.python.org</a>
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "match": (RE_MATCH_T, {}),
            }
        }

    FUNCTION = "run"

    def run(self, match: Union[re.Match, List[Optional[re.Match]]]):
        matches, _ = _ensure_list_matches(match)
        lines: List[str] = []
        for i, m in enumerate(matches):
            if m is None:
                lines.append(f"[{i}] None")
            else:
                grps = m.groups()
                gd = m.groupdict()
                lines.append(f"[{i}] pattern={m.re.pattern!r} flags={m.re.flags} span={m.span()} group0={m.group(0)!r} groups={grps!r} groupdict={gd!r}")
        return ("\n".join(lines),)


CLAZZES = [
    OvumReFlags,
    OvumReSearch,
    OvumReMatch,
    OvumReFullMatch,
    OvumReSplit,
    OvumReFindAll,
    OvumReFindIter,
    OvumReSub,
    OvumReSubN,
    OvumReEscape,
    OvumReMatchInfo,
    OvumReMatchGroup,
    OvumReMatchSpan,
    OvumReMatchExpand,
    OvumReMatchSelect,
    OvumReMatchView,
]