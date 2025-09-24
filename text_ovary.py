import os
import re
import numpy as np
import matplotlib.colors as mcolors
import torch
from PIL import Image, ImageDraw, ImageFont

class TextOvary:
    """
    Overlay richly styled text onto images. Ported from sfinktah/comfyui-textoverlay
    and adapted for Ovum. Supports font selection, fill/stroke colors with opacity,
    alignment, padding, line spacing, and per-batch rendering.
    """

    NAME = "Text Ovary"
    CATEGORY = "image/text"
    DESCRIPTION = "Overlay text on images with font selection, alignment, padding and stroke. A friendly fork of TextOverlay."  # filled as requested

    _horizontal_alignments = ["left", "center", "right"]
    _vertical_alignments = ["top", "middle", "bottom"]

    def __init__(self, device="cpu"):
        self.device = device
        self._loaded_font = None
        self._full_text = None
        self._x = None
        self._y = None

    @classmethod
    def INPUT_TYPES(cls):
        file_list = cls.get_font_list()
        if not file_list:
            file_list = ("DejaVuSans.ttf",)
        return {
            "required": {
                "image": ("IMAGE",),
                "text": ("STRING", {"multiline": True, "default": "Hello"}),
                "font_size": ("INT", {"default": 32, "min": 1, "max": 9999, "step": 1}),
                "font": (file_list,),
                "fill_color_hex": ("STRING", {"default": "#FFFFFF"}),
                "stroke_color_hex": ("STRING", {"default": "#000000"}),
                "stroke_thickness": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 1.0, "step": 0.05}),
                "padding": ("INT", {"default": 16, "min": 0, "max": 128, "step": 1}),
                "horizontal_alignment": (cls._horizontal_alignments, {"default": "center"}),
                "vertical_alignment": (cls._vertical_alignments, {"default": "bottom"}),
                "x_shift": ("INT", {"default": 0, "min": -128, "max": 128, "step": 1}),
                "y_shift": ("INT", {"default": 0, "min": -128, "max": 128, "step": 1}),
                "line_spacing": ("FLOAT", {"default": 4.0, "min": 0.0, "max": 50.0, "step": 0.5}),
                "stroke_opacity": ("FLOAT", {"default": 0.4, "min": 0.0, "max": 1.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "batch_process"

    @staticmethod
    def hex_to_rgba(hex_color, opacity=1.0):
        hex_color = hex_color.lstrip("#")
        if len(hex_color) not in (3, 4, 6, 8):
            raise ValueError(f"Invalid hex color format: {hex_color}")
        if len(hex_color) in (3, 4):
            hex_color = ''.join(c * 2 for c in hex_color)
        rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        alpha = int(int(hex_color[6:8], 16) if len(hex_color) == 8 else 255 * opacity)
        return rgb + (alpha,)

    @staticmethod
    def parse_color(color_string, opacity=1.0):
        color_string = color_string.strip()
        if re.match(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$", color_string):
            return TextOvary.hex_to_rgba(color_string, opacity)
        try:
            rgba = mcolors.to_rgba(color_string)
            r, g, b, a = rgba
            a = a * opacity
            return (int(r * 255), int(g * 255), int(b * 255), int(a * 255))
        except ValueError:
            return (255, 255, 255, int(255 * opacity))

    def draw_text(self, image, text, font_size, font, fill_color_hex, stroke_color_hex, stroke_thickness, padding, horizontal_alignment, vertical_alignment, x_shift, y_shift, line_spacing, stroke_opacity, use_cache=False):
        original_mode = image.mode
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        txt = Image.new('RGBA', image.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt)

        if self._loaded_font is None or not use_cache:
            font_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "comfyui-textoverlay", "fonts", font)
            try:
                fnt = ImageFont.truetype(font_path, font_size)
            except Exception:
                try:
                    fnt = ImageFont.truetype(font, font_size)
                except Exception:
                    fnt = ImageFont.load_default()
            self._loaded_font = fnt
        else:
            fnt = self._loaded_font

        fill_color = self.parse_color(fill_color_hex, 1.0)
        stroke_color = self.parse_color(stroke_color_hex, stroke_opacity)

        lines = text.split("\n") if isinstance(text, str) else [str(text)]
        line_sizes = [draw.textbbox((0, 0), line, font=fnt) for line in lines]
        line_heights = [bbox[3] - bbox[1] for bbox in line_sizes]
        line_widths = [bbox[2] - bbox[0] for bbox in line_sizes]
        max_width = max(line_widths) if line_widths else 0
        total_height = sum(line_heights) + int(line_spacing) * (len(lines) - 1 if len(lines) > 0 else 0)

        W, H = image.size
        x_map = {"left": padding, "center": (W - max_width) // 2, "right": W - max_width - padding}
        y_map = {"top": padding, "middle": (H - total_height) // 2, "bottom": H - total_height - padding}
        x = max(0, min(W - max_width, x_map.get(horizontal_alignment, (W - max_width)//2) + x_shift))
        y = max(0, min(H - total_height, y_map.get(vertical_alignment, H - total_height - padding) + y_shift))

        cy = y
        for i, line in enumerate(lines):
            draw.text((x, cy), line, font=fnt, fill=fill_color, stroke_width=max(1, int(font_size * stroke_thickness)) if stroke_thickness > 0 else 0, stroke_fill=stroke_color)
            if i < len(lines) - 1:
                cy += line_heights[i] + int(line_spacing)

        result = Image.alpha_composite(image, txt)
        if original_mode != 'RGBA':
            result = result.convert(original_mode)
        return result

    def batch_process(self, image, text, font_size, font, fill_color_hex, stroke_color_hex, stroke_thickness, padding, horizontal_alignment, vertical_alignment, x_shift, y_shift, line_spacing, stroke_opacity):
        if len(image.shape) == 3:
            image_np = image.cpu().numpy()
            image = Image.fromarray((image_np.squeeze(0) * 255).astype(np.uint8))
            image = self.draw_text(image, text, font_size, font, fill_color_hex, stroke_color_hex, stroke_thickness, padding, horizontal_alignment, vertical_alignment, x_shift, y_shift, line_spacing, stroke_opacity)
            image_tensor_out = torch.tensor(np.array(image).astype(np.float32) / 255.0)
            image_tensor_out = torch.unsqueeze(image_tensor_out, 0)
            return (image_tensor_out,)
        else:
            image_np = image.cpu().numpy()
            images = [Image.fromarray((img * 255).astype(np.uint8)) for img in image_np]
            images_out, use_cache = [], False
            for img in images:
                img = self.draw_text(img, text, font_size, font, fill_color_hex, stroke_color_hex, stroke_thickness, padding, horizontal_alignment, vertical_alignment, x_shift, y_shift, line_spacing, stroke_opacity, use_cache)
                images_out.append(np.array(img).astype(np.float32) / 255.0)
                use_cache = True
            images_np = np.stack(images_out)
            images_tensor = torch.from_numpy(images_np)
            return (images_tensor,)

    @staticmethod
    def get_font_list():
        font_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", "comfyui-textoverlay", "fonts")
        try:
            file_list = [f for f in os.listdir(font_dir) if os.path.isfile(os.path.join(font_dir, f)) and f.lower().endswith(".ttf")]
        except Exception:
            file_list = []
        return file_list

CLAZZES = [TextOvary]
