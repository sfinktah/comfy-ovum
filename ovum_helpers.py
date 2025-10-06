import logging
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS

logger = logging.getLogger(__name__)


def resolve_effective_list(wrapped_input, prompt, my_unique_id, input_name="any", logger=logger):
    """
    Given an INPUT_IS_LIST-wrapped input, decide whether it's:
    - a batch (outer wrapper is the list of items), or
    - a single upstream list wrapped once by Comfy (inner item is the list).

    Returns (effective_list, is_batch, meta_dict)
    """
    workflow_graph = None
    this_node_id = None
    source_node_id = None
    source_node_output_slot = None
    source_node_class_name = None

    # Unwrap prompt and unique id if they are lists
    try:
        workflow_graph = prompt[0]
    except Exception:
        workflow_graph = prompt
    try:
        uid = my_unique_id[0]
    except Exception:
        uid = my_unique_id
    try:
        this_node_id = str(uid).rpartition(".")[-1] if uid is not None else None
    except Exception:
        this_node_id = None

    source_output_is_list = False
    if workflow_graph and this_node_id and 'inputs' in workflow_graph.get(this_node_id, {}):
        try:
            source_node_id, source_node_output_slot = workflow_graph[this_node_id]['inputs'][input_name]
            source_node_class_name = workflow_graph[source_node_id]['class_type']
            source_node_class = ALL_NODE_CLASS_MAPPINGS[source_node_class_name]
            if hasattr(source_node_class, 'OUTPUT_IS_LIST'):
                oisl = source_node_class.OUTPUT_IS_LIST
                try:
                    source_output_is_list = bool(oisl[source_node_output_slot])
                except Exception:
                    source_output_is_list = False
        except Exception as e:
            logger.debug(f"[ovum] resolve_effective_list: failed to inspect upstream for input '{input_name}': {e}")

    # Determine whether to treat the outer wrapper as the list (batch) or unwrap one level
    is_batch = False
    try:
        outer_len = len(wrapped_input)
    except Exception:
        outer_len = 1

    if source_output_is_list or (outer_len > 1):
        is_batch = True
        effective = wrapped_input
        # Optional extra logging for ambiguous cases
        if source_output_is_list and outer_len > 1:
            try:
                inner_lens = []
                for elem in wrapped_input:
                    try:
                        inner_lens.append(len(elem))
                    except Exception:
                        inner_lens.append("n/a")
                logger.warning(
                    f"[ovum] resolve_effective_list({this_node_id}): source_output_is_list=True AND wrapper has multiple items. "
                    f"Dimensions -> outer len: {outer_len}; inner lens: {inner_lens}. "
                    f"source_node_id={source_node_id}, slot={source_node_output_slot}, class={source_node_class_name}"
                )
            except Exception as _e:
                logger.debug(f"[ovum] resolve_effective_list: could not compute inner dimensions: {_e}")
    else:
        effective = wrapped_input[0]

    meta = {
        "this_node_id": this_node_id,
        "source_output_is_list": source_output_is_list,
        "source_node_id": source_node_id,
        "source_node_output_slot": source_node_output_slot,
        "source_node_class_name": source_node_class_name,
    }
    return effective, is_batch, meta
