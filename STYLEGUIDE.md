# Project Style Guide

This document captures conventions and best practices discussed for this codebase. It focuses on safe graph access, handler chaining, and context menu extension patterns compatible with ComfyUI/LiteGraph.

## Graph access best practices

Always prefer public/semipublic graph APIs over directly accessing internal arrays or maps.

- Prefer:
  - `graph.getNodeById(id)`
  - `graph.findNodeByTitle(title)` or `graph.findNodesByTitle(title)`
  - `graph.findNodesByClass(className)`
  - `graph.findNodesByType(typeName)`

- Avoid:
  - `app.graph._nodes`
  - `node.graph._nodes`
  - `app.graph._nodes_by_id`
  - Any other underscored/internal structures

When you need to support multiple environments where some APIs may not exist, wrap access in small helpers that try the canonical method first with a safe fallback. Example patterns:

- Node by id:
  - Try `graph.getNodeById(id)`
  - Fallback to `_nodes_by_id[id]`
  - Last resort: linear scan of `nodes/_nodes` arrays

- Nodes by type/class/title:
  - Try `graph.findNodesByType` or `graph.findNodesByClass`
  - Fallback: filter `nodes/_nodes` by `type`, `comfyClass`, `name`, or `title`

These wrappers centralize compatibility and keep call sites clean.

## Handler chaining (preserving original behavior)

When augmenting existing node or API callbacks (e.g., `onExecutionStart`, `onNodeCreated`, `onConnectionsChange`, `getExtraMenuOptions`), always preserve and call the prior function.

Use the `chainCallback` utility below instead of ad-hoc "orig_" wrapping:

```js
export function chainCallback(object, property, callback) {
    if (!object) {
        console.error("Tried to add callback to a non-existent object");
        return;
    }
    if (property in object) {
        const callback_orig = object[property];
        object[property] = function () {
            const r = callback_orig?.apply(this, arguments);
            callback.apply(this, arguments);
            return r;
        };
    } else {
        object[property] = callback;
    }
}
```


## Adding to the context menu

When modifying a node's context menu, unless the node is "front-end only" (inherits directly from LGraphNode) always be sure to call the prior function, either by using a chainCallback function, or manually as in these examples:

**A simple & nasty idiomatic prototype hook **
```js
app.registerExtension({
    name: "node.name",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PythonNodeClass") {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                getExtraMenuOptions?.apply(this, arguments);

                submenusToAdd.forEach((input, index) => {
                    const submenu = {
                        content: `${input}_Mode`,
                        submenu: {
                            options: [
                                {
                                    content: "Mute",
                                    callback: () => {
                                        this.properties[`${input}_Mode`] = "mute";
                                        this.setDirtyCanvas(true);
                                    }
                                },
                            ]
                        }
                    };
                    options.push(submenu);
                });
            };
        }
    }
});
```


**A helper function**
```js
function addContextMenuHandler(nodeType, cb) {
    const getOpts = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function () {
        const r = getOpts.apply(this, arguments);
        cb.apply(this, arguments);
        return r;
    };
}

app.registerExtension({
    name: "ovum.contextmenu",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // after checking to see if this is out name

        if (nodeData.input && nodeData.input.required) {
            addContextMenuHandler(nodeType, function (_, options) {
                options.unshift(
                    {
                        content: "Add GetTwinNodes",
                        callback: () => {
                            addNode("GetTwinNodes", this, {side: "left", offset: 30});
                        }
                    },
                    {
                        content: "Add SetTwinNodes",
                        callback: () => {
                            addNode("SetTwinNodes", this, {side: "right", offset: 30});
                        },
                    });
            });
        }
        // ...
    }
});
```


