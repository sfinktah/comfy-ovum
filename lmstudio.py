# noinspection PyUnresolvedReferences
import folder_paths
import json
import random
import re
import html
import requests
import os
import time
import threading
import base64
from wildcard_processor import find_and_replace_wildcards, search_and_replace


# same function as oobaprompt but using the LM Studio API
class LMStudioPromptOvum:
    # Class variables for tracking unload timer
    _last_request_time = 0
    _unload_timer = None
    _timer_lock = threading.Lock()

    @classmethod
    def INPUT_TYPES(cls):
        # Get available models for the combo box
        available_models = cls.get_available_models()
        # Get available modes dynamically from JSON file
        available_modes = cls.get_available_modes()

        return {'required': {
                    'input_prompt': ('STRING', {
                        'multiline': True, 
                        'default': 'Prompt Text Here', 
                        'dynamicPrompts': False,
                        'tooltip': 'The main prompt text to send to the LM Studio model. Supports wildcard syntax like {option1|option2} for random selection.'
                    }),
                    'mode': (available_modes, {
                        'default': 'prompt',
                        'tooltip': 'Prompt processing mode:\n• prompt: Direct prompt\n• descriptor: Adds random descriptive words\n• pixelwave/style/character: Uses predefined conversation templates\n• custom: Uses custom history file'
                    }),
                    'custom_history': ('STRING', {
                        'multiline': False, 
                        'default': 'path to history.json', 
                        'dynamicPrompts': True,
                        'tooltip': 'Path to custom conversation history JSON file (only used when mode is set to "custom"). File should contain message history in OpenAI chat format.'
                    }),
                    'server_address': ('STRING', {
                        'default': 'localhost',
                        'tooltip': 'LM Studio server address (hostname or IP). Default is localhost for local installations.'
                    }),
                    'server_port': ('INT', {
                        'default': 1234, 
                        'min': 0, 
                        'max': 65535,
                        'tooltip': 'LM Studio server port number. Default is 1234 which is the standard LM Studio server port.'
                    }),
                    'selected_model': (available_models, {
                        'default': available_models[0] if available_models else 'No models available',
                        'tooltip': 'Choose which model to use for generation. List is automatically populated from LM Studio and cached between sessions. Enable dynamic loading to automatically load the selected model.'
                    }),
                    'unload_timeout_seconds': ('INT', {
                        'default': 0, 
                        'min': 0,
                        'tooltip': 'You MUST have the liquid/lfm2-1.2b model installed for this to work. Automatic model unload timeout in seconds. Set to 0 to disable. When > 0, the model will be automatically unloaded after this many seconds of inactivity to free up memory.'
                    }),
                    'seed': ('INT', {
                        'default': 0, 
                        'min': 0, 
                        'max': 0xffffffffffffffff,
                        'tooltip': 'Random seed for reproducible generation and wildcard selection. Use 0 for random seed, or set a specific number for consistent results.'
                    }),
                },
                'optional': {
                    'image': ('IMAGE', {
                        'tooltip': 'Optional image to include with the prompt. The image will be encoded and sent to the vision-capable LM Studio model along with the text prompt.'
                    }),
                },
                "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO", "prompt": "PROMPT"}}

    RETURN_TYPES = ('STRING', 'LLM_CONTEXT')
    RETURN_NAMES = ('text', 'context')
    FUNCTION = 'process'
    # OUTPUT_NODE = True
    CATEGORY = 'Ovum/LLM'
    DESCRIPTION = """
LM Studio Prompt Node with Dynamic Model Management

This node connects to LM Studio's local server to generate text using various language models. 
It supports dynamic model loading/unloading, automatic model management, and various prompt modes.

Features:
• Multiple prompt modes (prompt, pixelwave, style, descriptor, character, custom)
• Dynamic model loading and selection from available models
• Automatic model unloading after specified timeout (a hack)
• Model list caching between sessions
• Wildcard support with {option1|option2} syntax
• Custom conversation history support

Requirements:
• LM Studio running with server enabled
• Models downloaded in LM Studio
• Server accessible at specified address:port
"""

    @classmethod
    def _load_prompts_data(cls):
        """Load prompts data from JSON file with error handling and fallback"""
        try:
            import os
            script_dir = os.path.dirname(os.path.abspath(__file__))
            json_path = os.path.join(script_dir, 'data', 'llm-prompts.json')

            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)

        except FileNotFoundError:
            raise Exception('Could not find data/llm-prompts.json file')
        except json.JSONDecodeError:
            raise Exception('Error parsing data/llm-prompts.json file')
        except Exception as e:
            raise Exception(f'Error loading prompts data: {str(e)}')

    @classmethod
    def history(cls, mode, custom_history=None, get_modes_only=False):
        if get_modes_only:
            # Return available modes from JSON file
            try:
                prompts_data = cls._load_prompts_data()
                # Return the top-level keys plus 'custom'
                modes = list(prompts_data.keys()) + ['custom']
                return modes
            except Exception:
                print("[ovum-lmstudio] couldn't read from prompts data file, using hardcoded modes instead.")
                # Fallback to hardcoded modes if any error occurs
                return ['none', 'prompt', 'pixelwave', 'style', 'descriptor', 'character', 'custom']

        if mode == 'custom':
            # open json file that is in the custom_history path
            try:
                history = json.load(open(custom_history))
                return history
            except:
                raise Exception('Error loading custom history file')

        # Load predefined prompts from JSON file
        prompts_data = cls._load_prompts_data()

        if mode in prompts_data:
            return prompts_data[mode]
        else:
            raise Exception(f'Mode "{mode}" not found in prompts data')

    @classmethod
    def get_available_modes(cls):
        """Get available prompt modes from JSON file"""
        return cls.history(None, get_modes_only=True)

    @classmethod
    def get_models_file_path(cls):
        """Get the path to the models cache file"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(script_dir, 'data', 'lmstudio_models.json')

    @classmethod
    def load_cached_models(cls):
        """Load cached models from file"""
        models_file = cls.get_models_file_path()
        try:
            if os.path.exists(models_file):
                with open(models_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('models', [])
        except Exception as e:
            print(f"Error loading cached models: {e}")
        return []

    @classmethod
    def save_cached_models(cls, models):
        """Save models to cache file"""
        models_file = cls.get_models_file_path()
        try:
            # Ensure the data directory exists
            os.makedirs(os.path.dirname(models_file), exist_ok=True)

            data = {'models': models}
            with open(models_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving cached models: {e}")

    @classmethod
    def fetch_models_from_server(cls, server_address='localhost', server_port=1234):
        """Fetch available models from LM Studio server"""
        try:
            HOST = f'{server_address}:{server_port}'
            URI = f'http://{HOST}/v1/models'

            response = requests.get(URI, timeout=10)
            if response.status_code == 200:
                result = response.json()
                models = []
                if 'data' in result:
                    for model in result['data']:
                        models.append(model.get('id', 'Unknown'))
                return models
            else:
                print(f"Failed to fetch models: HTTP {response.status_code}")
        except Exception as e:
            print(f"Error fetching models from server: {e}")
        return []

    @classmethod
    def get_available_models(cls):
        """Get available models for the enum input.
        Always include the placeholder 'No models available' so validation won't break
        when the selection persists across host/port changes or empty caches.
        """
        placeholder = 'No models available'
        # Try to load from cache first
        cached_models = cls.load_cached_models()

        if cached_models:
            # Always include placeholder at the start
            # Keep order: placeholder + cached
            return [placeholder] + cached_models

        # If no cached models, try to fetch from default server
        server_models = cls.fetch_models_from_server()

        if server_models:
            cls.save_cached_models(server_models)
            return [placeholder] + server_models

        # Return default if nothing else works
        return [placeholder]

    def encode_image_to_base64(self, image):
        """Convert image tensor to base64 encoded string"""
        try:
            import numpy as np
            from PIL import Image
            import io

            # Convert tensor to numpy array and scale to 0-255
            if hasattr(image, 'cpu'):
                image_np = image.cpu().numpy()
            else:
                image_np = np.array(image)

            # Handle batch dimension if present
            if len(image_np.shape) == 4:
                image_np = image_np[0]  # Take first image from batch

            # Scale from 0-1 to 0-255 if needed
            if image_np.max() <= 1.0:
                image_np = (image_np * 255).astype(np.uint8)

            # Convert to PIL Image
            pil_image = Image.fromarray(image_np)

            # Convert to base64
            buffer = io.BytesIO()
            pil_image.save(buffer, format='PNG')
            img_str = base64.b64encode(buffer.getvalue()).decode()

            return f"data:image/png;base64,{img_str}"
        except Exception as e:
            print(f"Error encoding image: {e}")
            return None

    # def load_model(self, model_id, server_address, server_port):
    #     """Load a specific model on the LM Studio server"""
    #     try:
    #         HOST = f'{server_address}:{server_port}'
    #         URI = f'http://{HOST}/v1/models/load'
    #
    #         request_data = {'model': model_id}
    #         response = requests.post(URI, json=request_data, timeout=180)
    #
    #         if response.status_code == 200:
    #             print(f"Successfully loaded model: {model_id}")
    #             return True
    #         else:
    #             print(f"Failed to load model {model_id}: HTTP {response.status_code}")
    #             return False
    #     except Exception as e:
    #         print(f"Error loading model {model_id}: {e}")
    #         return False

    def unload_model(self, server_address, server_port):
        """Unload the currently loaded model by loading a small model instead"""
        try:
            HOST = f'{server_address}:{server_port}'
            URI = f'http://{HOST}/v1/chat/completions'

            # Send a brief request with the smallest available model to effectively "unload" the current model
            request = {
                'model': 'liquid/lfm2-1.2b',
                'messages': [{'role': 'user', 'content': 'ok'}],
                'max_tokens': 1,
                'stream': False,
            }

            response = requests.post(URI, json=request, timeout=60)

            if response.status_code == 200:
                print("Successfully switched to small model (liquid/lfm2-1.2b) to free up memory")
                return True
            else:
                print(f"Failed to switch to small model: HTTP {response.status_code}")
                return False
        except Exception as e:
            print(f"Error switching to small model: {e}")
            return False

    def schedule_automatic_unload(self, server_address, server_port, timeout_seconds):
        """Schedule automatic model unloading after a period of inactivity.
        The timer counts from the last completed request. If new activity occurs
        before the timer elapses, it will be rescheduled to ensure the timeout
        does not begin until all context queries complete."""
        with LMStudioPromptOvum._timer_lock:
            # Cancel any existing timer
            if LMStudioPromptOvum._unload_timer is not None:
                LMStudioPromptOvum._unload_timer.cancel()
                LMStudioPromptOvum._unload_timer = None

            if timeout_seconds <= 0:
                return

            def auto_unload():
                now = time.time()
                elapsed = now - LMStudioPromptOvum._last_request_time
                if elapsed >= timeout_seconds:
                    print(f"Auto-unloading model after {timeout_seconds} seconds of inactivity")
                    self.unload_model(server_address, server_port)
                    with LMStudioPromptOvum._timer_lock:
                        LMStudioPromptOvum._unload_timer = None
                else:
                    # Not enough idle time yet; reschedule for the remaining duration
                    remaining = max(0.01, timeout_seconds - elapsed)
                    with LMStudioPromptOvum._timer_lock:
                        LMStudioPromptOvum._unload_timer = threading.Timer(remaining, auto_unload)
                        LMStudioPromptOvum._unload_timer.start()

            # Start the first check based on the timeout (will reschedule if needed)
            LMStudioPromptOvum._unload_timer = threading.Timer(timeout_seconds, auto_unload)
            LMStudioPromptOvum._unload_timer.start()

    def api_request(self, prompt, server_address, server_port, seed, mode, custom_history, image=None, selected_model=None, unload_timeout_seconds=0, existing_history=None):
        # Prepare history: use existing if provided (for context chaining), otherwise load based on mode
        history = existing_history if existing_history is not None else self.history(mode, custom_history)
        if mode == 'prompt':
            prompt = f'{prompt}'
        if mode == 'descriptor':
            # use seed to add a bit more randomness to the prompt
            spice = ['a', 'the', 'this', 'that',
                     'an exotic', 'an interesting', 'a colorful', 'a vibrant', 'get creative!', 'think outside the box!', 'a rare',
                     'a standard', 'a typical', 'a common', 'a normal', 'a regular', 'a usual', 'an ordinary',
                     'a unique', 'a one of a kind', 'a special', 'a distinctive', 'a peculiar', 'a remarkable', 'a noteworthy',
                     'popular in the victorian era', 'popular in the 1920s', 'popular in the 1950s', 'popular in the 1980s',
                     'popular in the 1990s', 'popular in the 2000s', 'popular in the 2010s', 'popular in the 2020s',
                     'popular in asia', 'popular in europe', 'popular in north america', 'popular in south america',
                     'popular in africa', 'popular in australia', 'popular in the middle east', 'popular in the pacific islands',
                     'popular with young people', 'popular with the elderly', 'trending on social media', 'popular on tiktok',
                     'trending on pinterest', 'popular on instagram', 'popular on facebook', 'popular on twitter',
                     'popular on reddit', 'popular on youtube', 'popular on tumblr', 'popular on snapchat',
                     'popular on linkedin', 'popular on twitch', 'popular on discord',
                     'unusual example of', 'a classic', 'an underrated', 'an innovative','a historical', 'a modern', 'a contemporary',
                     'a futuristic', 'a traditional', 'an eco-friendly', 'a controversial', 'a political', 'a religious',
                     'a spiritual', 'a philosophical', 'a scientific']
            random.seed(seed)
            prompt = f'{random.choice(spice)} {prompt}'
        """
        example curl request to LM Studio
        curl http://localhost:1234/v1/chat/completions \
        -H "Content-Type: application/json" \
        -d '{
        "messages": [
            { "role": "system", "content": "Always answer in rhymes." },
            { "role": "user", "content": "Introduce yourself." }
        ],
        "temperature": 0.7,
        "max_tokens": -1,
        "stream": false
        }'
        """
        # Create user message content
        if image is not None:
            # Encode image to base64
            encoded_image = self.encode_image_to_base64(image)
            if encoded_image:
                # Format message with image for vision models
                message_content = [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": encoded_image}}
                ]
            else:
                # Fallback to text-only if image encoding failed
                message_content = prompt
        else:
            message_content = prompt

        history['messages'].append({'role': 'user', 'content': message_content})
        request = {
            'messages': history['messages'],
            #'temperature': 0.2,
            'top_p': 0.95,
            'presence_penalty': 0.0,
            'frequency_penalty': 0.0,
            #'max_tokens': 8192,
            'stream': False,
            'seed': seed,
        }
        # Only include model field if a concrete model is selected
        if selected_model and selected_model != 'No models available':
            request['model'] = selected_model

        HOST = f'{server_address}:{server_port}'
        URI = f'http://{HOST}/v1/chat/completions'

        # Mark activity at the start to delay any existing auto-unload timer
        LMStudioPromptOvum._last_request_time = time.time()
        try:
            response = requests.post(URI, json=request, timeout=180)
        except requests.exceptions.ConnectionError:
            raise Exception('Are you running LM Studio with server running?')

        if response.status_code == 200:
            # response is in openai format
            result = response.json()['choices'][0]['message']['content']
            result = html.unescape(result)  # decode URL encoded special characters
            # Append assistant reply to history for continuity
            history['messages'].append({'role': 'assistant', 'content': result})
            # Mark completion time and (re)schedule unload from now so it starts after this request completes
            LMStudioPromptOvum._last_request_time = time.time()
            if unload_timeout_seconds > 0:
                self.schedule_automatic_unload(server_address, server_port, unload_timeout_seconds)
            return result, history
        else:
            # On API error, attempt to refresh the models list from the current server
            try:
                latest_models = self.fetch_models_from_server(server_address, server_port)
                if latest_models:
                    self.save_cached_models(latest_models)
            except Exception:
                pass
            # Even on error, mark activity and (re)schedule unload if configured
            LMStudioPromptOvum._last_request_time = time.time()
            if unload_timeout_seconds > 0:
                self.schedule_automatic_unload(server_address, server_port, unload_timeout_seconds)
            return 'Error', history

    def process(self, input_prompt, mode, custom_history, server_address, server_port, selected_model, unload_timeout_seconds, seed, image=None, prompt=None, unique_id=None, extra_pnginfo=None):
        # Always refresh models from the currently selected server (host:port)
        server_models = self.fetch_models_from_server(server_address, server_port)
        if server_models:
            # Update cache so the enum list updates on next UI refresh
            self.save_cached_models(server_models)
        else:
            # If we couldn't reach the server, keep server_models as empty list
            server_models = []

        # If user changed host/port or after an error, do NOT auto-select the first model.
        # Instead, refresh the cache and ask the user to pick a valid model explicitly.
        placeholder = 'No models available'
        if (selected_model in (None, '', placeholder)) or (server_models and selected_model not in server_models):
            # Cache was refreshed above if possible; raise to inform the user.
            hostport = f"{server_address}:{server_port}"
            raise Exception(
                f"LM Studio models list has been refreshed from {hostport}. "
                f"Please select a valid model from the 'selected_model' dropdown before running again."
            )

        # If automatic unload is requested, ensure the tiny model exists to fake unloading
        if unload_timeout_seconds and unload_timeout_seconds != 0:
            required_model = 'liquid/lfm2-1.2b'
            if server_models and (required_model not in server_models):
                raise Exception(
                    "Automatic unload requires the 'liquid/lfm2-1.2b' model to be installed in LM Studio to fake unloading. "
                    "In developer settings, JIT Model Loading and Auto unload JIT models should be enabled with 1 minute TTL."
                )

        # search and replace
        input_prompt = find_and_replace_wildcards(input_prompt, seed, debug=True)
        input_prompt = search_and_replace(input_prompt, extra_pnginfo, prompt)
        # wildcard sytax is {like|this}
        # select a random word from the | separated list
        wc_re = re.compile(r'{([^}]+)}')
        def repl(m):
            return random.choice(m.group(1).split('|'))
        for m in wc_re.finditer(input_prompt):
            input_prompt = input_prompt.replace(m.group(0), repl(m))
        text, history = self.api_request(input_prompt, server_address, server_port, seed, mode, custom_history, image, selected_model, unload_timeout_seconds)
        # Build context object to propagate through the graph
        context = {
            'server_address': server_address,
            'server_port': server_port,
            'selected_model': selected_model,
            'unload_timeout_seconds': unload_timeout_seconds,
            'seed': seed,
            'mode': mode,
            'custom_history': custom_history,
            'history': history,
        }
        if prompt is not None and unique_id is not None:
            try:
                prompt.get(str(unique_id))['inputs']['output_text'] = text
            except Exception:
                pass
        return (text, context)

class LMStudioPromptChainOvum(LMStudioPromptOvum):
    @classmethod
    def INPUT_TYPES(cls):
        available_modes = cls.get_available_modes()
        # Add a special option to use the incoming context's mode
        available_modes_with_context = ['use_context'] + available_modes
        return {
            'required': {
                'context': ('LLM_CONTEXT', {'tooltip': 'LLM context from LMStudioPromptOvum or previous chain node'}),
                'input_prompt': ('STRING', {
                    'multiline': True,
                    'default': 'Next prompt here',
                    'dynamicPrompts': False,
                    'tooltip': 'Additional prompt to ask within the same chat context.'
                }),
                'mode': (available_modes_with_context, {
                    'default': 'use_context',
                    'tooltip': 'Prompt mode for this step. Choose "use_context" to reuse the mode from the incoming context.'
                }),
            },
            'optional': {},
            'hidden': {}
        }

    RETURN_TYPES = ('LLM_CONTEXT','STRING')
    RETURN_NAMES = ('context','text')
    FUNCTION = 'process'
    OUTPUT_NODE = False
    CATEGORY = 'Ovum/LLM'

    def process(self, context, input_prompt, mode):
        # Extract settings from context
        server_address = context.get('server_address', 'localhost')
        server_port = context.get('server_port', 1234)
        selected_model = context.get('selected_model')
        unload_timeout_seconds = context.get('unload_timeout_seconds', 0)
        seed = context.get('seed', 0)
        base_mode = context.get('mode', 'prompt')
        custom_history = context.get('custom_history', None)
        existing_history = context.get('history')
        # Determine mode to use
        mode_to_use = base_mode if mode == 'use_context' else mode
        # If the user chose a new mode, start a fresh history so the new system prompt applies
        history_to_use = existing_history if mode == 'use_context' else None
        # Wildcards replacement similar to base node
        input_prompt = find_and_replace_wildcards(input_prompt, seed, debug=True)
        # Execute request, optionally reusing existing history to maintain context
        text, updated_history = self.api_request(
            input_prompt,
            server_address,
            server_port,
            seed,
            mode_to_use,
            custom_history,
            image=None,
            selected_model=selected_model,
            unload_timeout_seconds=unload_timeout_seconds,
            existing_history=history_to_use,
        )
        # Update and return context
        new_context = dict(context)
        new_context['history'] = updated_history
        new_context['mode'] = mode_to_use
        return (new_context, text)

CLAZZES = [LMStudioPromptOvum, LMStudioPromptChainOvum]
