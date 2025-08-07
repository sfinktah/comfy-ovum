export function print_r(obj, options = {}, _indent = '', _seen = new WeakSet()) {
    const {showInherited = false, stripFunctionBody = false} = options;
    const indentStep = '    ';
    const nextIndent = _indent + indentStep;

    if (obj === null) return 'null';
    if (typeof obj === 'undefined') return 'undefined';

    // Check for circular reference BEFORE any processing
    if (typeof obj === 'object' && obj !== null) {
        if (_seen.has(obj)) return '*RECURSION*';
        _seen.add(obj);
    }

    // Function handling
    if (typeof obj === 'function') {
        const src = obj.toString().trim();

        if (stripFunctionBody) {
            if (src.startsWith('class')) {
                const match = src.match(/^class\s+([\w$]*)\s*(?:extends\s+([\w$]+))?/);
                if (match) {
                    const name = match[1] || '(anonymous)';
                    const parent = match[2] ? ` extends ${match[2]}` : '';
                    return formatMultilineString(`class ${name}${parent}`, _indent);
                }
                return 'class (?)';
            } else {
                return formatMultilineString(formatFunctionSignature(obj), _indent);
            }
        } else {
            return formatMultilineString(src, _indent);
        }
    }

    if (typeof obj !== 'object') {
        return formatMultilineString(obj.toString(), _indent);
    }

    // The circular reference check is now at the top of the function
    // This line is now redundant: if (_seen.has(obj)) return '*RECURSION*';
    // And this line is now redundant: _seen.add(obj);

    const isArray = Array.isArray(obj);
    let classLine = '';
    let output = '';

    if (!isArray) {
        const ctor = obj.constructor;
        if (ctor && ctor !== Object) {
            const className = ctor.name || 'AnonymousClass';
            const parentProto = Object.getPrototypeOf(ctor.prototype);
            const parentName = parentProto && parentProto.constructor ? parentProto.constructor.name : null;

            classLine = `${_indent}${className}`;
            if (parentName && parentName !== 'Object') {
                classLine += ` (extends ${parentName})`;
            }
            classLine += '\n';
        }
    }

    output += (isArray ? 'Array\n' : classLine || 'Object\n') + _indent + '(\n';

    const keys = showInherited ? getAllKeys(obj) : Object.keys(obj);
    const seenKeys = new Set();

    for (const key of keys) {
        if (!showInherited && !Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        let val;
        try {
            val = obj[key];
        } catch (e) {
            val = `*Error: ${e.message}*`;
        }

        let valStr;
        if (val !== null && typeof val === 'object') {
            valStr = '\n' + print_r(val, options, nextIndent, _seen);
            output += `${nextIndent}[${key}] => ` + valStr.substring(0, 65535) + `\n`;

        } else if (typeof val === 'function') {
            if (stripFunctionBody) {
                valStr = formatFunctionSignature(val);
            } else {
                valStr = formatMultilineString(val.toString(), nextIndent);
            }
            output += `${nextIndent}[${key}] => ${valStr}\n`;

        } else {
            valStr = formatMultilineString(val?.toString?.() ?? '', nextIndent);
            output += `${nextIndent}[${key}] => ${valStr}\n`;
        }
    }

    output += _indent + ')';
    return output;
}

function formatMultilineString(str, currentIndent) {
    const lines = str.split('\n');
    if (lines.length === 1) return str;
    return lines[0] + '\n' + lines.slice(1).map(line => currentIndent + line).join('\n');
}


function formatFunctionSignature(fn) {
    const src = fn.toString().trim();

    // 1)  Handle classes first
    if (src.startsWith('class')) {
        const m = src.match(/^class\s+([\w$]*)\s*(?:extends\s+([\w$]+))?/);
        const name = m?.[1] || '(anonymous)';
        const parent = m?.[2] ? ` extends ${m[2]}` : '';
        return `class ${name}${parent}`;
    }

    // 2)  Scan for the first '{' that isn't inside (…) or a string
    let inStr = false, strChar = '', escape = false;
    let parenDepth = 0;

    for (let i = 0; i < src.length; i++) {
        const c = src[i];

        // inside "…" / '…' / `…`
        if (inStr) {
            if (escape) {
                escape = false;
                continue;
            }
            if (c === '\\') {
                escape = true;
                continue;
            }
            if (c === strChar) {
                inStr = false;
            }
            continue;
        }

        // enter string literal
        if (c === '"' || c === "'" || c === '`') {
            inStr = true;
            strChar = c;
            continue;
        }

        // track parentheses so we know when we're back at top level
        if (c === '(') {
            parenDepth++;
            continue;
        }
        if (c === ')') {
            if (parenDepth) parenDepth--;
            continue;
        }

        // first body brace at top level → cut here
        if (c === '{' && parenDepth === 0) {
            return src.slice(0, i).trim();
        }
    }

    // fallback (no body found, rare)
    return src;
}


function getAllKeys(obj) {
    const keys = new Set();
    let current = obj;
    while (current && current !== Object.prototype) {
        for (const k of Reflect.ownKeys(current)) {
            if (typeof k !== 'symbol') keys.add(k);
        }
        current = Object.getPrototypeOf(current);
    }
    return Array.from(keys);
}