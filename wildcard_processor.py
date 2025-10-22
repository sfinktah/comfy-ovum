# noinspection PyUnresolvedReferences
import folder_paths
import datetime
import json
import os
import random
import re
from braceexpand import braceexpand


def find_and_replace_wildcards(prompt, offset_seed, debug=False):
    # wildcards use the __file_name__ syntax with optional |word_to_find
    wildcard_path = os.path.join(folder_paths.get_user_directory(), 'wildcards')
    # backwards compatibility with pre paths update to comfy
    if not os.path.isdir(wildcard_path):
        wildcard_path = os.path.join(os.path.dirname(folder_paths.__file__), 'wildcards')
    # Regex pattern to match wildcards: optional (nnn$$) prefix, __(!/+/-/*)? for behavior indicator,
    # main capture group for wildcard name (can have _ within text), optional |word to filter by
    wildcard_regex = r'((\d+)\$\$)?__(!|\+|-|\*)?((?:[^|_]+_)*[^|_]+)((?:\|[^|]+)*)__'
    # Legacy regex pattern used as reference
    # r'(\[(\d+)\$\$)?__((?:[^|_]+_)*[^|_]+)((?:\|[^|]+)*)__\]?'
    match_strings = []
    random.seed(offset_seed)
    offset = offset_seed

    new_prompt = ''
    last_end = 0

    for m in re.finditer(wildcard_regex, prompt):
        full_match, lines_count_str, offset_type, actual_match, words_to_find_str = m.groups()
        # Append everything up to this match
        new_prompt += prompt[last_end:m.start()]

        # lock indicator
        lock_indicator = offset_type == '!'
        # increment indicator
        increment_indicator = offset_type == '+'
        # decrement indicator
        decrement_indicator = offset_type == '-'
        # random indicator
        random_indicator = offset_type == '*'

        #for full_match, lines_count_str, actual_match, words_to_find_str in re.findall(wildcard_regex, prompt):
        words_to_find = words_to_find_str.split('|')[1:] if words_to_find_str else None
        if debug:
            print(f'Wildcard match: {actual_match}')
            print(f'Wildcard words to find: {words_to_find}')
        lines_to_insert = int(lines_count_str) if lines_count_str else 1
        if debug:
            print(f'Wildcard lines to insert: {lines_to_insert}')
        match_parts = actual_match.split('/')
        if len(match_parts) > 1:
            # noinspection PyArgumentList
            wildcard_dir = str(os.path.join(*match_parts[:-1]))
            wildcard_file = str(match_parts[-1])
        else:
            wildcard_dir = ''
            wildcard_file = str(match_parts[0])
        search_path = os.path.join(wildcard_path, wildcard_dir)
        file_path = os.path.join(search_path, wildcard_file + '.txt')
        if not os.path.isfile(file_path) and wildcard_dir == '':
            file_path = os.path.join(wildcard_path, wildcard_file + '.txt')
        if os.path.isfile(file_path):
            store_offset = None
            if actual_match in match_strings:
                store_offset = offset
                if lock_indicator:
                    offset = offset_seed
                elif random_indicator:
                    offset = random.randint(0, 1000000)
                elif increment_indicator:
                    offset = offset_seed + 1
                elif decrement_indicator:
                    offset = offset_seed - 1
                else:
                    offset = random.randint(0, 1000000)
            selected_lines = []
            with open(file_path, 'r', encoding='utf-8') as file:
                # filter out comment lines (starting with #) and empty lines
                file_lines = [ln.strip() for ln in file.readlines() if ln.strip() and not ln.lstrip().startswith('#')]
                num_lines = len(file_lines)

                # Check if the file has no usable lines
                if num_lines == 0:
                    error_msg = f"[ERROR: file {wildcard_file}.txt is empty in {search_path}]"
                    new_prompt += error_msg
                    if debug:
                        print(error_msg)
                    last_end = m.end()
                    continue

                if words_to_find:
                    for i in range(lines_to_insert):
                        start_idx = (offset + i) % num_lines
                        found_matching_line = False
                        for j in range(num_lines):
                            line_number = (start_idx + j) % num_lines
                            line = file_lines[line_number]
                            if any(re.search(r'\b' + re.escape(word) + r'\b', line, re.IGNORECASE) for word in words_to_find):
                                selected_lines.append(line)
                                found_matching_line = True
                                break
                        if not found_matching_line:
                            # No matching line found for the filter words
                            filter_words_str = ', '.join(words_to_find)
                            error_msg = f"[ERROR: no lines matching filter words '{filter_words_str}' found in {wildcard_file}.txt]"
                            selected_lines.append(error_msg)
                else:
                    start_idx = offset % num_lines
                    for i in range(lines_to_insert):
                        line_number = (start_idx + i) % num_lines
                        line = file_lines[line_number]
                        selected_lines.append(line)
            if len(selected_lines) == 1:
                replacement_text = selected_lines[0]
            else:
                replacement_text = ','.join(selected_lines)
            new_prompt += replacement_text
            match_strings.append(actual_match)
            if store_offset is not None:
                offset = store_offset
                store_offset = None
            offset += lines_to_insert
            if debug:
                print('Wildcard prompt selected: ' + replacement_text)
        else:
            # File not found - generate error message
            if wildcard_dir:
                error_msg = f"[ERROR: file not found {wildcard_file}.txt in {search_path}]"
            else:
                error_msg = f"[ERROR: file not found {wildcard_file}.txt in {wildcard_path}]"
            new_prompt += error_msg
            if debug:
                print(error_msg)
        last_end = m.end()
    new_prompt += prompt[last_end:]
    return new_prompt

