Changelog

Version 1.0.143

Added
- Media metadata extractor utility to parse JSON embedded in media comments (single path or list). Nodes: N/A (standalone utility).
- Wrote console function jumpToNodeWithLinkId(id) to navigate to a link’s origin. Nodes: N/A (developer feature).
- Fixed "Convert link to Get/Set Twin Nodes" (which is less a menu that a total override of clicking on the link center-circle.

Changed
- Frontend types: use LiteGraph from @comfyorg/comfyui-frontend-types for consistency. Nodes: N/A (typing/imports).
- Twin node conversion now sets widget values via helper and triggers widget callbacks for validation/sync. Nodes: GetTwinNodes, SetTwinNodes.
- Variable names normalized to lowercase with non-alphanumerics replaced by underscores for predictable identifiers. Nodes: GetTwinNodes, SetTwinNodes.
- Auto-collapse created Get/Set Twin nodes and slightly offset their positions for clearer layouts. Nodes: GetTwinNodes, SetTwinNodes.
- Widget value retrieval has a safer fallback when widgets_values is absent. Nodes: GetTwinNodes, SetTwinNodes.

Fixed
- Deterministic handling of variable-name conflicts when converting links to twin nodes (adds from_<origin>_to_<target> suffix). Nodes: GetTwinNodes, SetTwinNodes.
- Ensure widget callbacks run after programmatic value changes to prevent UI/state desync. Nodes: GetTwinNodes, SetTwinNodes.
- Restore original node widget values after conversion and reliably reconnect links. Nodes: GetTwinNodes, SetTwinNodes.

Removed
- None.

