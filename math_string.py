import ast
import math
import operator
from typing import Union, Any

__all__ = ["coerce_any_to_int"]


# Allowed operators for binary and unary operations
_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,     # Will be truncated to int at the end
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_ALLOWED_NODE_TYPES = (
    (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Constant,  # Python 3.11 uses Constant for literals
        ast.Num,  # Backwards compatibility; harmless if unused
        ast.Load,
    )
    + tuple(_BIN_OPS.keys())
    + tuple(_UNARY_OPS.keys())
)

# Simple safety limits
_MAX_EXPR_LENGTH = 512
_MAX_AST_NODES = 256
_MAX_EXPONENT_ABS = 100  # Prevents extremely large pow computations
_MAX_BASE_FOR_LARGE_EXP = 10**6
_MAX_BASE_EXP_THRESHOLD = 6  # If base is big, require small exponent


def _assert_safe_tree(tree: ast.AST) -> None:
    count = 0
    for node in ast.walk(tree):
        count += 1
        if count > _MAX_AST_NODES:
            raise ValueError("Expression too complex.")
        if not isinstance(node, _ALLOWED_NODE_TYPES):
            # Disallow names, calls, attributes, comprehensions, etc.
            raise ValueError(f"Unsupported expression element: {type(node).__name__}")


def _eval_node(node: ast.AST) -> Union[int, float]:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("Only numeric literals are allowed.")

    # Compatibility with older ASTs where numbers were ast.Num
    if hasattr(ast, "Num") and isinstance(node, ast.Num):  # type: ignore[attr-defined]
        if isinstance(node.n, (int, float)):  # type: ignore[attr-defined]
            return node.n  # type: ignore[attr-defined]
        raise ValueError("Only numeric literals are allowed.")

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _UNARY_OPS:
            raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        operand = _eval_node(node.operand)
        return _UNARY_OPS[op_type](operand)

    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        op_type = type(node.op)

        if op_type not in _BIN_OPS:
            raise ValueError(f"Unsupported operator: {op_type.__name__}")

        if op_type in (ast.Div, ast.FloorDiv, ast.Mod) and right == 0:
            raise ZeroDivisionError("Division by zero.")

        # Guard extremely large exponent computations
        if op_type is ast.Pow:
            # If exponent is too large, reject
            if isinstance(right, (int, float)) and abs(right) > _MAX_EXPONENT_ABS:
                raise ValueError("Exponent too large.")
            # If base is huge, exponent must be small
            if isinstance(left, (int, float)) and abs(left) > _MAX_BASE_FOR_LARGE_EXP and isinstance(right, (int, float)) and abs(right) > _MAX_BASE_EXP_THRESHOLD:
                raise ValueError("Result too large.")

        result = _BIN_OPS[op_type](left, right)
        # For true division, ensure it's finite before returning
        if isinstance(result, float) and not math.isfinite(result):
            raise ValueError("Non-finite result.")
        return result

    raise ValueError(f"Unsupported syntax: {type(node).__name__}")


def _eval_basic_math(expr: str) -> Union[int, float]:
    expr = expr.strip()
    if not expr:
        raise ValueError("Empty expression.")
    if len(expr) > _MAX_EXPR_LENGTH:
        raise ValueError("Expression too long.")

    # Parse as an expression
    tree = ast.parse(expr, mode="eval")
    _assert_safe_tree(tree)
    return _eval_node(tree)


def coerce_any_to_int(value: Any) -> int:
    """
    Convert a value to int, with support for basic math expressions in strings.

    Supported string operations:
      - Binary: +, -, *, /, //, %, ** (with safety limits)
      - Unary: +x, -x
      - Parentheses: ( ... )
    Numbers may be integers or floats; the final result is converted via int(...)
    (i.e., truncated toward zero).
    """
    # Direct numeric cases
    if isinstance(value, (bool, int)):
        return int(value)
    if isinstance(value, float):
        return int(value)

    # String handling: direct int or basic math expression
    if isinstance(value, str):
        s = value.strip()
        # First, try plain integer conversion
        try:
            return int(s)
        except Exception:
            pass
        # Fallback to parsing a basic math expression
        try:
            result = _eval_basic_math(s)
            # Final coercion mirrors int(float) behavior where needed
            return int(result)
        except Exception as e:
            raise ValueError(f"String value '{value}' cannot be converted to int or parsed as a math expression: {e}")

    # Fallbacks for other types
    if hasattr(value, "__len__"):
        try:
            return int(len(value))
        except Exception:
            pass
    if hasattr(value, "__int__"):
        try:
            return int(value)
        except Exception:
            pass

    raise ValueError(f"Cannot convert value of type {type(value)} to int or length.")