def process_wildcard_syntax(text, seed):
    # We keep braceexpand as the core expander, but enrich syntax pre-processing
    # to support weighted choices and multi-select with quantifiers.
    random.seed(seed)

    # Fast path
    if '{' not in text or '}' not in text:
        return text

    def split_top_level_pipes(s: str):
        parts = []
        depth = 0
        buf = []
        i = 0
        while i < len(s):
            c = s[i]
            if c == '{':
                depth += 1
                buf.append(c)
            elif c == '}':
                depth = max(0, depth - 1)
                buf.append(c)
            elif c == '|' and depth == 0:
                parts.append(''.join(buf))
                buf = []
            else:
                buf.append(c)
            i += 1
        parts.append(''.join(buf))
        return parts

    def split_top_level_dollars(s: str):
        # split on '$$' tokens only at top-level
        parts = []
        depth = 0
        i = 0
        last = 0
        while i < len(s):
            c = s[i]
            if c == '{':
                depth += 1
                i += 1
                continue
            if c == '}':
                depth = max(0, depth - 1)
                i += 1
                continue
            if depth == 0 and s.startswith('$$', i):
                parts.append(s[last:i])
                i += 2
                last = i
                continue
            i += 1
        parts.append(s[last:])
        return parts

    def rewrite_weighted(content: str) -> str:
        parts = split_top_level_pipes(content)
        changed = False
        new_parts = []
        for p in parts:
            m = re.match(r"\s*(\d+)\s*::(.*)\Z", p, re.S)
            if m:
                count = int(m.group(1))
                option = m.group(2)
                new_parts.extend([option] * max(0, count))
                changed = True
            else:
                new_parts.append(p)
        return '|'.join(new_parts) if changed else content

    def process_multiselect(content: str):
        # pattern: countSpec $$ sep $$ options
        if '$$' not in content:
            return None
        parts = split_top_level_dollars(content)
        if len(parts) < 3:
            return None
        count_spec = parts[0].strip()
        sep = parts[1]
        options_str = '$$'.join(parts[2:])

        # parse count
        m_range = re.match(r"\s*(\d+)\s*-\s*(\d+)\s*\Z", count_spec)
        m_single = re.match(r"\s*(\d+)\s*\Z", count_spec)
        if m_range:
            lo = int(m_range.group(1))
            hi = int(m_range.group(2))
            if hi < lo:
                lo, hi = hi, lo
            k = random.randint(lo, hi)
        elif m_single:
            k = int(m_single.group(1))
        else:
            return None

        # build options with quantifiers N#token
        raw_opts = split_top_level_pipes(options_str)
        options = []
        for opt in raw_opts:
            q = re.match(r"\s*(\d+)\s*#(.*)\Z", opt, re.S)
            if q:
                n = int(q.group(1))
                tok = q.group(2)
                options.extend([tok] * max(0, n))
            else:
                options.append(opt)

        if not options:
            return ''

        take = min(k, len(options))
        # unique selection without replacement
        chosen = random.sample(options, take) if take > 0 else []
        return sep.join(chosen)

    # Process innermost braces for custom syntaxes
    while True:
        stack = []
        pairs = []
        for idx, ch in enumerate(text):
            if ch == '{':
                stack.append(idx)
            elif ch == '}' and stack:
                start = stack.pop()
                pairs.append((start, idx))
        if not pairs:
            break
        changed_any = False
        for start, end in reversed(pairs):  # process right-to-left (innermost first)
            inner = text[start + 1:end]
            repl = process_multiselect(inner)
            if repl is not None:
                text = text[:start] + repl + text[end + 1:]
                changed_any = True
                continue
            rewritten = rewrite_weighted(inner)
            if rewritten != inner:
                text = text[:start] + '{' + rewritten + '}' + text[end + 1:]
                changed_any = True
        if not changed_any:
            break

    # Now run braceexpand across the whole string using '|' as alternation
    inert_comma = '，'  # fullwidth comma as inert temporary character
    safe_text = text.replace(',', inert_comma).replace('|', ',')
    expansions = list(braceexpand(safe_text))
    expansions = [e.replace(inert_comma, ',') for e in expansions]
    if not expansions:
        return text
    return random.choice(expansions)

