import logging
from typing import Any, Dict, Optional, Tuple

from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS

logger = logging.getLogger(__name__)


def _is_sequence_like(x: Any) -> bool:
    """
    Detects containers we consider as potential comfy-wrapped list containers:
    - Must be indexable and have a length
    - Excludes text/byte primitives (str, bytes, bytearray)
    """
    try:
        if isinstance(x, (str, bytes, bytearray)):
            return False
        # Must support len and indexing to be considered a wrapped-list container
        len(x)  # noqa: B018 (intentional truthiness via exceptions)
        x[0]
        return True
    except Exception:
        return False


def resolve_effective_value(wrapped_value: Any, source_output_is_sequence: bool = False) -> Tuple[Any, bool]:
    """
    Generic unwrapping helper that decides whether to treat the outer wrapper as a comfy-wrapped list
    or to unwrap a single item. Works with any indexable container (e.g., list, tuple,
    numpy arrays).
    Returns (effective_value, is_comfy_wrapped_list).
    """
    # Treat non-sequence-like values (including str/bytes) as primitives
    if not _is_sequence_like(wrapped_value):
        return wrapped_value, False

    is_comfy_wrapped_list = False
    try:
        outer_len = len(wrapped_value)
    except Exception:
        outer_len = 1

    if source_output_is_sequence or (outer_len > 1):
        is_comfy_wrapped_list = True
        effective = wrapped_value
    else:
        effective = wrapped_value[0]

    return effective, is_comfy_wrapped_list

def _inspect_upstream(
    _prompt: Any,
    my_unique_id: Any,
    input_name: str,
    *,
    context_label: str,
    logger: logging.Logger,
) -> Dict[str, Optional[Any]]:
    """
    Internal helper to inspect upstream node metadata and whether the source output is a list.
    Returns a dict with keys:
      - this_node_id, source_output_is_list, source_node_id, source_node_output_slot, source_node_class_name
    """
    prompt = None
    this_node_id: Optional[str] = None
    source_node_id: Optional[str] = None
    source_node_output_slot: Optional[int] = None
    source_node_class_name: Optional[str] = None

    # Unwrap prompt and unique id if they are lists
    try:
        prompt = _prompt[0]
    except Exception:
        prompt = _prompt
    try:
        uid = my_unique_id[0]
    except Exception:
        uid = my_unique_id
    try:
        this_node_id = str(uid).rpartition(".")[-1] if uid is not None else None
    except Exception:
        this_node_id = None

    source_output_is_list = False
    try:
        if prompt and this_node_id and "inputs" in prompt.get(this_node_id, {}):
            source_node_id, source_node_output_slot = prompt[this_node_id]["inputs"][input_name]
            source_node_class_name = prompt[source_node_id]["class_type"]
            source_node_class = ALL_NODE_CLASS_MAPPINGS[source_node_class_name]
            if hasattr(source_node_class, "OUTPUT_IS_LIST"):
                oisl = source_node_class.OUTPUT_IS_LIST
                try:
                    source_output_is_list = bool(oisl[source_node_output_slot])
                except Exception:
                    source_output_is_list = False
    except Exception as e:
        logger.debug(f"[ovum] {context_label}: failed to inspect upstream for input '{input_name}': {e}")

    return {
        "this_node_id": this_node_id,
        "source_output_is_list": source_output_is_list,
        "source_node_id": source_node_id,
        "source_node_output_slot": source_node_output_slot,
        "source_node_class_name": source_node_class_name,
    }


def resolve_effective_list(
    wrapped_input: Any,
    prompt: Any,
    my_unique_id: Any,
    input_name: str = "any",
    logger: logging.Logger = logger,
):
    """
    Given an INPUT_IS_LIST-wrapped input, decide whether it's:
    - a comfy-wrapped list (outer wrapper is the Comfy list-of-items), or
    - a single upstream py_list wrapped once by Comfy (inner item is the py_list).

    Returns (effective_list, is_comfy_wrapped_list, meta_dict)
    """
    meta = _inspect_upstream(
        prompt,
        my_unique_id,
        input_name,
        context_label="resolve_effective_list",
        logger=logger,
    )
    this_node_id = meta["this_node_id"]
    source_output_is_list = bool(meta["source_output_is_list"])
    source_node_id = meta["source_node_id"]
    source_node_output_slot = meta["source_node_output_slot"]
    source_node_class_name = meta["source_node_class_name"]

    # Determine whether to treat the outer wrapper as the Comfy list-of-items (wrapped list)
    # or unwrap one level to pass through a single py_list
    try:
        outer_len = len(wrapped_input)
    except Exception:
        outer_len = 1

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
                f"[ovum] resolve_effective_list({this_node_id}): source_output_is_list=True AND comfy-wrapped list has multiple elements. "
                f"Dimensions -> outer len: {outer_len}; inner lens: {inner_lens}. "
                f"source_node_id={source_node_id}, slot={source_node_output_slot}, class={source_node_class_name}"
            )
        except Exception as _e:
            logger.debug(f"[ovum] resolve_effective_list: could not compute inner dimensions: {_e}")

    # Use the generic resolver to decide effective value and wrapped-list flag
    effective, is_comfy_wrapped_list = resolve_effective_value(
        wrapped_input, source_output_is_sequence=source_output_is_list
    )

    return effective, is_comfy_wrapped_list, {
        "this_node_id": this_node_id,
        "source_output_is_list": source_output_is_list,
        "source_node_id": source_node_id,
        "source_node_output_slot": source_node_output_slot,
        "source_node_class_name": source_node_class_name,
    }


def resolve_possible_wrapped_input(
    wrapped_input: Any,
    prompt: Any,
    my_unique_id: Any,
    input_name: str = "any",
):
    """
    Interpret an INPUT_IS_LIST-wrapped input relative to the upstream type.

    - If the connected output is a comfy-wrapped list (upstream declares OUTPUT_IS_LIST), keep the outer comfy-wrapped list and
      return it as a list of items.
    - Otherwise, unwrap and return the single inner value.

    This inspects the upstream node's OUTPUT_IS_LIST for the given input connection.
    """
    meta = _inspect_upstream(
        prompt,
        my_unique_id,
        input_name,
        context_label="resolve_possible_wrapped_input",
        logger=logger,
    )
    source_output_is_list = bool(meta["source_output_is_list"])

    if source_output_is_list:
        # Keep the comfy-wrapped list as a list-of-items; assume wrapped_input is sequence-like and let errors propagate
        return list(wrapped_input)

    # Not a comfy-wrapped list upstream: unwrap and return the single inner value when possible
    try:
        return wrapped_input[0]
    except Exception as e:
        raise ValueError(f"Could not unwrap comfy-wrapped input: {e}") from e
