function listFunctions(obj, objNameOrOptions, maybeOptions) {
    // Capture all console.log calls within this function and emit a single multi-line log at the end
    const originalConsoleLog = console.log;
    const buffered = [];
    const capture = (...args) => buffered.push(args.map(a => String(a)).join(' '));
    console.log = capture;

    const finalize = (ret) => {
        // Restore console.log first, then output the buffered content in a single call
        console.log = originalConsoleLog;
        if (buffered.length) {
            originalConsoleLog(buffered.join('\n'));
        }
        return ret;
    };

    try {
        if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
            console.log('Invalid input: Please provide a valid object or function');
            return finalize(undefined);
        }

        // New: normalize arguments (obj, objName?, options?) allowing options before, after, or instead of objName
        const defaultOptions = { depth: 0 /* recurse indefinitely */ };
        let objName = undefined;
        let options = undefined;

        // Determine provided arguments
        if (typeof objNameOrOptions === 'object' && objNameOrOptions && typeof objNameOrOptions !== 'function') {
            // Case: (obj, options)
            options = objNameOrOptions;
        } else if (typeof objNameOrOptions === 'string') {
            // Case: (obj, objName, options?)
            objName = objNameOrOptions;
            if (maybeOptions && typeof maybeOptions === 'object') {
                options = maybeOptions;
            }
        }

        // Merge options with defaults
        const opt = Object.assign({}, defaultOptions, options || {});
        // Normalize/validate depth: numbers >= 0; 0 means unlimited
        let maxDepth = 0;
        if (Number.isFinite(opt.depth) && opt.depth >= 0) {
            maxDepth = Math.floor(opt.depth);
        } else {
            maxDepth = 0;
        }

        // Attempt to guess class name if not provided
        if (!objName) {
            if (obj && obj.constructor && obj.constructor.name && obj.constructor.name !== 'Object') {
                objName = obj.constructor.name;
            } else if (typeof obj === 'function' && obj.name) {
                objName = obj.name;
            } else if (obj && obj[Symbol.toStringTag]) {
                objName = obj[Symbol.toStringTag];
            } else {
                objName = Object.prototype.toString.call(obj).slice(8, -1);
            }
        }

        console.log(`\n=== Analysis of ${objName} ===`);

        const members = [];
        const visited = new Set();
        const inheritanceChain = [];

        // Common Object.prototype methods to skip
        const objectPrototypeMethods = new Set([
            'constructor', 'toString', 'valueOf', 'hasOwnProperty',
            'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
            '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
            '__proto__'
        ]);

        // Function to extract parameter names from function string
        function getParameterNames(func) {
            try {
                const funcStr = func.toString();

                // Handle arrow functions
                if (funcStr.includes('=>')) {
                    const match = funcStr.match(/^\s*(?:async\s+)?(?:\(([^)]*)\)|([^=\s]+))\s*=>/);
                    if (match) {
                        const params = match[1] || match[2] || '';
                        return params.split(',').map(p => p.trim()).filter(p => p);
                    }
                }

                // Handle regular functions
                const match = funcStr.match(/(?:function\s*)?(?:\w+\s*)?\(([^)]*)\)/);
                if (match) {
                    const params = match[1];
                    return params.split(',').map(p => p.trim()).filter(p => p);
                }

                return [];
            } catch (e) {
                return [];
            }
        }

        // Get source code if it's short enough
        function getSourceCode(func) {
            try {
                const source = func.toString();
                return source.length <= 256 ? source : null;
            } catch (e) {
                return null;
            }
        }

        // Get detailed class information for a prototype level
        function getClassInfo(proto, level) {
            if (!proto) return { name: 'null', detail: '' };
            if (proto === Object.prototype) return { name: 'Object', detail: ' (base)' };

            // For the instance itself (level 0)
            if (level === 0) {
                if (typeof proto === 'function') {
                    return { name: proto.name || 'AnonymousFunction', detail: ' (function)' };
                }
                if (proto.constructor && proto.constructor.name && proto.constructor.name !== 'Object') {
                    return { name: proto.constructor.name, detail: ' (instance)' };
                }
                return { name: 'Object', detail: ' (plain object)' };
            }

            // For prototype levels (level > 0)
            const constructorName = proto.constructor?.name;
            if (constructorName && constructorName !== 'Object') {
                const detail = proto === proto.constructor.prototype ? ' (prototype)' : ' (inherited)';
                return { name: constructorName, detail };
            }

            // Fallback detection
            const toString = Object.prototype.toString.call(proto);
            const match = toString.match(/\[object (\w+)\]/);
            const fallbackName = match ? match[1] : 'Unknown';

            return { name: fallbackName, detail: ' (detected)' };
        }

        // Walk the prototype chain
        let current = obj;
        let level = 0;
        const seenPrototypes = new WeakSet();
        const maxProtoHops = 200; // safety cap to avoid cyclic/abnormal prototype chains
        let protoHops = 0;

        while (current && !seenPrototypes.has(current)) {
            // Apply depth limit: if maxDepth > 0, only traverse up to that many levels beyond the initial object
            if (maxDepth > 0 && level > maxDepth) break;

            seenPrototypes.add(current);

            const classInfo = getClassInfo(current, level);

            // Skip Object.prototype level entirely
            if (current === Object.prototype) {
                break;
            }

            inheritanceChain.push({
                level,
                className: classInfo.name,
                detail: classInfo.detail,
                proto: current
            });

            const props = Object.getOwnPropertyNames(current);
            const descriptors = {};

            // Get all property descriptors
            props.forEach(prop => {
                try {
                    descriptors[prop] = Object.getOwnPropertyDescriptor(current, prop);
                } catch (e) {
                    // Skip properties that can't be accessed
                }
            });

            props.forEach(prop => {
                // Skip Object.prototype methods at any level
                if (objectPrototypeMethods.has(prop)) return;
                if (visited.has(prop)) return;
                visited.add(prop);

                const descriptor = descriptors[prop];
                if (!descriptor) return;

                try {
                    // Handle getters
                    if (descriptor.get) {
                        const params = getParameterNames(descriptor.get);
                        const source = getSourceCode(descriptor.get);
                        members.push({
                            name: prop,
                            type: 'getter',
                            parameters: params,
                            paramCount: params.length,
                            isAsync: descriptor.get.constructor.name === 'AsyncFunction',
                            source: level === 0 ? 'own' : 'inherited',
                            className: classInfo.name,
                            classDetail: classInfo.detail,
                            level: level,
                            sourceCode: source
                        });
                    }

                    // Handle setters
                    if (descriptor.set) {
                        const params = getParameterNames(descriptor.set);
                        const source = getSourceCode(descriptor.set);
                        members.push({
                            name: prop,
                            type: 'setter',
                            parameters: params,
                            paramCount: params.length,
                            isAsync: descriptor.set.constructor.name === 'AsyncFunction',
                            source: level === 0 ? 'own' : 'inherited',
                            className: classInfo.name,
                            classDetail: classInfo.detail,
                            level: level,
                            sourceCode: source
                        });
                    }

                    // Handle functions (only if not already covered by getter/setter)
                    if (!descriptor.get && !descriptor.set && typeof descriptor.value === 'function') {
                        const params = getParameterNames(descriptor.value);
                        const isConstructor = prop === 'constructor';
                        const isAsync = descriptor.value.constructor.name === 'AsyncFunction';
                        const source = getSourceCode(descriptor.value);

                        members.push({
                            name: prop,
                            type: 'function',
                            parameters: params,
                            paramCount: params.length,
                            isAsync: isAsync,
                            isConstructor: isConstructor,
                            source: level === 0 ? 'own' : 'inherited',
                            className: classInfo.name,
                            classDetail: classInfo.detail,
                            level: level,
                            sourceCode: source
                        });
                    }
                } catch (e) {
                    // Skip properties that can't be accessed
                }
            });

            // Advance to next prototype with extra cycle guards
            let nextProto = null;
            try {
                nextProto = Object.getPrototypeOf(current);
            } catch (_) {
                break; // cannot get prototype, stop
            }
            if (!nextProto) break; // reached end
            if (nextProto === current) break; // self-cycle guard
            if (seenPrototypes.has(nextProto)) break; // would revisit, stop
            protoHops++;
            if (protoHops > maxProtoHops) break; // safety cap
            current = nextProto;
            level++;
        }

        // Display inheritance tree
        console.log('\nInheritance Chain:');
        inheritanceChain.forEach(({ level, className, detail }) => {
            const indent = '  '.repeat(level);
            const arrow = level > 0 ? '|- ' : '';
            console.log(`${indent}${arrow}${className}${detail}`);
        });

        // Sort members alphabetically, then by type
        members.sort((a, b) => {
            if (a.name !== b.name) return a.name.localeCompare(b.name);
            return a.type.localeCompare(b.type);
        });

        if (members.length === 0) {
            console.log('\nNo functions, getters, or setters found in this object');
            return finalize(undefined);
        }

        // Group by type for display
        const byType = {
            function: members.filter(m => m.type === 'function'),
            getter: members.filter(m => m.type === 'getter'),
            setter: members.filter(m => m.type === 'setter')
        };

        // Display members by type
        Object.entries(byType).forEach(([type, items]) => {
            if (items.length === 0) return;

            const typeLabel = type === 'function' ? 'Functions' :
                type === 'getter' ? 'Getters' : 'Setters';
            console.log(`\n${typeLabel}:`);

            items.forEach(member => {
                const asyncPrefix = member.isAsync ? 'async ' : '';
                const constructorNote = member.isConstructor ? ' (constructor)' : '';
                const sourceNote = member.source === 'inherited' ?
                    ` [${member.className}${member.classDetail}]` : '';
                const paramString = member.parameters.join(', ');

                if (type === 'function') {
                    console.log(`${asyncPrefix}${member.name}(${paramString})${constructorNote}${sourceNote}`);
                } else {
                    console.log(`${member.name}${sourceNote}`);
                }

                // Show source code if available and short enough
                if (member.sourceCode) {
                    const lines = member.sourceCode.split('\n');
                    if (lines.length === 1) {
                        console.log(`  ${member.sourceCode}`);
                    } else {
                        lines.forEach(line => console.log(`  ${line}`));
                    }
                }
            });
        });

        // Summary statistics
        console.log(`\nSummary:`);
        console.log(`  |- Total members: ${members.length}`);
        console.log(`  |- Functions: ${byType.function.length}`);
        console.log(`  |- Getters: ${byType.getter.length}`);
        console.log(`  |- Setters: ${byType.setter.length}`);

        const ownMembers = members.filter(m => m.source === 'own').length;
        const inheritedMembers = members.filter(m => m.source === 'inherited').length;
        const asyncMembers = members.filter(m => m.isAsync).length;
        const withSourceCode = members.filter(m => m.sourceCode).length;

        console.log(`  |- Own members: ${ownMembers}`);
        console.log(`  |- Inherited members: ${inheritedMembers}`);
        console.log(`  |- Async members: ${asyncMembers}`);
        console.log(`  |- With source code: ${withSourceCode}`);

        return finalize(members);
    } catch (err) {
        // Ensure we still flush anything captured before the error
        return finalize(undefined);
    }
}