def search_and_replace(text, extra_pnginfo, prompt):
    if extra_pnginfo is None or prompt is None:
        return text
    # if %date: in text, then replace with date
    #print(text)
    if '%date:' in text:
        for match in re.finditer(r'%date:(.*?)%', text):
            date_match = match.group(1)
            cursor = 0
            date_pattern = ''
            now = datetime.datetime.now()

            pattern_map = {
                'yyyy': now.strftime('%Y'),
                'yy': now.strftime('%y'),
                'MM': now.strftime('%m'),
                'M': now.strftime('%m').lstrip('0'),
                'dd': now.strftime('%d'),
                'd': now.strftime('%d').lstrip('0'),
                'hh': now.strftime('%H'),
                'h': now.strftime('%H').lstrip('0'),
                'mm': now.strftime('%M'),
                'm': now.strftime('%M').lstrip('0'),
                'ss': now.strftime('%S'),
                's': now.strftime('%S').lstrip('0')
            }

            sorted_keys = sorted(pattern_map.keys(), key=len, reverse=True)

            while cursor < len(date_match):
                replaced = False
                for key in sorted_keys:
                    if date_match.startswith(key, cursor):
                        date_pattern += pattern_map[key]
                        cursor += len(key)
                        replaced = True
                        break
                if not replaced:
                    date_pattern += date_match[cursor]
                    cursor += 1

            text = text.replace('%date:' + match.group(1) + '%', date_pattern)
    # Parse JSON if they are strings
    if isinstance(extra_pnginfo, str):
        extra_pnginfo = json.loads(extra_pnginfo)
    if isinstance(prompt, str):
        prompt = json.loads(prompt)

    # Map from "Node name for S&R" to id in the workflow
    node_to_id_map = {}
    try:
        for node in extra_pnginfo['workflow']['nodes']:
            node_name = node['properties'].get('Node name for S&R')
            node_id = node['id']
            node_to_id_map[node_name] = node_id
    except:
        return text

    # Find all patterns in the text that need to be replaced
    patterns = re.findall(r"%([^%]+)%", text)
    for pattern in patterns:
        # Split the pattern to get the node name and widget name
        node_name, widget_name = pattern.split('.')

        # Find the id for this node name
        node_id = node_to_id_map.get(node_name)
        if node_id is None:
            print(f"No node with name {node_name} found.")
            # check if user entered id instead of node name
            if node_name in node_to_id_map.values():
                node_id = node_name
            else:
                continue

        # Find the value of the specified widget in prompt JSON
        prompt_node = prompt.get(str(node_id))
        if prompt_node is None:
            print(f"No prompt data for node with id {node_id}.")
            continue

        widget_value = prompt_node['inputs'].get(widget_name)
        if widget_value is None:
            print(f"No widget with name {widget_name} found for node {node_name}.")
            continue

        # Replace the pattern in the text
        text = text.replace(f"%{pattern}%", str(widget_value))

    return text

