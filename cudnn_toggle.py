import torch

class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __ne__(self, __value: object) -> bool:
        return False

anyType = AnyType("*")

class CUDNNToggleOvum:
    NAME = "CUDNN Toggle Ovum"
    DESCRIPTION = """
    Toggle torch.backends.cudnn.enabled ON or OFF. 
    torch.backends.cudnn.benchmark will be set to the same value.
    To preserve the original state of cudnn, connnect the *prev_cudnn* output of the disabling node, to the *enable_cudnn* input of the enabling node.
    To ensure correct behavior, connect the *any_input* input and *any_output* output of the node to intercept an *IMAGE* or *LATENT* immediately before and after the node you wish to disable cudnn for.
    
    The most common use case is to disable cudnn for VAE Decode and VAE Encode nodes, which can receive up to 2x speedup when running under ZLUDA emulation.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "any_input": (anyType, {}),
            },
            "required": {
                "enable_cudnn": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = (anyType, "BOOLEAN")
    RETURN_NAMES = ("any_output", "prev_cudnn")
    FUNCTION = "toggle"
    CATEGORY = "ovum"

    def toggle(self, enable_cudnn, any_input=None):
        prev_cudnn = torch.backends.cudnn.enabled
        prev_benchmark = torch.backends.cudnn.benchmark
        torch.backends.cudnn.enabled = enable_cudnn
        torch.backends.cudnn.benchmark = enable_cudnn
        if enable_cudnn != prev_cudnn:
            print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.enabled set to {enable_cudnn} (was {prev_cudnn})")
        else:
            print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.enabled still set to {enable_cudnn}")

        if enable_cudnn != prev_benchmark:
            print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.benchmark set to {enable_cudnn} (was {prev_benchmark})")
        else:
            print(f"[OVUM_CDDN_TOGGLE] torch.backends.cudnn.benchmark still set to {enable_cudnn}")

        return_tuple = (any_input, prev_cudnn)
        return return_tuple

CLAZZES = [CUDNNToggleOvum]
