# Ovum

Some custom nodes for Comfy that I just couldn't live without.  Some have come
from other packages that were annoyingly hard to find, some have been improved
from other peoples' work who don't accept PR requests, and some have been made
by me.

## Twin Connectors: SetTwinNodes and GetTwinNodes

![Twin Connectors: Set/Get screenshot](resources/set_dual_nodes.png)

A pair of graph-cleaning utility nodes designed to “tunnel” connections and reduce visual clutter without sacrificing clarity or type-safety.

All the functionality of Kijai's Set/Get nodes, easier to use than easyUse SetNodes, twice as many connections, and unbelievably more automated.

- SetTwinNodes accepts an arbitrary number (two... more coming soon) of inputs and exposes matching outputs, letting you collect and forward values by meaningful constant names rather than raw wires.
- GetTwinNodes presents matching outputs, selected via lightweight “constant” widgets. You pick the names you care about; the node provides outputs of the corresponding types.

What makes them useful:
- Clean labels over raw types: when a link is attached, constants and slots can inherit human-friendly labels from the connected endpoints; titles are built from the chosen constants.
- Provisional naming: when a Get node learns a name from a downstream connection that does not yet exist on any Set, it marks the constant with an asterisk to signal “choose a valid source later.” When the matching Set appears, the names reconcile automatically.
- Works in either order: you can drop a Get first and wire it to a consumer; later, when a Set of the right type appears, the system can adopt the better name and update labels across the link.
- Sensible colorization: nodes can colorize based on the first connected, typed slot to give fast visual feedback while keeping the graph readable.
- Serialization-safe: saved widget values and output types are respected on load; no surprise re-labelling.
- Ergonomic pairing: when you pick one constant and the system recognizes an associated partner, it can suggest or create the companion slot automatically; if it can’t, it still creates a second empty selector so you can complete the pair manually.
- Tunneling without surprises: existing links remain valid as long as types line up; invalid links are pruned in-place to prevent hard-to-debug mismatches.

How to use:
1. Drop a SetTwinNodes near your sources and connect any values you want to “publish.” Give each constant a clear name (e.g., width, height, start_image). The node mirrors types to its outputs and propagates names to matching Gets.
2. Drop a GetTwinNodes near your consumers and pick the same constant names to “subscribe.” If you connect the Get to a consumer before a matching Set exists, it will note your intent and reconcile once a suitable Set appears.
3. Rename safely: titles and labels follow your constants; if a label equals its raw type (a “lame name”), later Set connections can adopt a better name from a compatible Get to keep the graph readable.
4. Toggle “Show connections” from the node menu to visualize virtual links between Sets and Gets without adding extra wires.

These nodes are meant to keep large graphs navigable while preserving intent through names, not just types. They are deliberately forgiving when you work top-down or bottom-up, and they do their best to stay out of your way once you’ve chosen the labels that make sense in your workflow.

## Text Format Many Nodes

[WIP] Make strings from as many inputs as you want, with python `format` syntax.

## Timer

How long does the workflow spend in each node?

