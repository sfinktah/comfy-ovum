## Me
ComfyUI.

Write me something I can paste into the browser console in JavaScript that searches all the nodes in the graph, and removes any input named "list"

## AI Assistant
Here's a JavaScript snippet you can paste into the browser console to search all nodes in the graph and remove any input named "list":

```javascript
// Get all nodes in the graph
const nodes = app.graph._nodes || [];

let removedCount = 0;

// Iterate through each node
nodes.forEach(node => {
    if (!node.inputs) return;
    
    // Find inputs named "list" (case-insensitive)
    const inputsToRemove = [];
    node.inputs.forEach((input, index) => {
        if (input.name && input.name.toLowerCase() === 'list') {
            inputsToRemove.push(index);
        }
    });
    
    // Remove inputs in reverse order to maintain correct indices
    inputsToRemove.reverse().forEach(index => {
        if (node.removeInput && typeof node.removeInput === 'function') {
            node.removeInput(index);
            removedCount++;
            console.log(`Removed input "list" from node ${node.title || node.type} (ID: ${node.id})`);
        }
    });
});

console.log(`Total inputs removed: ${removedCount}`);

// Refresh the canvas to reflect changes
if (app.canvas && app.canvas.setDirty) {
    app.canvas.setDirty(true, true);
}
```


This script will:

1. Get all nodes from the current graph
2. Search through each node's inputs for any named "list" (case-insensitive)
3. Remove those inputs using the `removeInput` method
4. Log which nodes had inputs removed
5. Refresh the canvas to show the changes
6. Report the total count of removed inputs

The script handles the removal safely by removing inputs in reverse order to avoid index shifting issues, and it logs the progress so you can see which nodes were affected.

## Me
Write me a similar script to remove all nodes of a given type that have no ouputs

## AI Assistant
Of course! Here is a JavaScript snippet that finds and removes all nodes of a specific type that do not have any active output connections.

You can paste this directly into your browser's developer console.

### Instructions

1.  **Change the `nodeTypeToRemove` variable** in the first line of the script to the type name of the nodes you want to target (e.g., `"Reroute"`, `"PrimitiveNode"`, etc.).
2.  Copy the entire script.
3.  Open your browser's developer console (usually by pressing F12).
4.  Paste the script into the console and press Enter.

```javascript
/**
 * Removes all nodes of a specified type that have no output connections.
 */
function removeUnconnectedNodesByType() {
    // --- CONFIGURATION ---
    // Change this to the type name of the nodes you want to remove.
    // This is case-sensitive. Examples: "Reroute", "PrimitiveNode", "Note".
    const nodeTypeToRemove = "Reroute"; 
    // --- END CONFIGURATION ---

    if (!window.app?.graph) {
        console.error("ComfyUI app or graph not found.");
        return;
    }

    const graph = window.app.graph;
    const nodesToRemove = [];
    let removedCount = 0;

    console.log(`Searching for unconnected nodes of type: "${nodeTypeToRemove}"`);

    // Iterate through all nodes to find candidates for removal
    for (const node of graph._nodes) {
        // Check if the node is of the target type (checking both 'type' and 'comfyClass')
        if (node.type === nodeTypeToRemove || node.comfyClass === nodeTypeToRemove) {
            
            // Check if the node has any output connections
            let hasOutputConnections = false;
            if (node.outputs && node.outputs.length > 0) {
                for (const output of node.outputs) {
                    if (output.links && output.links.length > 0) {
                        hasOutputConnections = true;
                        break; // Stop checking if at least one connection is found
                    }
                }
            }

            // If no output connections were found, add it to the removal list
            if (!hasOutputConnections) {
                nodesToRemove.push(node);
            }
        }
    }

    // Remove the collected nodes from the graph
    if (nodesToRemove.length > 0) {
        nodesToRemove.forEach(node => {
            graph.remove(node);
            removedCount++;
            console.log(`Removed node: ${node.title || node.type} (ID: ${node.id})`);
        });
    }

    console.log(`Finished. Total nodes removed: ${removedCount}`);

    // Refresh the canvas to reflect the changes
    if (window.app.canvas?.setDirty) {
        window.app.canvas.setDirty(true, true);
    }
}

// Run the function
removeUnconnectedNodesByType();
```


## Me
make the type a function argument

## AI Assistant
Of course. I've updated the script to use a function that accepts the node type as an argument.

Here is the refined JavaScript snippet. You can paste this into your browser's developer console and then call the function with the desired node type.

### Instructions

1.  Copy the entire script and paste it into your browser's developer console.
2.  Call the function `removeUnconnectedNodesByType()` with the node type you want to clean up as a string argument. For example:
    *   To remove all unconnected "Reroute" nodes: `removeUnconnectedNodesByType("Reroute");`
    *   To remove all unconnected "PrimitiveNode" nodes: `removeUnconnectedNodesByType("PrimitiveNode");`

