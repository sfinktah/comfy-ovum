"""
Converts to List, Tuple, Set, or Dict.
Note that it depends on the order of the conversion
"""
from autonode import validate, node_wrapper, get_node_names_mappings, anytype
classes = []
node = node_wrapper(classes)

conversion_operators = {
    "List" : list,
    "Tuple" : tuple,
    "Set" : set,
    "Dict" : dict,
}
def create_class(type_to):
    class_name = "ConvertAny2{}".format(type_to)
    class CustomClass:
        FUNCTION = "convert"
        RETURN_TYPES = (type_to.upper(),)
        CATEGORY = "Conversion"
        custom_name = "Convert to {}".format(type_to)
        @staticmethod
        def convert(input_1, **kwargs):
            if not kwargs:
                return (conversion_operators[type_to](input_1),)
            else:
                return (conversion_operators[type_to]([input_1] + list(kwargs.values())),)

        @classmethod
        def INPUT_TYPES(cls):
            return {
            "required": {
                "input_1": (anytype, {"default": 0.0}),
            }
        }
    CustomClass.__name__ = class_name
    node(CustomClass)
    return CustomClass

for type_ in conversion_operators:
    create_class(type_)

CLASS_MAPPINGS, CLASS_NAMES = get_node_names_mappings(classes)
validate(classes)
