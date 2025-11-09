# SetTwinNodes and GetTwinNodes Documentation

This document provides comprehensive documentation for the SetTwinNodes and GetTwinNodes classes, focusing on how and when node titles are set, how widget value synchronization works, and how node colors are managed.

## Overview

The SetTwinNodes and GetTwinNodes system provides a way to create linked pairs of nodes where:
- **SetTwinNodes**: Acts as a "setter" that receives inputs and broadcasts their values
- **GetTwinNodes**: Acts as a "getter" that provides outputs based on the values from matching SetTwinNodes

## SetTwinNodes Class

### Core Methods

#### Constructor
```javascript
constructor(title)
```

- Initializes the node with TwinNodes defaults, including `numberOfWidgets` (defaults to 2)
- Creates initial text widgets based on `numberOfWidgets`
- Each widget has a callback that validates the value and calls `updateTitle()`, `updateColors()`, `checkConnections()`, and `update()`
- Calls `ensureSlotCounts()` to create matching input/output slots
- Initializes `properties.previousNames` snapshot based on current widget values

#### Title Management

##### `updateTitle()`
Called whenever the node's title needs to be refreshed based on widget values:
- Extracts widget names using `extractWidgetNames()`
- Computes the title using `computeTwinNodeTitle()` with "Set" prefix
- Applies abbreviated output labels via `applyAbbreviatedOutputLabels()`
- Marks canvas as dirty to trigger re-render

**When called:**
- After widget value changes
- After connection changes
- During node initialization

##### `applyAbbreviatedOutputLabels()`
Analyzes widget names and applies shortened labels to outputs when appropriate:
- Uses `analyzeNamesForAbbrev()` to determine if abbreviation should be used
- Updates output slot names and labels with shortened versions
- Preserves original widget values while shortening display labels

#### Widget Value Synchronization

##### `onWidgetChanged(name, value, old_value, w)`
Core method for propagating widget value changes:
- Sends a `setnodeNameChange` graph event with payload `{ oldValue, value, type, widgetIndex, nodeId }`
- GetTwinNodes instances receive this and update any matching selections; see GetTwinNodes → `setnodeNameChange(e)`

##### `onRemoved()`
Cleanup broadcast when the node is deleted:
- Sends `setnodeNameChange` events for each widget with `{ oldValue: <prev>, value: null, type: null, widgetIndex }`
- Allows getters to clear selections that referenced this setter

##### `update()`
Delegates to the TwinNodes base:
- Recomputes colors and title and serializes the node
- No longer performs batch name-change propagation (it is event-driven via `onWidgetChanged`)

#### Connection Management

##### `onConnectionsChange(type, index, isConnected, link_info, inputOrOutput)`
Handles input/output connection events with straightforward rules:

- Output-side changes are ignored (no special handling).
- Input disconnect immediately sets the corresponding input/output type to "*".
- Title and colors are updated by the widget callbacks or other lifecycle methods.

##### `onBeforeConnectInput(target_slot, requested_slot)`
Controls how connections are routed when the node is collapsed:
- If exactly one widget has a non-empty value while collapsed, the connection is routed to that slot.
- If zero or multiple widgets are active while collapsed, the connection is blocked with a warning and the user must expand the node.
- Otherwise prefers the explicitly requested slot if valid; falls back to the target slot; defaults to 0 to avoid cancelling connections.

### Color Management

Colors are managed through the base `TwinNodes` class via `updateColors()`:
- Color is derived from the node's typed outputs (first available type), not inputs
- Uses a custom map (see twinnodeHelpers.setColorAndBgColor) and is gated by the `ovum.nodeAutoColor` setting
- Recomputed during `update()` and when widget values/types change or links are validated

## GetTwinNodes Class

### Core Methods

#### Constructor
```javascript
constructor(title)
```

- Initializes with TwinNodes defaults, including `numberOfWidgets` (defaults to 2)
- Creates combo widgets via `ensureGetterWidgetCount(numberOfWidgets)`
- Each widget’s values provider is `getCombinedConstantNames()` which prepends “(unset)”
- Reacts to property changes in `numberOfWidgets` via `onPropertyChanged` to grow/shrink widgets and outputs
- Note: This node is frontend-focused; serialization respects current widgets/outputs

#### Widget Management

##### `getCombinedConstantNames()`
Returns available constant names for combo widgets:
- Gathers widget values from all SetTwinNodes in the graph
- Creates a unique, sorted list of available names
- Adds "(unset)" option at the beginning for clearing selections