```javascript
/**
 * Removes all nodes of a specified type that have no output connections.
 * @param {string} nodeTypeToRemove The case-sensitive type name of the nodes to remove (e.g., "Reroute", "PrimitiveNode").
 */
function removeUnconnectedNodesByType(nodeTypeToRemove) {
    if (typeof nodeTypeToRemove !== 'string' || !nodeTypeToRemove) {
        console.error("Please provide a valid node type as a string argument.");
        return;
    }

    if (!window.app?.graph) {
        console.error("ComfyUI app or graph not found.");
        return;
    }

    const graph = window.app.graph;
    const nodesToRemove = [];
    let removedCount = 0;

    console.log(`Searching for unconnected nodes of type: "${nodeTypeToRemove}"`);

    // Iterate through all nodes to find candidates for removal
    for (const node of graph._nodes) {
        // Check if the node is of the target type (checking both 'type' and 'comfyClass')
        if (node.type === nodeTypeToRemove || node.comfyClass === nodeTypeToRemove) {
            
            // Check if the node has any output connections
            let hasOutputConnections = false;
            if (node.outputs && node.outputs.length > 0) {
                for (const output of node.outputs) {
                    if (output.links && output.links.length > 0) {
                        hasOutputConnections = true;
                        break; // Stop checking if at least one connection is found
                    }
                }
            }

            // If no output connections were found, add it to the removal list
            if (!hasOutputConnections) {
                nodesToRemove.push(node);
            }
        }
    }

    // Remove the collected nodes from the graph
    if (nodesToRemove.length > 0) {
        nodesToRemove.forEach(node => {
            graph.remove(node);
            removedCount++;
            console.log(`Removed node: ${node.title || node.type} (ID: ${node.id})`);
        });
    }

    console.log(`Finished. Total nodes of type "${nodeTypeToRemove}" removed: ${removedCount}`);

    // Refresh the canvas to reflect the changes
    if (window.app.canvas?.setDirty) {
        window.app.canvas.setDirty(true, true);
    }
}

// --- EXAMPLE USAGE ---
// After pasting the function above, you can call it like this:
//
// removeUnconnectedNodesByType("Reroute");
// removeUnconnectedNodesByType("Note");
```


## Me
add a flag to optionally restrict the deletion to only collapsed or non-collapsed nodes.

## AI Assistant
Of course. I've updated the script to include an optional flag that lets you specify whether to delete all matching nodes, only the collapsed ones, or only the expanded ones.

Here is the updated JavaScript snippet.

### Instructions

1.  Copy and paste the entire script into your browser's developer console.
2.  Call the `removeUnconnectedNodesByType()` function with the node type.
3.  Optionally, provide a second argument to specify the collapsed state:
    *   `'all'` (default): Deletes all matching nodes regardless of their state.
    *   `'collapsed'`: Deletes only the collapsed nodes.
    *   `'expanded'`: Deletes only the non-collapsed (expanded) nodes.

```javascript
/**
 * Removes all nodes of a specified type that have no output connections.
 * @param {string} nodeTypeToRemove The case-sensitive type name of the nodes to remove (e.g., "Reroute").
 * @param {'all' | 'collapsed' | 'expanded'} [collapsedState='all'] Optionally filter by the node's collapsed state.
 */
function removeUnconnectedNodesByType(nodeTypeToRemove, collapsedState = 'all') {
    if (typeof nodeTypeToRemove !== 'string' || !nodeTypeToRemove) {
        console.error("Please provide a valid node type as a string argument.");
        return;
    }

    const validStates = ['all', 'collapsed', 'expanded'];
    if (!validStates.includes(collapsedState)) {
        console.error(`Invalid collapsedState. Must be one of: ${validStates.join(', ')}`);
        return;
    }

    if (!window.app?.graph) {
        console.error("ComfyUI app or graph not found.");
        return;
    }

    const graph = window.app.graph;
    const nodesToRemove = [];
    let removedCount = 0;

    console.log(`Searching for unconnected nodes of type "${nodeTypeToRemove}" with collapsed state: "${collapsedState}"`);

    // Iterate through all nodes to find candidates for removal
    for (const node of graph._nodes) {
        // Check 1: Node Type
        if (node.type === nodeTypeToRemove || node.comfyClass === nodeTypeToRemove) {
            
            // Check 2: Collapsed State
            const isCollapsed = node.flags?.collapsed || false;
            if (collapsedState === 'collapsed' && !isCollapsed) {
                continue; // Skip if we only want collapsed nodes, but this one is expanded.
            }
            if (collapsedState === 'expanded' && isCollapsed) {
                continue; // Skip if we only want expanded nodes, but this one is collapsed.
            }

            // Check 3: Output Connections
            let hasOutputConnections = false;
            if (node.outputs && node.outputs.length > 0) {
                for (const output of node.outputs) {
                    if (output.links && output.links.length > 0) {
                        hasOutputConnections = true;
                        break; // Stop checking if at least one connection is found
                    }
                }
            }

            // If no output connections were found, add it to the removal list
            if (!hasOutputConnections) {
                nodesToRemove.push(node);
            }
        }
    }

    // Remove the collected nodes from the graph
    if (nodesToRemove.length > 0) {
        nodesToRemove.forEach(node => {
            graph.remove(node);
            removedCount++;
            console.log(`Removed node: ${node.title || node.type} (ID: ${node.id})`);
        });
    }

    console.log(`Finished. Total nodes of type "${nodeTypeToRemove}" removed: ${removedCount}`);

    // Refresh the canvas to reflect the changes
    if (window.app.canvas?.setDirty) {
        window.app.canvas.setDirty(true, true);
    }
}

// --- EXAMPLE USAGE ---
// After pasting the function above, you can call it like this:

// Remove all unconnected "Reroute" nodes (default behavior)
// removeUnconnectedNodesByType("Reroute");

// Remove only COLLAPSED unconnected "Reroute" nodes
// removeUnconnectedNodesByType("Reroute", "collapsed");

// Remove only EXPANDED (non-collapsed) unconnected "Reroute" nodes
// removeUnconnectedNodesByType("Reroute", "expanded");
```

