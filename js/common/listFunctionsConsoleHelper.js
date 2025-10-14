function listFunctions(obj, objNameOrOptions, maybeOptions) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
        console.log('Invalid input: Please provide a valid object or function');
        return;
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
        if (obj.constructor && obj.constructor.name && obj.constructor.name !== 'Object') {
            objName = obj.constructor.name;
        } else if (typeof obj === 'function' && obj.name) {
            objName = obj.name;
        } else if (obj[Symbol.toStringTag]) {
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

        current = Object.getPrototypeOf(current);
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
        return;
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

    return members;
}

window.listFunctions = listFunctions;

// Usage examples:
// listFunctions(document);
// listFunctions(console);
// listFunctions(Array.prototype);
// listFunctions(myCustomObject, 'MyObject');
// New examples:
// listFunctions(myObj, { depth: 2 });
// listFunctions(myObj, 'MyObject', { depth: 1 });