class Timer:
    CATEGORY = "quicknodes"
    @classmethod    
    def INPUT_TYPES(s):
        return { "required":{
            "Run notes (for queued run)": ("STRING", {"multiline": True})
        } }
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "func"
    def func(self, **kwargs):
        return ()
    
CLAZZES = [Timer]