##### `ensureGetterWidgetCount(count)`
Ensures the node has the specified number of combo widgets:
- Creates combo widgets with labels "Constant 1", "Constant 2", etc.
- Each widget uses `getCombinedConstantNames()` as its value provider
- Calls `onRename()` when widget values change

#### Automatic Value Synchronization

##### `setnodeNameChange(e)`
Receives broadcast events from SetTwinNodes when widget values change:
- Payload: `{ oldValue, value, type, widgetIndex, nodeId }`
- For any widgets whose value matches `oldValue`, updates to `value`, calls `setType(type, i)` and then `onRename(i)`
- Marks canvas dirty when applicable

This is the key mechanism that automatically updates GetTwinNodes widgets when matching SetTwinNodes widgets are renamed.

#### Title Management

##### `updateTitle()`
Updates the node title based on selected constant names:
- Extracts widget names using `extractWidgetNames()`
- Computes title using `computeTwinNodeTitle()` with "Get" prefix
- Called after widget changes or connection events

##### `onRename()`
Complex method handling widget selection changes and output slot management:

**Unset Handling:**
- Detects "(unset)" selections and clears widget values
- Disconnects links for unset widgets
- Removes redundant unset widgets/outputs (keeps at least one)

**Setter Matching:**
- Finds matching SetTwinNodes using `findSetter()`
- Auto-fills empty widget selections from matched setter
- Ensures adequate number of widgets based on setter requirements
- Maps selected constants to output types from matched setter inputs

**Output Configuration:**
- Sets output names and types based on selected constants
- Validates existing links against updated types

#### Connection Auto-Derivation

##### `onConnectionsChange(slotType, slot, isChangeConnect, link_info, output)`
Handles automatic widget selection when outputs are connected:

**First Output Connection:**
- When connecting the first output (slot 0) with an unset widget, attempts auto-derivation
- Only if there is exactly one total output link, derives the name from the target input's label/name/type
- If the derived name is not in known constants, uses makeUnlinkedName(name) to append a marker (e.g., “name*”)

**Auto-Pairing:**
- Attempts to find matching SetTwinNodes and auto-pair remaining constants
- Ensures adequate number of widgets based on matched setter

#### Link Resolution

##### `getInputLink(slot)`
Key method that provides the "magic" connection between GetTwinNodes and SetTwinNodes:
- Finds the matching SetTwinNodes for the widget at the given slot
- Returns the link connected to the corresponding input on the matched setter
- Shows error alert if no matching SetTwinNodes is found
- This method enables GetTwinNodes to act as a proxy for SetTwinNodes inputs

### Color Management

Similar to SetTwinNodes, colors are managed through:
- `updateColors()` from base class
- Colors derived from connected output types
- Updated when connections change or widget selections change

## Widget Value Change Flow

### SetTwinNodes → GetTwinNodes Synchronization

1. **User changes widget value in SetTwinNodes**
2. **Widget callback triggers** → calls `validateWidgetName()` and `updateTitle()`
3. **`onWidgetChanged()` is called** → broadcasts `setnodeNameChange` event
4. **All GetTwinNodes receive the event** → `setnodeNameChange()` method processes it
5. **GetTwinNodes updates matching widgets** → changes widgets with old value to new value
6. **GetTwinNodes calls `onRename()`** → updates outputs and validates links
7. **Canvas is marked dirty** → triggers re-render

### Connection-Driven Updates

When connections change on either node type:
1. **Connection event triggers `onConnectionsChange()`**
2. **Node analyzes new connection** → derives types, names, labels
3. **Widget values may be auto-populated** → based on connected slot information
4. **Title and colors are updated** → reflects new connection state
5. **Changes propagate to paired nodes** → via the synchronization mechanism above

## Title Setting Logic

### SetTwinNodes Title
- Format: `"Set {widget1} {widget2} ..."` (or just widget names if prefix disabled)
- Updated whenever widget values change or connections change
- Uses abbreviated labels when appropriate to prevent overly long titles

### GetTwinNodes Title  
- Format: `"Get {widget1} {widget2} ..."` (or just widget names if prefix disabled)
- Updated when widget selections change or connections change
- Reflects currently selected constant names

## Color Change Logic

Both node types use the same color logic implemented in TwinNodes.updateColors:
- Primary color source: first available typed OUTPUT on the node
- Default color: used when no typed outputs exist (or when type is "*")
- Update triggers: `update()`, connection changes, type changes, widget value changes, and link validation
- Color mapping: custom mapping in twinnodeHelpers.setColorAndBgColor, enabled by the `ovum.nodeAutoColor` setting

The color system provides visual feedback about the data types flowing through the node pair, making it easier to understand the graph structure at a glance.