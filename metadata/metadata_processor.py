from typing import Any, Dict, List, Optional, Tuple


# noinspection PyShadowingBuiltins
class MetadataProcessor:
    """
    Processes ComfyUI workflow/prompt metadata to retrieve input values by node id/title
    or by following an 'any_input' link relative to a known WidgetToStringOvumOvum node.
    Extracted from WidgetToStringOvum.get_widget_value.
    Returns native types for inputs; string formatting is the caller's responsibility.

    Also provides helper methods for traversing ComfyUI workflow and prompt metadata
    with a unified API over both formats to find nodes and read inputs.

    - Prompt: The exact execution graph that was run to produce the image.
    - Workflow: The full editor canvas as you saw it in ComfyUI.
    """

    def __init__(self, workflow: Dict[str, Any], prompt: Dict[str, Any]):
        self.workflow = workflow or {}
        self.prompt = prompt or {}
        self._subgraph_defs = self._build_subgraph_defs()
        self._link_to_node_map: Dict[Tuple[str, int], str] = {}
        self._all_workflow_nodes: List[Tuple[str, str, Dict[str, Any]]] = []
        self._build_indexes()

        # Basic workflow caches from MetadataHelper
        self._nodes_workflow: List[Dict[str, Any]] = list(self.workflow.get('nodes', []) or [])
        # map: id -> node
        self._id_map_workflow: Dict[str, Dict[str, Any]] = {}
        for n in self._nodes_workflow:
            nid = n.get('id')
            if nid is not None:
                self._id_map_workflow[str(nid)] = n

    def _build_subgraph_defs(self) -> Dict[str, Any]:
        """
        Build a dictionary of subgraph definitions indexed by their ID.

        Extracts subgraph definitions from the workflow's definitions section
        and creates a lookup map for quick access by subgraph ID.

        Returns:
            Dict mapping subgraph IDs to their definition dictionaries
        """
        defs = self.workflow.get("definitions", {}) or {}
        return {sg.get("id"): sg for sg in (defs.get("subgraphs", []) or []) if sg.get("id")}

    def _register_links(self, scope_key: str, node_obj: Dict[str, Any], full_node_id: str) -> None:
        """
        Register all output links from a node to the link-to-node mapping.

        Iterates through all outputs of a node and maps each link ID to the source node,
        enabling reverse lookup from link ID to the node that produces it.

        Args:
            scope_key: The scope/path context for the node (empty for top-level)
            node_obj: The node dictionary containing outputs
            full_node_id: The fully qualified ID of the node
        """
        outputs = node_obj.get("outputs") or []
        for out in outputs:
            links = out.get("links")
            if not links:
                continue
            if isinstance(links, list):
                for lid in links:
                    if lid is None:
                        continue
                    self._link_to_node_map[(scope_key, lid)] = full_node_id

    def _emit_subgraph_instance(self, sub_def: Dict[str, Any], instance_path: str):
        """
        Recursively emit all nodes within a subgraph instance, including nested subgraphs.

        Traverses a subgraph definition and yields each node with its fully qualified ID
        (including the parent path). Recursively processes nested subgraphs.

        Args:
            sub_def: The subgraph definition dictionary
            instance_path: The parent path leading to this subgraph instance

        Yields:
            Tuples of (full_node_id, instance_path, node_dict) for each node
        """
        for snode in (sub_def.get("nodes") or []):
            child_id = str(snode.get("id"))
            full_id = f"{instance_path}:{child_id}"
            yield full_id, instance_path, snode
            stype = snode.get("type")
            nested_def = self._subgraph_defs.get(stype)
            if nested_def is not None:
                nested_instance_path = full_id
                for inner in self._emit_subgraph_instance(nested_def, nested_instance_path):
                    yield inner

    def _iter_all_workflow_nodes(self):
        """
        Iterate over all workflow nodes, including those in nested subgraphs.

        Yields top-level nodes first, then recursively yields nodes from any
        subgraph instances, providing fully qualified IDs for nested nodes.

        Yields:
            Tuples of (full_node_id, scope_key, node_dict) for each node
        """
        # top-level
        for node in self.workflow.get("nodes", []):
            full_node_id = str(node.get("id"))
            scope_key = ""
            yield full_node_id, scope_key, node
            # subgraph instance
            ntype = node.get("type")
            sg_def = self._subgraph_defs.get(ntype)
            if sg_def is not None:
                instance_path = full_node_id
                for item in self._emit_subgraph_instance(sg_def, instance_path):
                    yield item

    def _build_indexes(self):
        """
        Build internal indexes for efficient node and link lookup.

        Populates the list of all workflow nodes (including nested subgraphs)
        and builds the link-to-node mapping for traversing connections.
        """
        self._all_workflow_nodes = []
        self._link_to_node_map.clear()
        for full_node_id, scope_key, node in self._iter_all_workflow_nodes():
            self._all_workflow_nodes.append((full_node_id, scope_key, node))
            self._register_links(scope_key, node, full_node_id)

    @staticmethod
    def _parent_scope_of(full_id: str) -> str:
        """
        Extract the parent scope from a fully qualified node ID.

        For example, "5:9:12" returns "5:9", and "12" returns "".

        Args:
            full_id: A fully qualified node ID (potentially with colons)

        Returns:
            The parent scope path, or empty string if at top level
        """
        parts = full_id.split(":")
        return ":".join(parts[:-1]) if len(parts) > 1 else ""

    @staticmethod
    def _normalize_any_id(value: Any) -> str:
        """
        Normalize various ID formats to a consistent string representation.

        Handles IDs that may be strings, integers, or arrays containing an ID.

        Args:
            value: The ID value in any supported format

        Returns:
            Normalized string representation of the ID
        """
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        if isinstance(value, int):
            return str(value)
        return value if isinstance(value, str) else ""

    @staticmethod
    def _match_full_id(candidate_full_id: str, requested_id: str) -> bool:
        """
        Check if a candidate node ID matches a requested ID pattern.

        If the requested ID contains colons, requires exact match.
        Otherwise, matches if the candidate equals the ID or ends with it.

        Args:
            candidate_full_id: The full node ID to test
            requested_id: The ID pattern to match against

        Returns:
            True if the IDs match according to the matching rules
        """
        if ":" in requested_id:
            return candidate_full_id == requested_id
        return candidate_full_id == requested_id or candidate_full_id.endswith(f":{requested_id}")

    def _resolve_scope_from_unique_id(self, unique_id: str) -> Optional[str]:
        """
        Resolve the scope/path context for a node given its unique ID.

        If the unique_id is fully qualified (contains colons), extracts the parent scope.
        Otherwise, searches the prompt for matching nodes. Raises an error if ambiguous.

        Args:
            unique_id: The unique node ID (may be simple or fully qualified)

        Returns:
            The scope path for the node, or None if not found

        Raises:
            ValueError: If the unique_id matches multiple nodes (ambiguous)
        """
        if ":" in unique_id:
            return self._parent_scope_of(unique_id)
        suffix = f":{unique_id}"
        matches = [k for k in self.prompt.keys() if isinstance(k, str) and k.endswith(suffix)]
        matches = list(dict.fromkeys(matches))
        if len(matches) == 1:
            return self._parent_scope_of(matches[0])
        elif len(matches) == 0:
            return None
        else:
            raise ValueError(
                f"Ambiguous unique_id '{unique_id}'. Multiple subgraph instances match. "
                f"Use a fully qualified id like 'parentPath:{unique_id}' (e.g., '5:9:{unique_id}')."
            )

    def findWorkflowNodeFullId(self, *, id: Any = None, node_title: str = "", any_input: Any = None, unique_id: Any = None, current_node: Optional[Any] = None) -> str:
        """
        Find the fully qualified ID of a workflow node using various search criteria.

        Can search by node title, node ID, or by following an 'any_input' link
        from a node. Supports both simple and fully qualified IDs
        for nodes in nested subgraphs.

        Args:
            id: The node ID to search for (can be string or int)
            node_title: The title of the node to search for
            any_input: When used with unique_id and current_node, follows the link from the current node
            unique_id: The unique ID of the current node for link traversal
            current_node: The current node object or node type string (required when using any_input)

        Returns:
            The fully qualified node ID (e.g., "5:9:12" for nested nodes)

        Raises:
            ValueError: If no matching node is found or if the ID is ambiguous
        """
        id_str = self._normalize_any_id(id)
        unique_id_str = self._normalize_any_id(unique_id)

        # Extract node type from current_node when traversing any_input links
        node_type = None
        if any_input is not None and current_node is not None:
            if isinstance(current_node, str):
                node_type = current_node
            else:
                # Assume current_node is an object with a get method (dict-like or has __getitem__)
                try:
                    node_type = current_node.get("type") if hasattr(current_node, 'get') else current_node["type"]
                except (KeyError, TypeError, AttributeError):
                    raise ValueError("current_node must be a string (node type) or an object with a 'type' field when using any_input")
            if not node_type:
                raise ValueError("current_node must have a non-empty 'type' field when using any_input")

        # by title
        if node_title:
            for full_node_id, _, node in self._all_workflow_nodes:
                if "title" in node and node.get("title") == node_title:
                    return full_node_id
                if "title" in node and node.get("title") == node_title:
                    return full_node_id

            for full_node_id, prompt_node in self.prompt.items():
                meta_dict = prompt_node.get("_meta", {}) if isinstance(prompt_node, dict) else {}
                if meta_dict.get("title") == node_title:
                    return full_node_id

            any_input = None
        # by id
        if id_str not in ("", "0"):
            matches = [fid for fid, _, _ in self._all_workflow_nodes if self._match_full_id(fid, id_str)]
            if len(matches) > 1 and ":" not in id_str and any(m != id_str for m in matches):
                raise ValueError(
                    f"Ambiguous id '{id_str}'. Multiple nodes match across (nested) subgraphs. "
                    f"Use a fully qualified id like '5:9:{id_str}'."
                )
            if matches:
                return matches[0]

        # by any_input and unique_id
        if any_input is not None and unique_id_str:
            if node_type is None:
                raise ValueError("current_node parameter is required when using any_input to extract node type")

            wts_full_id = None
            if ":" in unique_id_str:
                for fid, _, node in self._all_workflow_nodes:
                    if fid == unique_id_str and node.get("type") == node_type:
                        wts_full_id = fid
                        break
                if wts_full_id is None:
                    raise ValueError(f"(1) No {node_type} found for unique_id'{unique_id_str}'")
                found_scope_key = self._parent_scope_of(wts_full_id)
            else:
                found_scope_key = self._resolve_scope_from_unique_id(unique_id_str)
                candidates = []
                if found_scope_key:
                    candidates.append(f"{found_scope_key}:{unique_id_str}")
                else:
                    candidates.append(unique_id_str)
                for fid, scope_key, node in self._all_workflow_nodes:
                    if node.get("type") == node_type and fid in candidates:
                        wts_full_id = fid
                        if not found_scope_key:
                            found_scope_key = self._parent_scope_of(fid)
                        break
                if wts_full_id is None:
                    raise ValueError(f"(2) No {node_type} found for unique_id '{unique_id_str}'")

            # obtain active link id from that node
            wts_node = next(node for fid, _, node in self._all_workflow_nodes if fid == wts_full_id)
            active_link_id = None
            for node_input in (wts_node.get("inputs") or []):
                if node_input.get("name") == "any_input":
                    active_link_id = node_input.get("link")
                    break
            if active_link_id is None:
                raise ValueError(f"{node_type} '{wts_full_id}' has no 'any_input' link")

            target_full_node_id = self._link_to_node_map.get((found_scope_key or "", active_link_id))
            if target_full_node_id is None:
                raise ValueError(
                    f"Could not resolve link {active_link_id} in scope '{found_scope_key}'. "
                    f"The subgraph clone’s links may not have been discovered."
                )
            return target_full_node_id

        raise ValueError("No matching node found for the given title, id, or any_input")

    def getPromptInputValue(self, node_full_id: str, widget_name: str) -> Tuple[Any]:
        """
        Get a specific input value from a prompt node.

        Retrieves the value of a named input/widget from the execution prompt.
        Returns the native type without formatting.

        Args:
            node_full_id: The fully qualified node ID
            widget_name: The name of the input/widget to retrieve

        Returns:
            Tuple containing the input value in its native type

        Raises:
            ValueError: If no prompt entry exists for the node ID
            NameError: If the specified widget is not found on the node
        """
        values = self.prompt.get(str(node_full_id))
        if not values:
            raise ValueError(f"No prompt entry found for node id: {node_full_id}")
        if "inputs" in values and widget_name in values["inputs"]:
            v = values["inputs"][widget_name]
            # Return native type without formatting; caller is responsible for string conversion/formatting
            return (v,)
        raise NameError(f"Widget not found: {node_full_id}.{widget_name}")

    def getAllPromptInputs(self, node_full_id: str) -> Tuple[Dict[str, Any]]:
        """
        Get all input values from a prompt node as a dictionary.

        Retrieves all inputs/widgets from the execution prompt for the specified node.
        Returns a shallow copy to prevent accidental mutation.

        Args:
            node_full_id: The fully qualified node ID

        Returns:
            Tuple containing a dictionary mapping input names to their values

        Raises:
            ValueError: If no prompt entry exists for the node ID
        """
        values = self.prompt.get(str(node_full_id))
        if not values:
            raise ValueError(f"No prompt entry found for node id: {node_full_id}")
        inputs = values.get("inputs") if isinstance(values, dict) else None
        if not isinstance(inputs, dict):
            return ({},)
        # Return a shallow copy to avoid accidental mutation of source prompt
        return (dict(inputs),)

    # ---- Workflow helpers (from MetadataHelper) ----
    def getWorkflowNodeById(self, node_id: Any) -> Optional[Dict[str, Any]]:
        """
        Get a top-level workflow node by its ID.

        Only searches top-level nodes, not nested subgraph nodes.

        Args:
            node_id: The node ID to search for

        Returns:
            The workflow node dictionary, or None if not found
        """
        return self._id_map_workflow.get(str(node_id))

    def getWorkflowNodesByType(self, node_type: str) -> List[Dict[str, Any]]:
        """
        Get all top-level workflow nodes of a specific type.

        Only searches top-level nodes, not nested subgraph nodes.

        Args:
            node_type: The node type to search for (e.g., "WidgetToStringOvum")

        Returns:
            List of workflow node dictionaries matching the type
        """
        return [n for n in self._nodes_workflow if n.get('type') == node_type]

    def getFirstWorkflowNodeByType(self, node_type: str) -> Optional[Dict[str, Any]]:
        """
        Get the first top-level workflow node of a specific type.

        Only searches top-level nodes, not nested subgraph nodes.

        Args:
            node_type: The node type to search for (e.g., "WidgetToStringOvum")

        Returns:
            The first matching workflow node dictionary, or None if not found
        """
        for n in self._nodes_workflow:
            if n.get('type') == node_type:
                return n
        return None

    def getWorkflowWidgetValue(self, node_id: Any, input_name: str) -> Optional[Any]:
        """
        Extract an input value from a workflow node.

        In workflow format, input values are stored in 'widgets_values' array.
        To find the correct index, we use the prompt node's inputs dictionary
        to determine the position of the input_name, then use that index
        to access the corresponding value in widgets_values. Automatically
        unwraps single-element arrays.

        Args:
            node_id: The ID of the node to query
            input_name: The name of the input parameter (e.g., "text_0")

        Returns:
            The input value if found (unwrapped from array if needed), None otherwise
        """
        # Get both workflow and prompt nodes
        workflow_node = self.getWorkflowNodeById(node_id)
        prompt_node = self.getPromptNodeByIdSimple(node_id)

        if not workflow_node or not prompt_node:
            return None

        # Get widgets_values array from workflow
        widgets_values = workflow_node.get('widgets_values')
        if not isinstance(widgets_values, list):
            return None

        # Get inputs from prompt to determine index mapping
        prompt_inputs = prompt_node.get('inputs')
        if not isinstance(prompt_inputs, dict):
            return None

        # Find the index of input_name in the prompt inputs
        input_keys = list(prompt_inputs.keys())
        try:
            input_index = input_keys.index(input_name)
        except ValueError:
            # input_name not found in prompt inputs
            return None

        # Use the index to get the corresponding value from widgets_values
        if 0 <= input_index < len(widgets_values):
            value = widgets_values[input_index]
            # Handle nested arrays (like in the example)
            if isinstance(value, list) and len(value) > 0:
                return value[0]
            return value

        return None

    # ---- Simple prompt helpers (from MetadataHelper, renamed to avoid conflicts) ----
    def getPromptNodeByIdSimple(self, node_id: Any) -> Optional[Dict[str, Any]]:
        """
        Get a prompt node by its ID (simple lookup without validation).

        Direct dictionary lookup in the prompt data.

        Args:
            node_id: The node ID to look up

        Returns:
            The prompt node dictionary, or None if not found
        """
        return self.prompt.get(str(node_id)) if isinstance(self.prompt, dict) else None

    def getPromptInputValueSimple(self, node_id: Any, input_name: str) -> Optional[Any]:
        """
        Get a specific input value from a prompt node (simple version).

        Similar to getPromptInputValue but returns None instead of raising
        exceptions when the node or input is not found.

        Args:
            node_id: The node ID to query
            input_name: The name of the input to retrieve

        Returns:
            The input value if found, None otherwise
        """
        p = self.getPromptNodeByIdSimple(node_id)
        if not p:
            return None
        inputs = p.get('inputs') if isinstance(p, dict) else None
        if not isinstance(inputs, dict):
            return None
        return inputs.get(input_name)

    def getAllPromptInputsSimple(self, node_id: Any) -> Dict[str, Any]:
        """
        Get all input values from a prompt node as a dictionary (simple version).

        Similar to getAllPromptInputs but returns an empty dict instead of
        raising exceptions when the node is not found.

        Args:
            node_id: The node ID to query

        Returns:
            Dictionary mapping input names to values, or empty dict if not found
        """
        p = self.getPromptNodeByIdSimple(node_id)
        if not p:
            return {}
        inputs = p.get('inputs') if isinstance(p, dict) else None
        return dict(inputs) if isinstance(inputs, dict) else {}

    # Convenience: stringify all inputs similar to MetadataProcessor.get_all_inputs_as_string
    def getAllPromptInputsAsString(self, node_id: Any, allowed_float_decimals: int = 2) -> str:
        """
        Get all prompt inputs formatted as a comma-separated string.

        Formats each input as "name: value" with special handling for float
        precision. Useful for logging or display purposes.

        Args:
            node_id: The node ID to query
            allowed_float_decimals: Number of decimal places for float values (default: 2)

        Returns:
            Comma-separated string of all inputs (e.g., "width: 512, height: 512")
        """
        vals = self.getAllPromptInputsSimple(node_id)
        items: List[str] = []
        for k, v in vals.items():
            if isinstance(v, float):
                items.append(f"{k}: {v:.{allowed_float_decimals}f}")
            else:
                items.append(f"{k}: {v}")
        return ', '.join(items)
