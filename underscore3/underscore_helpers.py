def is_iterable(obj):
    """Check if object is iterable but not a string or bytes."""
    try:
        iter(obj)
        return not isinstance(obj, (str, bytes))
    except TypeError:
        return False

def to_list_recursive(obj):
    """Recursively convert nested iterables to lists."""
    if isinstance(obj, (str, bytes)):
        return obj
    elif is_iterable(obj):
        return [to_list_recursive(item) for item in obj]
    else:
        return obj

def asList(obj):
    """Convert anything that can be converted into a list, into a list.

    - If obj is already a list, return it as-is
    - If obj is iterable (but not string/bytes), convert to list
    - If obj has nested iterables, recursively convert them to lists
    - If obj is not iterable, wrap it in a list
    """
    if isinstance(obj, list):
        return obj
    elif is_iterable(obj):
        try:
            return list(obj)
        except (TypeError, ValueError):
            # Handle cases where list() conversion fails
            try:
                return [item for item in obj]
            except (TypeError, ValueError):
                return [obj]
    else:
        return [obj]

def asListRecursive(obj):
    """Convert anything to lists, including nested structures."""
    return to_list_recursive(obj) if not isinstance(obj, list) else obj

