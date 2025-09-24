import os
import json
from typing import Any, Dict, List, Optional, Union
from PIL import Image

try:
    from pymediainfo import MediaInfo
    PYMEDIAINFO_AVAILABLE = True
except ImportError:
    PYMEDIAINFO_AVAILABLE = False
    MediaInfo = None

from .metadata_processor import MetadataProcessor


class MetadataFileExtractor:
    """
    Extracts raw prompt and workflow data from media files (PNG, video, etc.)
    and provides factory methods for creating MetadataProcessor instances.
    """

    def __init__(self, filename: Optional[str] = None):
        """
        Initialize MetadataFileExtractor, optionally with a filename.
        If filename is provided and contains both workflow and prompt data,
        creates a MetadataProcessor instance accessible via the processor property.

        Args:
            filename: Optional path to a media file
        """
        self.filename = filename
        self._processor: Optional[MetadataProcessor] = None

        if filename:
            try:
                data = self.extract_both(filename)
                workflow = data.get('workflow')
                prompt = data.get('prompt')

                if isinstance(workflow, dict) and isinstance(prompt, dict):
                    self._processor = MetadataProcessor(workflow, prompt)
            except Exception:
                pass  # Failed to create processor, _processor remains None

    @property
    def processor(self) -> Optional[MetadataProcessor]:
        """Returns the MetadataProcessor instance if available."""
        return self._processor

    @staticmethod
    def extract_workflow(filename: str) -> Optional[Dict[str, Any]]:
        """
        Extract workflow data from a media file.

        Args:
            filename: Path to the media file

        Returns:
            Workflow data as a dictionary, or None if not found
        """
        data = MetadataFileExtractor.extract_both(filename)
        return data.get('workflow') if data else None

    @staticmethod
    def extract_prompt(filename: str) -> Optional[Dict[str, Any]]:
        """
        Extract prompt data from a media file.

        Args:
            filename: Path to the media file

        Returns:
            Prompt data as a dictionary, or None if not found
        """
        data = MetadataFileExtractor.extract_both(filename)
        return data.get('prompt') if data else None

    @staticmethod
    def extract_both(filename: str) -> Dict[str, Any]:
        """
        Extract both workflow and prompt data from a media file.

        Args:
            filename: Path to the media file

        Returns:
            Dictionary containing 'workflow' and 'prompt' keys, or empty dict if extraction fails
        """
        if not os.path.exists(filename):
            return {}

        # Try PNG extraction first
        if filename.lower().endswith('.png'):
            return MetadataFileExtractor._extract_from_png(filename)

        # Try media file extraction
        if PYMEDIAINFO_AVAILABLE:
            return MetadataFileExtractor._extract_from_media(filename)

        return {}

    @staticmethod
    def _extract_from_png(filename: str) -> Dict[str, Any]:
        """Extract metadata from PNG file using Pillow."""
        try:
            image = Image.open(filename)
            metadata = image.info

            prompt = metadata.get('prompt')
            workflow = metadata.get('workflow')

            # Parse JSON strings if they are valid JSON
            if prompt and isinstance(prompt, str):
                try:
                    prompt = json.loads(prompt)
                except (json.JSONDecodeError, TypeError):
                    pass

            if workflow and isinstance(workflow, str):
                try:
                    workflow = json.loads(workflow)
                except (json.JSONDecodeError, TypeError):
                    pass

            return {
                'prompt': prompt,
                'workflow': workflow
            }
        except Exception:
            return {}

    @staticmethod
    def _extract_from_media(filename: str) -> Dict[str, Any]:
        """Extract metadata from media file using pymediainfo."""
        if not PYMEDIAINFO_AVAILABLE:
            return {}

        try:
            media_info = MediaInfo.parse(filename)

            for track in media_info.tracks:
                if track.track_type == "General" and track.comment:
                    comment = track.comment

                    # Look for JSON data starting with {"prompt" or {"workflow"
                    json_start = -1
                    if '{"prompt"' in comment:
                        json_start = comment.find('{"prompt"')
                    elif '{"workflow"' in comment:
                        json_start = comment.find('{"workflow"')

                    if json_start != -1:
                        json_data = comment[json_start:]
                        try:
                            parsed_data = json.loads(json_data)

                            # Check if prompt or workflow values are JSON strings and decode them
                            if 'prompt' in parsed_data and isinstance(parsed_data['prompt'], str):
                                try:
                                    parsed_data['prompt'] = json.loads(parsed_data['prompt'])
                                except (json.JSONDecodeError, TypeError):
                                    pass

                            if 'workflow' in parsed_data and isinstance(parsed_data['workflow'], str):
                                try:
                                    parsed_data['workflow'] = json.loads(parsed_data['workflow'])
                                except (json.JSONDecodeError, TypeError):
                                    pass

                            return {
                                'prompt': parsed_data.get('prompt'),
                                'workflow': parsed_data.get('workflow')
                            }
                        except json.JSONDecodeError:
                            pass

            return {}
        except Exception:
            return {}

    @staticmethod
    def getProcessed(filenames: Union[str, List[str]]) -> Union[MetadataProcessor, List[MetadataProcessor], None]:
        """
        Factory method to create MetadataProcessor instances from filename(s).

        Args:
            filenames: Either a single filename string or a list of filename strings

        Returns:
            If single string input: MetadataProcessor instance or None if creation failed
            If list input: List of MetadataProcessor instances (None for failed creations)
        """
        is_single_input = isinstance(filenames, str)

        if is_single_input:
            extractor = MetadataFileExtractor(filenames)
            return extractor.processor
        else:
            processors = []
            for filename in filenames:
                extractor = MetadataFileExtractor(filename)
                processors.append(extractor.processor)
            return processors
