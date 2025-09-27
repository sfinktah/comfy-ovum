import os
import json

try:
    from ..metadata.metadata_file_extractor import MetadataFileExtractor
except Exception:
    # Fallback when running this file directly
    from metadata.metadata_file_extractor import MetadataFileExtractor

def extract_metadata_from_media(media_paths):
    """
    Extracts comment metadata from the given media file(s) using MetadataFileExtractor.
    Locates JSON data within comments and parses it, decoding nested JSON strings.

    Args:
        media_paths: Either a string path to a single media file or a list of string paths

    Returns:
        If single string input: single result (dict or None)
        If list input: list of results (even if list contains only one item)
    """
    # Determine if input is a single string or list
    is_single_input = isinstance(media_paths, str)

    # Convert single string to list for uniform processing
    if is_single_input:
        paths_to_process = [media_paths]
    else:
        paths_to_process = media_paths

    results = []

    for media_path in paths_to_process:
        # Check if file exists before processing
        result = None
        if not os.path.exists(media_path):
            print(f"[ovum] media file does not exist: {media_path}")
            results.append(None)
            continue

        # Use MetadataFileExtractor to get raw data
        meta = MetadataFileExtractor.getProcessed(media_path)

        if not meta:
            print(f"[ovum] No comments found in the media file {media_path}.")
            results.append(None)
            continue

        if meta is not None:
            # First node of type ImpactWildcardProcessor
            impact_node = meta.getFirstWorkflowNodeByType('ImpactWildcardProcessor')
            populated_text_from_prompt = None
            populated_text_from_workflow = None
            if impact_node is not None:
                impact_node_id = str(impact_node.get('id'))
                try:
                    populated_text_from_prompt = meta.getPromptInputValueSimple(impact_node_id, 'populated_text')
                    populated_text_from_workflow = meta.getWorkflowWidgetValue(impact_node_id, 'populated_text')
                except Exception:
                    pass
            # All inputs of node 568 as string
            node_568_inputs_prompt = None
            node_568_inputs_workflow = None
            try:
                node_568_inputs_prompt = meta.getPromptInputValueSimple('568', 'text')
                node_568_inputs_workflow = meta.getWorkflowWidgetValue('568', 'text')
            except Exception:
                pass

            # Try to decode as JSON
            decoded_568_prompt = None
            decoded_568_workflow = None
            try:
                if node_568_inputs_prompt:
                    decoded_568_prompt = json.loads(node_568_inputs_prompt)
                if node_568_inputs_workflow:
                    decoded_568_workflow = json.loads(node_568_inputs_workflow)
            except json.JSONDecodeError:
                pass

            png_text_prompt = None
            png_text_workflow = None
            try:
                png_text_prompt = meta.getPromptInputValueSimple('102', 'text_0')
                png_text_workflow = meta.getWorkflowWidgetValue('102', 'text_0')
            except Exception:
                pass

            result = {
                'ImpactWildcardProcessor_populated_text_prompt': populated_text_from_prompt,
                'ImpactWildcardProcessor_populated_text_workflow': populated_text_from_workflow,
                'node_568_prompt': node_568_inputs_prompt,
                'node_568_workflow': node_568_inputs_workflow,
                'decoded_568_prompt': decoded_568_prompt,
                'decoded_568_workflow': decoded_568_workflow,
                'png_text_prompt': png_text_prompt,
                'png_text_workflow': png_text_workflow,
            }

        results.append(result)

    # Return single result if input was a single string, otherwise return list
    if is_single_input:
        return results[0]
    else:
        return results

def main():
    # Paths to the files
    media_paths = [
        r"c:\zluda\output\wan22\accel\emo-sarah-red-gguf_00492.mp4", r"c:\zluda\comfui-n2\output\wan22\int\lexi-aPhoto0212-gigapixel-low resolution v2-2x-faceai v2_00004.mp4",
        r"c:\zluda\output\ua\concrete-emo-lmstudio_00415_.png"
    ]

    # Process media files
    print("Extracting comments from media files...")
    media_results = extract_metadata_from_media(media_paths)
    # print(f"media results: {media_results}")
    media_results = media_results if isinstance(media_results, list) else [media_results]
    for v in media_results:
        print(f"Single media result: {json.dumps(v, indent=2)}")

if __name__ == "__main__":
    main()