def strip_all_comments(text):
    # Remove HTML-style comments
    text = re.sub(r'(?s)<!--.*?-->', '', text)
    # Remove full lines starting with # (comments), respecting indentation
    text = re.sub(r'(?m)^\s*#.*$', '', text)
    return text

def strip_all_syntax(text):
    # replace any <lora:lora_name> with nothing
    text = re.sub(r'<lora:(.*?)>', '', text)
    # replace any <lora:lora_name:multiplier> with nothing
    text = re.sub(r'<lora:(.*?):(.*?)>', '', text)
    # replace any <style:style_name> with nothing
    text = re.sub(r'<style:(.*?)>', '', text)
    # replace any __wildcard_name__ with nothing
    text = re.sub(r'__(.*?)__', '', text)
    # replace any __wildcard_name|word__ with nothing
    text = re.sub(r'__(.*?)\|(.*?)__', '', text)
    # replace any [2$__wildcard__] with nothing
    text = re.sub(r'\[\d+\$(.*?)\]', '', text)
    # replace any [2$__wildcard|word__] with nothing
    text = re.sub(r'\[\d+\$(.*?)\|(.*?)\]', '', text)
    # replace double spaces with single spaces
    text = text.replace('  ', ' ')
    # replace double commas with single commas
    text = text.replace(',,', ',')
    # replace ` , ` with `, `
    text = text.replace(' , ', ', ')
    # replace leading and trailing spaces and commas
    text = text.strip(' ,')
    # clean up any < > [ ] or _ that are left over
    text = text.replace('<', '').replace('>', '').replace('[', '').replace(']', '').replace('_', '')
    return text

def process_random_syntax(text, seed):
    #print('checking for random syntax')
    random.seed(seed)
    random_re = r'<random:(-?\d*\.?\d+):(-?\d*\.?\d+)>'
    matches = re.finditer(random_re, text)

    # Create a list to hold the new segments of text
    new_text_list = []
    last_end = 0

    # Iterate through matches
    for match in matches:
        lower_bound, upper_bound = map(float, match.groups())
        random_value = random.uniform(lower_bound, upper_bound)
        random_value = round(random_value, 4)

        # Append text up to the match and the generated number
        new_text_list.append(text[last_end:match.start()])
        new_text_list.append(str(random_value))

        # Update the index of the last match end
        last_end = match.end()

    # Append remaining text after the last match
    new_text_list.append(text[last_end:])

    # Combine the list into a single string
    new_text = ''.join(new_text_list)

    #print(new_text)
    return new_text

def add_metadata_to_dict(info_dict, **kwargs):
    for key, value in kwargs.items():
        if isinstance(value, (int, float, str)):
            if key not in info_dict:
                info_dict[key] = [value]
            else:
                info_dict[key].append(value)
                
class OvumWildcardProcessor:
    NAME = "Escapable Wildcard Processor 🥚"
    RETURN_TYPES = ("STRING",)
    FUNCTION = "process"
    CATEGORY = "ovum/text"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {"multiline": True, "placeholder": "Prompt Text"}
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}
                ),
            },
            "hidden": {"prompt_": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    def process(self, prompt, seed, prompt_=None, extra_pnginfo=None):
        if prompt_ is None:
            prompt_ = {}
        if extra_pnginfo is None:
            extra_pnginfo = {}
        # Strip comment lines before any processing so they are ignored everywhere
        prompt = strip_all_comments(prompt)
        prompt = search_and_replace(prompt, extra_pnginfo, prompt_)
        prompt = process_wildcard_syntax(prompt, seed)
        prompt = process_random_syntax(prompt, seed)
        new_prompt = find_and_replace_wildcards(prompt, seed)
        # loop to pick up wildcards that are in wildcard files
        if new_prompt != prompt:
            for i in range(10):
                prompt = new_prompt
                prompt = search_and_replace(prompt, extra_pnginfo, prompt_)
                prompt = process_wildcard_syntax(prompt, seed)
                prompt = process_random_syntax(prompt, seed)
                new_prompt = find_and_replace_wildcards(prompt, seed)
                if new_prompt == prompt:
                    break
        new_prompt = strip_all_comments(new_prompt)
        return (new_prompt, )


CLAZZES = [OvumWildcardProcessor]
