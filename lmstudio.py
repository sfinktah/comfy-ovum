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
    def INPUT_TYPES(s):
        # Get available models for the combo box
        available_models = s.get_available_models()

        return {'required': {
                    'input_prompt': ('STRING', {
                        'multiline': True, 
                        'default': 'Prompt Text Here', 
                        'dynamicPrompts': False,
                        'tooltip': 'The main prompt text to send to the LM Studio model. Supports wildcard syntax like {option1|option2} for random selection.'
                    }),
                    'mode': (['prompt', 'pixelwave', 'style', 'descriptor', 'character', 'custom'], {
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
                    'dynamic_loading': ('BOOLEAN', {
                        'default': False,
                        'tooltip': 'Enable automatic model loading/unloading. When enabled, the selected model will be loaded before each request and the model list will be refreshed.'
                    }),
                    'selected_model': (available_models, {
                        'default': available_models[0] if available_models else 'No models available',
                        'tooltip': 'Choose which model to use for generation. List is automatically populated from LM Studio and cached between sessions. Enable dynamic loading to automatically load the selected model.'
                    }),
                    'unload_timeout_seconds': ('INT', {
                        'default': 0, 
                        'min': 0,
                        'tooltip': 'Automatic model unload timeout in seconds. Set to 0 to disable. When > 0, the model will be automatically unloaded after this many seconds of inactivity to free up memory.'
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

    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('text',)
    FUNCTION = 'process'
    OUTPUT_NODE = True
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
    def history(cls, mode, custom_history):
        if mode == 'custom':
            # open json file that is in the custom_history path
            try:
                history = json.load(open(custom_history))
                return history
            except:
                raise Exception('Error loading custom history file')

        # Load predefined prompts from JSON file
        try:
            import os
            script_dir = os.path.dirname(os.path.abspath(__file__))
            json_path = os.path.join(script_dir, 'data', 'llm-prompts.json')

            with open(json_path, 'r', encoding='utf-8') as f:
                prompts_data = json.load(f)

            if mode in prompts_data:
                return prompts_data[mode]
            else:
                raise Exception(f'Mode "{mode}" not found in prompts data')

        except FileNotFoundError:
            raise Exception('Could not find data/llm-prompts.json file')
        except json.JSONDecodeError:
            raise Exception('Error parsing data/llm-prompts.json file')
        except Exception as e:
            raise Exception(f'Error loading prompts data: {str(e)}')

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
        """Get available models, trying cache first, then server"""
        # Try to load from cache first
        cached_models = cls.load_cached_models()

        if cached_models:
            return cached_models

        # If no cached models, try to fetch from server
        server_models = cls.fetch_models_from_server()

        if server_models:
            cls.save_cached_models(server_models)
            return server_models

        # Return default if nothing else works
        return ['No models available']

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
        """Schedule automatic model unloading after timeout"""
        with LMStudioPromptOvum._timer_lock:
            # Cancel any existing timer
            if LMStudioPromptOvum._unload_timer is not None:
                LMStudioPromptOvum._unload_timer.cancel()
                LMStudioPromptOvum._unload_timer = None

            # Only schedule if timeout > 0
            if timeout_seconds > 0:
                def auto_unload():
                    current_time = time.time()
                    # Check if enough time has passed since last request
                    if current_time - LMStudioPromptOvum._last_request_time >= timeout_seconds:
                        print(f"Auto-unloading model after {timeout_seconds} seconds of inactivity")
                        self.unload_model(server_address, server_port)
                        with LMStudioPromptOvum._timer_lock:
                            LMStudioPromptOvum._unload_timer = None

                LMStudioPromptOvum._unload_timer = threading.Timer(timeout_seconds, auto_unload)
                LMStudioPromptOvum._unload_timer.start()

    def api_request(self, prompt, server_address, server_port, seed, mode, custom_history, image=None, dynamic_loading=False, selected_model=None, unload_timeout_seconds=0):
        # check if json file in root comfy directory called oooba.json
        history = self.history(mode, custom_history)
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
        #prompt_prefix = "\\n<|user|>\\n"
        #prompt_suffix = "\\n<|assistant|>\\n"
        #prompt = prompt_prefix + prompt + prompt_suffix

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
            'model': selected_model if selected_model and selected_model != 'No models available' else None,
            'messages': history['messages'],
            #'temperature': 0.2,
            'top_p': 0.95,
            'presence_penalty': 0.0,
            'frequency_penalty': 0.0,
            #'max_tokens': 8192,
            'stream': False,
            'seed': seed,
        }
        # Handle dynamic model loading if enabled
        # if dynamic_loading and selected_model and selected_model != 'No models available':
        #     print(f"Dynamic loading enabled, loading model: {selected_model}")
        #     if not self.load_model(selected_model, server_address, server_port):
        #         print(f"Warning: Failed to load model {selected_model}, proceeding with current model")

        # Update last request time for automatic unloading
        LMStudioPromptOvum._last_request_time = time.time()

        HOST = f'{server_address}:{server_port}'
        URI = f'http://{HOST}/v1/chat/completions'

        try:
            response = requests.post(URI, json=request, timeout=180)
        except requests.exceptions.ConnectionError:
            # Schedule automatic unloading after timeout seconds following error if timeout is set
            if unload_timeout_seconds > 0:
                def delayed_schedule():
                    time.sleep(unload_timeout_seconds)
                    self.schedule_automatic_unload(server_address, server_port, unload_timeout_seconds)
                threading.Thread(target=delayed_schedule, daemon=True).start()
            raise Exception('Are you running LM Studio with server running?')

        # Schedule automatic unloading after timeout seconds following response if timeout is set
        if unload_timeout_seconds > 0:
            def delayed_schedule():
                time.sleep(unload_timeout_seconds)
                self.schedule_automatic_unload(server_address, server_port, unload_timeout_seconds)
            threading.Thread(target=delayed_schedule, daemon=True).start()

        if response.status_code == 200:
            # response is in openai format
            result = response.json()['choices'][0]['message']['content']
            result = html.unescape(result)  # decode URL encoded special characters
            return result
        else:
            return 'Error'

    def process(self, input_prompt, mode, custom_history, server_address, server_port, dynamic_loading, selected_model, unload_timeout_seconds, seed, image=None, prompt=None, unique_id=None, extra_pnginfo=None):
        # Refresh model list if dynamic loading is enabled
        if dynamic_loading:
            server_models = self.fetch_models_from_server(server_address, server_port)
            if server_models:
                self.save_cached_models(server_models)

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
        result = self.api_request(input_prompt, server_address, server_port, seed, mode, custom_history, image, dynamic_loading, selected_model, unload_timeout_seconds)
        prompt.get(str(unique_id))['inputs']['output_text'] = result
        return (result,)
CLAZZES = [LMStudioPromptOvum]