// Expose
window.listFunctions = listFunctions;

// Usage examples:
// listFunctions(document);
// listFunctions(console);
// listFunctions(Array.prototype);
// listFunctions(myCustomObject, 'MyObject');
// New examples:
// listFunctions(myObj, { depth: 2 });
// listFunctions(myObj, 'MyObject', { depth: 1 });

// New: findFunction - recursively search for functions/callables whose name matches a RegExp (case-insensitive)
function findFunction(obj, regexOrNameOrOptions, maybeNameOrRegexOrOptions, maybeOptions) {
    // Normalize args: (obj, regex, objName?, options?) OR (obj, objName, regex, options?) OR (obj, options with depth?)
    let providedRegex = undefined;
    let objName = undefined;
    let options = undefined;

    const isRegExp = v => Object.prototype.toString.call(v) === '[object RegExp]';

    if (isRegExp(regexOrNameOrOptions)) {
        providedRegex = regexOrNameOrOptions;
        if (typeof maybeNameOrRegexOrOptions === 'string') objName = maybeNameOrRegexOrOptions;
        if (maybeOptions && typeof maybeOptions === 'object') options = maybeOptions;
        if (!options && typeof maybeNameOrRegexOrOptions === 'object' && !isRegExp(maybeNameOrRegexOrOptions)) options = maybeNameOrRegexOrOptions;
    } else if (typeof regexOrNameOrOptions === 'string' || (typeof regexOrNameOrOptions === 'object' && regexOrNameOrOptions)) {
        if (isRegExp(maybeNameOrRegexOrOptions)) {
            objName = typeof regexOrNameOrOptions === 'string' ? regexOrNameOrOptions : undefined;
            providedRegex = maybeNameOrRegexOrOptions;
            if (maybeOptions && typeof maybeOptions === 'object') options = maybeOptions;
            if (!options && typeof regexOrNameOrOptions === 'object' && !isRegExp(regexOrNameOrOptions)) options = regexOrNameOrOptions;
        } else {
            // fallback: options only (not very useful without regex)
        }
    }

    if (!providedRegex) {
        throw new Error('findFunction requires a RegExp to match names against.');
    }

    // Ensure case-insensitive
    const flags = providedRegex.flags.includes('i') ? providedRegex.flags : providedRegex.flags + 'i';
    const re = new RegExp(providedRegex.source, Array.from(new Set(flags.split(''))).join(''));

    const defaultOptions = { depth: 0 /* recurse indefinitely */ };
    const opt = Object.assign({}, defaultOptions, options || {});
    let maxDepth = 0;
    if (Number.isFinite(opt.depth) && opt.depth >= 0) {
        maxDepth = Math.floor(opt.depth);
    }

    // Guess name if not provided
    if (!objName) {
        if (obj && obj.constructor && obj.constructor.name && obj.constructor.name !== 'Object') {
            objName = obj.constructor.name;
        } else if (typeof obj === 'function' && obj.name) {
            objName = obj.name;
        } else if (obj && obj[Symbol.toStringTag]) {
            objName = obj[Symbol.toStringTag];
        } else {
            objName = Object.prototype.toString.call(obj).slice(8, -1);
        }
    }

    const seen = new WeakSet();
    const results = [];

    function nameMatches(name) {
        return name && re.test(name);
    }

    function record(kind, name, value, path) {
        results.push({ kind, name, value, path: path.slice() });
    }

    function isCallableObject(v) {
        return v && typeof v === 'object' && typeof v.call === 'function' && typeof v.apply === 'function';
    }

    function traverse(value, path, depth) {
        if (value && (typeof value === 'object' || typeof value === 'function')) {
            if (seen.has(value)) return;
            seen.add(value);
        }

        // Check the value itself if callable
        if (typeof value === 'function') {
            const fname = value.name || (path.length ? String(path[path.length - 1]) : undefined);
            if (nameMatches(fname)) record('function', fname, value, path);
        } else if (isCallableObject(value)) {
            const cname = value.name || value.constructor?.name || (path.length ? String(path[path.length - 1]) : undefined);
            if (nameMatches(cname)) record('callable-object', cname, value, path);
        }

        // Depth control: if maxDepth > 0 and we've exceeded it, stop
        if (maxDepth > 0 && depth > maxDepth) return;

        // Safely inspect own properties without invoking getters
        let descriptors;
        try {
            descriptors = Object.getOwnPropertyDescriptors(value);
        } catch (_) {
            descriptors = undefined;
        }
        if (descriptors) {
            for (const [key, desc] of Object.entries(descriptors)) {
                const nextPath = path.concat([key]);
                try {
                    if (desc.value !== undefined) {
                        const v = desc.value;
                        if (typeof v === 'function') {
                            const n = v.name || key;
                            if (nameMatches(n)) record('function', n, v, nextPath);
                        } else if (isCallableObject(v)) {
                            const n = v.name || v.constructor?.name || key;
                            if (nameMatches(n)) record('callable-object', n, v, nextPath);
                        }
                        // Recurse into objects/functions to continue search
                        if (v && (typeof v === 'object' || typeof v === 'function')) {
                            traverse(v, nextPath, depth + 1);
                        }
                    }
                    if (typeof desc.get === 'function') {
                        const n = desc.get.name || `${key} get`;
                        if (nameMatches(n)) record('getter', n, desc.get, nextPath);
                    }
                    if (typeof desc.set === 'function') {
                        const n = desc.set.name || `${key} set`;
                        if (nameMatches(n)) record('setter', n, desc.set, nextPath);
                    }
                } catch (_) {
                    // ignore property access issues
                }
            }
        }

        // Also traverse prototype chain (excluding Object.prototype)
        try {
            const proto = Object.getPrototypeOf(value);
            if (proto && proto !== Object.prototype) {
                traverse(proto, path.concat(['__proto__']), depth + 1);
            }
        } catch (_) { /* ignore */ }
    }

    traverse(obj, [objName], 0);
    return results;
}

window.findFunction = findFunction;