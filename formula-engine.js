/* NOVARO Formula Engine
 * Standalone, side-effect-free formula parser/evaluator.
 * No eval(), Function(), DOM access, network, or database writes.
 * Cell/range access is supplied by the caller through a resolver.
 */
(function (root) {
  "use strict";

  const FUNCTIONS = Object.freeze({
    SUM: a => flatten(a).reduce((s, v) => s + number(v), 0),
    AVERAGE: a => { const v = flatten(a).map(number); return v.length ? v.reduce((s, n) => s + n, 0) / v.length : 0; },
    MIN: a => { const v = flatten(a).map(number); return v.length ? Math.min(...v) : 0; },
    MAX: a => { const v = flatten(a).map(number); return v.length ? Math.max(...v) : 0; },
    COUNT: a => flatten(a).filter(v => v !== "" && v != null && Number.isFinite(Number(v))).length,
    COUNTA: a => flatten(a).filter(v => v !== "" && v != null).length,
    ABS: a => Math.abs(number(a[0])),
    ROUND: a => { const p = Math.max(-10, Math.min(10, Math.trunc(number(a[1] || 0)))); const f = 10 ** p; return Math.round((number(a[0]) + Number.EPSILON) * f) / f; },
    IF: a => truthy(a[0]) ? a[1] : a[2],
    AND: a => flatten(a).every(truthy),
    OR: a => flatten(a).some(truthy),
    NOT: a => !truthy(a[0]),
    CELL: () => { throw new Error("مرجع الخلية غير مهيأ"); }
  });

  function number(v) {
    if (v == null || v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error("القيمة المستخدمة في المعادلة ليست رقمًا صالحًا");
    return n;
  }
  function truthy(v) { return !(v == null || v === "" || v === false || v === 0); }
  function flatten(values) { return values.flat(Infinity); }

  function tokenize(source) {
    if (source.length > 4000) throw new Error("المعادلة أطول من الحد المسموح");
    const out = [];
    let i = 0;
    while (i < source.length) {
      const c = source[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = source.slice(i);
      const num = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (num) { out.push({ type: "number", value: Number(num[0]) }); i += num[0].length; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, value = "", closed = false;
        while (j < source.length) {
          if (source[j] === "\\" && j + 1 < source.length) {
            const escaped = source[j + 1];
            value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
            j += 2;
            continue;
          }
          if (source[j] === c) {
            if (source[j + 1] === c) { value += c; j += 2; continue; }
            closed = true;
            break;
          }
          value += source[j++];
        }
        if (!closed) throw new Error("علامة اقتباس غير مكتملة");
        out.push({ type: "string", value }); i = j + 1; continue;
      }
      const ref = rest.match(/^(?:[A-Za-z_][A-Za-z0-9_ .-]*!)?\$?[A-Za-z]{1,4}\$?\d+/);
      if (ref) { out.push({ type: "ref", value: ref[0].replace(/\$/g, "").replace(/\s*!\s*/g, "!") }); i += ref[0].length; continue; }
      const ident = rest.match(/^[A-Za-z_][A-Za-z0-9_.!]*/);
      if (ident) { out.push({ type: "ident", value: ident[0].toUpperCase() }); i += ident[0].length; continue; }
      const op = ["<=", ">=", "<>", "=", "<", ">", "+", "-", "*", "/", "^", "%", ":", ",", "(", ")"].find(x => rest.startsWith(x));
      if (op) { out.push({ type: op === "," ? "comma" : op, value: op }); i += op.length; if (out.length > 1000) throw new Error("المعادلة تحتوي على أجزاء أكثر من المسموح"); continue; }
      throw new Error("رمز غير مدعوم في المعادلة: " + c);
    }
    out.push({ type: "eof" });
    return out;
  }


  function getDependencies(formula) {
    if (typeof formula !== "string" || !formula.trim().startsWith("=")) throw new Error("المعادلة يجب أن تبدأ بعلامة =");
    const tokens = tokenize(formula.trim().slice(1));
    const refs = new Set();
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i];
      if (token.type === "ref") refs.add(token.value);
      if (token.type === "ident" && token.value === "CELL" && tokens[i + 1]?.type === "(") {
        const id = tokens[i + 2], close = tokens[i + 3];
        if (!id || id.type !== "string" || !close || close.type !== ")") throw new Error("CELL تحتاج معرّف خلية نصيًا ثابتًا");
        refs.add(id.value);
      }
    }
    return Object.freeze([...refs]);
  }

  function evaluate(formula, resolver) {
    if (typeof formula !== "string" || !formula.trim().startsWith("=")) throw new Error("المعادلة يجب أن تبدأ بعلامة =");
    if (!resolver || typeof resolver.getCell !== "function") throw new Error("مصدر قراءة الخلايا غير متاح");
    const tokens = tokenize(formula.trim().slice(1));
    if (tokens.length > 1000) throw new Error("المعادلة تحتوي على أجزاء أكثر من المسموح");
    let pos = 0;
    const peek = () => tokens[pos];
    const take = type => {
      const t = peek();
      if (type && t.type !== type) throw new Error("صياغة المعادلة غير مكتملة");
      pos++; return t;
    };
    const parsePrimary = () => {
      const t = take();
      if (t.type === "number" || t.type === "string") return { kind: "literal", value: t.value };
      if (t.type === "ref") return { kind: "ref", value: t.value };
      if (t.type === "(") { const n = parseCompare(); take(")"); return n; }
      if (t.type === "ident") {
        if (t.value === "TRUE") return { kind: "literal", value: true };
        if (t.value === "FALSE") return { kind: "literal", value: false };
        if (peek().type !== "(") throw new Error("اسم غير معروف: " + t.value);
        take("("); const args = [];
        if (peek().type !== ")") { do { args.push(parseCompare()); if (peek().type !== "comma") break; take("comma"); } while (true); }
        take(")");
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, t.value)) throw new Error("الدالة غير مدعومة: " + t.value);
        return { kind: "call", name: t.value, args };
      }
      throw new Error("جزء غير مفهوم في المعادلة");
    };
    const parseRange = () => {
      let left = parsePrimary();
      if (peek().type === ":") {
        take(":"); const right = parsePrimary();
        if (left.kind !== "ref" || right.kind !== "ref") throw new Error("نطاق الخلايا يجب أن يكون مثل A1:B5");
        left = { kind: "range", start: left.value, end: right.value };
      }
      return left;
    };
    const parseUnary = () => {
      if (peek().type === "+" || peek().type === "-") { const op = take().type; return { kind: "unary", op, value: parseUnary() }; }
      return parseRange();
    };
    const binary = (next, ops) => () => {
      let node = next();
      while (ops.includes(peek().type)) { const op = take().type; node = { kind: "binary", op, left: node, right: next() }; }
      return node;
    };
    const parsePower = () => {
      const left = parseUnary();
      if (peek().type !== "^") return left;
      take("^");
      return { kind: "binary", op: "^", left, right: parsePower() };
    };
    const parseMul = binary(parsePower, ["*", "/", "%"]);
    const parseAdd = binary(parseMul, ["+", "-"]);
    const parseCompare = binary(parseAdd, ["=", "<>", "<", ">", "<=", ">="]);
    const ast = parseCompare();
    if (peek().type !== "eof") throw new Error("يوجد نص زائد بعد المعادلة");

    const run = node => {
      if (node.kind === "literal") return node.value;
      if (node.kind === "ref") return resolver.getCell(node.value);
      if (node.kind === "range") {
        if (typeof resolver.getRange !== "function") throw new Error("قراءة نطاق الخلايا غير مفعّلة بعد");
        return resolver.getRange(node.start, node.end);
      }
      if (node.kind === "unary") { const v = number(run(node.value)); return node.op === "-" ? -v : v; }
      if (node.kind === "call") {
        if (node.name === "CELL") {
          if (node.args.length !== 1 || node.args[0].kind !== "literal" || typeof node.args[0].value !== "string") throw new Error("CELL تحتاج معرّف خلية نصيًا ثابتًا");
          if (!resolver || typeof resolver.getCellById !== "function") throw new Error("قراءة الخلايا ذات المعرّفات الثابتة غير مفعّلة بعد");
          return resolver.getCellById(node.args[0].value);
        }
        if (node.name === "IF") {
          if (node.args.length < 2 || node.args.length > 3) throw new Error("الدالة IF تحتاج شرطًا ونتيجة، ونتيجة بديلة اختيارية");
          return truthy(run(node.args[0])) ? run(node.args[1]) : (node.args.length === 3 ? run(node.args[2]) : false);
        }
        if (node.name === "NOT" && node.args.length !== 1) throw new Error("الدالة NOT تحتاج قيمة واحدة");
        if (node.name === "ABS" && node.args.length !== 1) throw new Error("الدالة ABS تحتاج قيمة واحدة");
        if (node.name === "ROUND" && (node.args.length < 1 || node.args.length > 2)) throw new Error("الدالة ROUND تحتاج قيمة وعدد منازل اختياري");
        return FUNCTIONS[node.name](node.args.map(run));
      }
      const a = run(node.left), b = run(node.right);
      switch (node.op) {
        case "+": return number(a) + number(b);
        case "-": return number(a) - number(b);
        case "*": return number(a) * number(b);
        case "/": if (number(b) === 0) throw new Error("لا يمكن القسمة على صفر"); return number(a) / number(b);
        case "%": if (number(b) === 0) throw new Error("لا يمكن القسمة على صفر"); return number(a) % number(b);
        case "^": return number(a) ** number(b);
        case "=": return a === b;
        case "<>": return a !== b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        default: throw new Error("عملية غير مدعومة");
      }
    };
    const result = run(ast);
    if (typeof result === "number" && !Number.isFinite(result)) throw new Error("نتيجة المعادلة غير صالحة");
    return result;
  }

  const api = Object.freeze({ evaluate, getDependencies, supportedFunctions: Object.keys(FUNCTIONS) });
  root.NOVAROFormulaEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
