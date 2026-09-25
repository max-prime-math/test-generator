/** A small, bounded parser. No dynamic JavaScript evaluation. Angles are radians unless `degrees` is set. */
export type Expr =
  | { kind: "number"; value: number }
  | { kind: "x" }
  | { kind: "pi" }
  | { kind: "unary"; op: "+" | "-"; arg: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; arg: Expr };
const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: (x) => (Math.abs(Math.cos(x)) < 1e-12 ? NaN : Math.tan(x)),
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
};
export function parse(source: string): Expr {
  source = source.trim().replace(/^y\s*=\s*/, "");
  if (!source || source.length > 500)
    throw Error("Enter an expression of 1–500 characters.");
  const tokens =
    source.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z]+|[^\s]/g) ?? [];
  let pos = 0,
    depth = 0;
  const peek = () => tokens[pos];
  function expression(min = 0): Expr {
    if (++depth > 64) throw Error("Expression nesting is too deep.");
    const token = tokens[pos++];
    let left: Expr;
    if (token === "+" || token === "-")
      left = { kind: "unary", op: token, arg: expression(25) };
    else if (token === "(") {
      left = expression();
      if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
    } else if (token && /^(?:\d|\.\d)/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw Error("Number is too large.");
      left = { kind: "number", value };
    } else if (token === "x") left = { kind: "x" };
    else if (token === "pi") left = { kind: "pi" };
    else if (token && Object.hasOwn(functions, token)) {
      if (tokens[pos++] !== "(")
        throw Error(`${token} needs parentheses, e.g. ${token}(x).`);
      const arg = expression();
      if (tokens[pos++] !== ")") throw Error("Missing closing parenthesis.");
      left = { kind: "call", name: token, arg };
    } else
      throw Error(
        `Unexpected ${token ?? "end of expression"}. Use x, pi, and supported functions.`,
      );
    while (pos < tokens.length) {
      let op = peek();
      let implicit = false;
      if (op === "(" || /^(?:\d|\.|[a-zA-Z])/.test(op)) {
        op = "*";
        implicit = true;
      }
      const precedence: Record<string, number> = {
        "+": 10,
        "-": 10,
        "*": 20,
        "/": 20,
        "^": 30,
      };
      const power = precedence[op];
      if (power === undefined || power < min) break;
      if (!implicit) pos++;
      const right = expression(op === "^" ? power : power + 1);
      left = { kind: "binary", op, left, right };
    }
    depth--;
    return left;
  }
  const result = expression();
  if (pos !== tokens.length) throw Error(`Unexpected '${peek()}'.`);
  return result;
}
const trig = ["sin", "cos", "tan"];
/** A number field's value: plain numbers, or constant expressions such as 2pi/3 or
 * sqrt(2). Anything using x, or that fails to parse, is NaN. */
export function constant(text: string): number {
  if (text.trim() === "") return NaN;
  const plain = Number(text);
  if (Number.isFinite(plain)) return plain;
  try {
    const e = parse(text);
    const usesX = (n: Expr): boolean =>
      n.kind === "x" ||
      (n.kind === "unary" && usesX(n.arg)) ||
      (n.kind === "call" && usesX(n.arg)) ||
      (n.kind === "binary" && (usesX(n.left) || usesX(n.right)));
    return usesX(e) ? NaN : evaluate(e, 0);
  } catch {
    return NaN;
  }
}
export function evaluate(e: Expr, x: number, degrees = false): number {
  switch (e.kind) {
    case "number":
      return e.value;
    case "x":
      return x;
    case "pi":
      return Math.PI;
    case "unary":
      return (e.op === "-" ? -1 : 1) * evaluate(e.arg, x, degrees);
    case "call": {
      const arg = evaluate(e.arg, x, degrees);
      return functions[e.name](
        degrees && trig.includes(e.name) ? (arg * Math.PI) / 180 : arg,
      );
    }
    case "binary": {
      const a = evaluate(e.left, x, degrees),
        b = evaluate(e.right, x, degrees);
      switch (e.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return Math.pow(a, b);
      }
    }
  }
  return NaN;
}
/** PGFPlots trigonometry takes degrees, so radians need deg(...). */
export function pgf(e: Expr, degrees = false): string {
  switch (e.kind) {
    case "number":
      return String(e.value);
    case "x":
      return "x";
    case "pi":
      return "pi";
    case "unary":
      return `(${e.op}${pgf(e.arg, degrees)})`;
    case "binary":
      return `(${pgf(e.left, degrees)}${e.op}${pgf(e.right, degrees)})`;
    case "call":
      return trig.includes(e.name) && !degrees
        ? `${e.name}(deg(${pgf(e.arg, degrees)}))`
        : `${e.name}(${pgf(e.arg, degrees)})`;
  }
}
