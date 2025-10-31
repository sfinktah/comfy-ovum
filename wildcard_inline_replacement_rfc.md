## Wildcard Prompt Generation: inline conditional replacement

### TLDR
- The problem: `The {cat|dog} sat on the {mat|hat} and {meowed|barked}`
- The solution: `The {<pet>dog|cat} sat on the {mat|hat} and (?? <pet> == 'cat' ? 'meowed' : 'growled')`

### Overview
- Various text expanders based on brace sets and alternations could be extended to bind named or numbered groups and produce multiple output branches.
- The proposed combines wildcard-style brace expansion with a compact inline conditional evaluator to generate context-aware text.

### Key concepts and similarities to regex
- Alternation: `{A|B|C}` is analogous to regex alternation `(A|B|C)`, but it directly emits each alternative as an output branch rather than matching input.
- In keeping with regex-ish syntax, named/numbered groups could be supposed like so: `{<pet>dog|cat}` or `{?P<pet>dog|cat}` (full-form).
- This would allow the use of inline conditions: `(?? …)` that could test values and emit text, akin to a replacement-time conditional in regex-based tools.

### Advanced forms and rules

#### Brace naming and whitespace
- Regex-like named groups in braces:
  - Long form: `{?P<name>alt1|alt2|…}`
  - Short form: `{?<name>alt1|alt2|…}`
  - Using `?P<name>` or `?<name>` ensures content like `<lora:…>` inside alternatives remains plain text and is not treated as a group name.
- Strict braces (no whitespace tolerance):
  - Whitespace inside {…} is significant and preserved. The processor does not normalize spaces in alternatives.
  - Examples:
    - `{?<pet>dog|cat}` -> alternatives `dog` and `cat`
    - `{ ?<pet> dog | cat }` -> alternatives ` dog ` and ` cat ` (with spaces)
- `(?? …)` expressions are whitespace-tolerant around operators and tokens.

#### Group references and branch prefix
- Use `<name>` to read the value chosen for that group in the current branch.
- Special group 0 (alias `&`): `<0>` or `&` resolve to the entire expanded text of the current branch up to the start of the current `(?? …)` expression.
  - This is useful for context-sensitive inserts, e.g., adding a style only when a certain prefix was already emitted.

#### Inline conditional evaluator
- Form: `(?? expr)` — evaluates to a string and is spliced into the output at that point for the current branch.
- Predicates and operators:
  - Equality/inequality: `==`, `!=`
  - Regex predicate: `value =~ /pattern/` (also available via `value.match(/pattern/)`)
  - Existence: `defined(<name>)` returns true if the group is bound in the current branch
  - Logical: `&&`, `||`
  - Ternary: `cond ? then : else`
- Helper functions:
  - `.match(/pattern/)` — sugar for `=~ /pattern/`
  - `.in(['a','b','c'])` — membership test
  - `map(value, {'a':'X','b':'Y'}, default='Z')` — mapping with optional default
- Strings inside `(?? …)`: use `'…'` or `"…"`; both quote styles are valid as long as you are consistent within a single literal; do not mix `'` and `"` inside the same quoted string. Backslash escapes apply. Concatenate with `+`.
  - Examples: `(?? 'meows')`, `(?? "growls")`, `(?? "prefix: " + <pet>)`, `(?? '<lora:char_' + <pet> + ':0.8>')`

#### Literal angle brackets
- Inside `(?? …)` string literals, '`<`' and '`>`' are ordinary characters, enabling tokens like `"<lora:anime_v1:1.0>"`.
- If angle brackets outside `(?? …)` could be ambiguous, prefer placing them inside a quoted `(?? '…')` literal.

#### Evaluation and error handling
- Evaluation order:
  - Expansion proceeds left-to-right per branch. Braces choose alternatives and bind groups.
  - When `(?? …)` is encountered, it evaluates with the current group bindings and the current prefix available as `&` or `<0>`.
- Undefined groups:
  - `defined(<name>)` is false when no brace bound the group in this branch.
  - Direct use of an unbound `<name>` yields an empty string in lenient mode; strict mode may treat this as an error.
- Invalid regex in `=~` or `.match` results in an evaluation error at the `(?? …)` site.

#### Operator precedence (suggested)
- Highest: function calls, `.match`/`.in`, `=~`
- Next: `==`, `!=`
- Next: `&&`, `||`
- Lowest: ternary `? :`
Use parentheses for clarity when in doubt.

#### Advanced examples

1) Mapping helper (clearer than nested ternaries)
- `{?<pet>dog|cat} (?? map(<pet>, {'cat':'meows','dog':'growls'}, default='does something') )`
  - `dog growls`
  - `cat meows`

1) Regex predicate against the capture
- `{?<pet>cat|dog} (?? <pet> =~ /(kitten|cat)/ ? 'meows' : 'growls')`
  - `cat meows`
  - `dog growls`

1) Nested capture use
- `{?<clothing>hat|mat} {?<pet>cat|dog} (?? <clothing> == 'hat' ? (<pet> == 'cat' ? 'purrs' : 'barks') : 'rests')`
  - `hat cat purrs`
  - `hat dog barks`
  - `mat cat rests`
  - `mat dog rests`

1) Guarding undefined groups
- `actor: (?? defined(<pet>) ? map(<pet>, {'cat':'meows','dog':'growls'}) : 'acts')`
  - If `<pet>` was never bound in the branch, emits `acts`.

1) Using & (or `<0>`) for context-aware inserts
- `scene: {forest|city} {?<pet>dog|cat} (?? & =~ /forest/ ? '<lora:greenish:0.7>' : '')`
  - Forest branches include the style; city branches omit it.

1) Whitespace rules: braces vs `(?? …)`
- Braces are strict:
  - `{?<pet>dog|cat}` -> `dog` or `cat`
  - `{ ?<pet> dog | cat }` -> ` dog ` or ` cat `
- `(?? …)` is tolerant:
  - `(??<pet>=='cat'?'meows':'growls')` is equivalent to `(??    <pet> == 'cat'   ?  'meows'   :   'growls'   )`

#### Concise cheat-sheet
- Inline conditional:
  - `(?? <pet> == 'cat' ? 'meows' : 'growls')`
  - `(?? <pet> == "cat" ? "meows" : "growls")`
- Membership:
  - `(?? <pet>.in(['cat','lion']) ? 'feline' : 'canine')`
- Regex test:
  - `(?? <pet> =~ /cat|kitten/ ? 'meows' : 'growls')`
- Mapping:
  - `(?? map(<pet>, {'cat':'meows','dog':'growls'}) )`
- Combined with other groups:
  - `(?? <clothing> == 'hat' && <pet> == 'cat' ? 'purrs loudly' : 'is calm')`
- Emit angle-bracket tokens:
  - `(?? '<lora:char_' + <pet> + ':0.8>')`
