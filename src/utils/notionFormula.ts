import type {
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  RollupFunction,
  WorkspacePage,
} from '../types/workspace';
import { getPrimaryColumn } from './columnOrder';

export type FormulaValue = string | number | boolean | null | FormulaValue[];

export interface FormulaEvalResult {
  value: CellValue;
  error?: string;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'bracket'; value: '[' | ']' }
  | { type: 'comma' }
  | { type: 'question' }
  | { type: 'colon' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Chaînes "..." ou '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let out = '';
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          const next = expr[i + 1];
          if (next === 'n') out += '\n';
          else if (next === 't') out += '\t';
          else out += next;
          i += 2;
        } else {
          out += expr[i];
          i++;
        }
      }
      if (i >= expr.length) {
        throw new Error('Chaîne non fermée');
      }
      i++;
      tokens.push({ type: 'string', value: out });
      continue;
    }

    // Nombres
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] ?? ''))) {
      let numStr = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Nombre invalide : ${numStr}`);
      }
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    // Opérateurs doubles
    const two = expr.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }

    // Opérateurs simples et ponctuation
    if (['+', '-', '*', '/', '%', '^', '>', '<', '!', '='].includes(ch)) {
      tokens.push({ type: 'op', value: ch === '=' ? '==' : ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (ch === '[' || ch === ']') {
      tokens.push({ type: 'bracket', value: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ type: 'question' });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon' });
      i++;
      continue;
    }

    // Identifiants (fonctions, mots-clés and/or/not/true/false/null)
    if (/[a-zA-Z_À-ÿ]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_À-ÿ]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      const lower = ident.toLowerCase();
      if (lower === 'and') {
        tokens.push({ type: 'op', value: '&&' });
      } else if (lower === 'or') {
        tokens.push({ type: 'op', value: '||' });
      } else if (lower === 'not') {
        tokens.push({ type: 'op', value: '!' });
      } else {
        tokens.push({ type: 'ident', value: ident });
      }
      continue;
    }

    throw new Error(`Caractère inattendu : ${ch}`);
  }

  return tokens;
}

type AstNode =
  | { kind: 'literal'; value: FormulaValue }
  | { kind: 'array'; items: AstNode[] }
  | { kind: 'unary'; op: string; arg: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'ternary'; cond: AstNode; whenTrue: AstNode; whenFalse: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] };

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  parse(): AstNode {
    const node = this.parseTernary();
    if (this.pos < this.tokens.length) {
      throw new Error('Syntaxe inattendue en fin de formule');
    }
    return node;
  }

  private parseTernary(): AstNode {
    const cond = this.parseOr();
    if (this.peek()?.type === 'question') {
      this.consume();
      const whenTrue = this.parseTernary();
      const colon = this.consume();
      if (!colon || colon.type !== 'colon') {
        throw new Error('« : » attendu après « ? »');
      }
      const whenFalse = this.parseTernary();
      return { kind: 'ternary', cond, whenTrue, whenFalse };
    }
    return cond;
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '||') {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): AstNode {
    let left = this.parseEquality();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '&&') {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): AstNode {
    let left = this.parseComparison();
    while (
      this.peek()?.type === 'op' &&
      ['==', '!='].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): AstNode {
    let left = this.parseAddSub();
    while (
      this.peek()?.type === 'op' &&
      ['>', '>=', '<', '<='].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseAddSub() };
    }
    return left;
  }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (
      this.peek()?.type === 'op' &&
      ['+', '-'].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): AstNode {
    let left = this.parsePower();
    while (
      this.peek()?.type === 'op' &&
      ['*', '/', '%'].includes((this.peek() as { value: string }).value)
    ) {
      const op = (this.consume() as { value: string }).value;
      left = { kind: 'binary', op, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): AstNode {
    const left = this.parseUnary();
    if (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '^') {
      this.consume();
      return { kind: 'binary', op: '^', left, right: this.parsePower() };
    }
    return left;
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t?.type === 'op' && ['!', '-', '+'].includes(t.value)) {
      this.consume();
      return { kind: 'unary', op: t.value, arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const t = this.peek();
    if (!t) {
      throw new Error('Formule incomplète');
    }

    if (t.type === 'number' || t.type === 'string') {
      this.consume();
      return { kind: 'literal', value: t.value };
    }

    if (t.type === 'paren' && t.value === '(') {
      this.consume();
      const inner = this.parseTernary();
      const close = this.consume();
      if (!close || close.type !== 'paren' || close.value !== ')') {
        throw new Error('Parenthèse fermante « ) » manquante');
      }
      return inner;
    }

    if (t.type === 'bracket' && t.value === '[') {
      this.consume();
      const items: AstNode[] = [];
      while (this.peek() && !(this.peek()?.type === 'bracket' && (this.peek() as { value: string }).value === ']')) {
        items.push(this.parseTernary());
        if (this.peek()?.type === 'comma') this.consume();
        else break;
      }
      const close = this.consume();
      if (!close || close.type !== 'bracket' || close.value !== ']') {
        throw new Error('Crochet fermant « ] » manquant');
      }
      return { kind: 'array', items };
    }

    if (t.type === 'ident') {
      this.consume();
      const lower = t.value.toLowerCase();
      if (this.peek()?.type === 'paren' && (this.peek() as { value: string }).value === '(') {
        this.consume();
        const args: AstNode[] = [];
        while (this.peek() && !(this.peek()?.type === 'paren' && (this.peek() as { value: string }).value === ')')) {
          args.push(this.parseTernary());
          if (this.peek()?.type === 'comma') {
            this.consume();
          } else {
            break;
          }
        }
        const close = this.consume();
        if (!close || close.type !== 'paren' || close.value !== ')') {
          throw new Error(`Parenthèse fermante manquante après ${t.value}(...)`);
        }
        return { kind: 'call', name: t.value, args };
      }

      if (lower === 'true') return { kind: 'literal', value: true };
      if (lower === 'false') return { kind: 'literal', value: false };
      if (lower === 'null') return { kind: 'literal', value: null };
      if (lower === 'pi') return { kind: 'literal', value: Math.PI };
      if (lower === 'e') return { kind: 'literal', value: Math.E };
      throw new Error(`Symbole inconnu : ${t.value} (utilisez prop("${t.value}"))`);
    }

    throw new Error('Expression invalide');
  }
}

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  if (v === null || v === '') return 0;
  const cleaned = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: FormulaValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(toStr).join(', ');
  return String(v);
}

function toBool(v: FormulaValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function isEmptyVal(v: FormulaValue): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function parseDateVal(v: FormulaValue): Date | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function flattenNumericArgs(args: FormulaValue[]): number[] {
  const nums: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      nums.push(...flattenNumericArgs(a));
    } else if (a !== null && a !== '') {
      nums.push(toNum(a));
    }
  }
  return nums;
}

export interface FormulaEvalContext {
  resolveProp: (propName: string) => FormulaValue;
}

function evalAst(node: AstNode, ctx: FormulaEvalContext): FormulaValue {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'array':
      return node.items.map((item) => evalAst(item, ctx));
    case 'unary': {
      const val = evalAst(node.arg, ctx);
      if (node.op === '!') return !toBool(val);
      if (node.op === '-') return -toNum(val);
      return toNum(val);
    }
    case 'ternary': {
      return toBool(evalAst(node.cond, ctx))
        ? evalAst(node.whenTrue, ctx)
        : evalAst(node.whenFalse, ctx);
    }
    case 'binary': {
      if (node.op === '&&') {
        const l = evalAst(node.left, ctx);
        return toBool(l) ? toBool(evalAst(node.right, ctx)) : false;
      }
      if (node.op === '||') {
        const l = evalAst(node.left, ctx);
        return toBool(l) ? true : toBool(evalAst(node.right, ctx));
      }
      const left = evalAst(node.left, ctx);
      const right = evalAst(node.right, ctx);
      switch (node.op) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') {
            return `${toStr(left)}${toStr(right)}`;
          }
          return toNum(left) + toNum(right);
        case '-':
          return toNum(left) - toNum(right);
        case '*':
          return toNum(left) * toNum(right);
        case '/': {
          const denom = toNum(right);
          if (denom === 0) throw new Error('Division par zéro');
          return toNum(left) / denom;
        }
        case '%': {
          const denom = toNum(right);
          if (denom === 0) throw new Error('Modulo par zéro');
          return toNum(left) % denom;
        }
        case '^':
          return Math.pow(toNum(left), toNum(right));
        case '==':
          return toStr(left) === toStr(right) || (typeof left === 'number' && typeof right === 'number' && left === right);
        case '!=':
          return !(toStr(left) === toStr(right) || (typeof left === 'number' && typeof right === 'number' && left === right));
        case '>':
          return typeof left === 'string' && typeof right === 'string'
            ? left > right
            : toNum(left) > toNum(right);
        case '>=':
          return typeof left === 'string' && typeof right === 'string'
            ? left >= right
            : toNum(left) >= toNum(right);
        case '<':
          return typeof left === 'string' && typeof right === 'string'
            ? left < right
            : toNum(left) < toNum(right);
        case '<=':
          return typeof left === 'string' && typeof right === 'string'
            ? left <= right
            : toNum(left) <= toNum(right);
        default:
          throw new Error(`Opérateur inconnu : ${node.op}`);
      }
    }
    case 'call': {
      const fn = node.name.toLowerCase();
      if (fn === 'prop') {
        const nameArg = node.args[0] ? toStr(evalAst(node.args[0], ctx)) : '';
        return ctx.resolveProp(nameArg);
      }
      if (fn === 'if') {
        const cond = node.args[0] ? toBool(evalAst(node.args[0], ctx)) : false;
        if (cond) return node.args[1] ? evalAst(node.args[1], ctx) : null;
        return node.args[2] ? evalAst(node.args[2], ctx) : null;
      }
      if (fn === 'and') {
        return node.args.every((a) => toBool(evalAst(a, ctx)));
      }
      if (fn === 'or') {
        return node.args.some((a) => toBool(evalAst(a, ctx)));
      }

      const args = node.args.map((a) => evalAst(a, ctx));

      switch (fn) {
        case 'not':
          return !toBool(args[0] ?? false);
        case 'empty':
          return isEmptyVal(args[0] ?? null);
        case 'length':
          return Array.isArray(args[0]) ? args[0].length : toStr(args[0]).length;
        case 'count':
          return Array.isArray(args[0]) ? args[0].length : args.filter((a) => !isEmptyVal(a)).length;
        case 'tonumber':
          return toNum(args[0] ?? 0);
        case 'format':
          return toStr(args[0] ?? '');
        case 'concat':
          return args
            .flatMap((a) => (Array.isArray(a) ? a.map(toStr) : [toStr(a)]))
            .join('');
        case 'join': {
          const sep = toStr(args[0] ?? ', ');
          const rest = args.slice(1).flatMap((a) => (Array.isArray(a) ? a.map(toStr) : [toStr(a)]));
          return rest.join(sep);
        }
        case 'contains':
          if (Array.isArray(args[0])) {
            const needle = toStr(args[1] ?? '');
            return args[0].some((x) => toStr(x) === needle);
          }
          return toStr(args[0]).includes(toStr(args[1] ?? ''));
        case 'includes':
          if (Array.isArray(args[0])) {
            const needle = toStr(args[1] ?? '');
            return args[0].some((x) => toStr(x) === needle);
          }
          return toStr(args[0]).includes(toStr(args[1] ?? ''));
        case 'startswith':
          return toStr(args[0]).startsWith(toStr(args[1] ?? ''));
        case 'endswith':
          return toStr(args[0]).endsWith(toStr(args[1] ?? ''));
        case 'replace':
          return toStr(args[0]).replace(toStr(args[1] ?? ''), toStr(args[2] ?? ''));
        case 'replaceall':
          return toStr(args[0]).split(toStr(args[1] ?? '')).join(toStr(args[2] ?? ''));
        case 'lower':
          return toStr(args[0]).toLowerCase();
        case 'upper':
          return toStr(args[0]).toUpperCase();
        case 'trim':
          return toStr(args[0]).trim();
        case 'slice':
        case 'substring':
          return toStr(args[0]).slice(
            toNum(args[1] ?? 0),
            args[2] !== undefined ? toNum(args[2]) : undefined
          );
        case 'split':
          return toStr(args[0]).split(toStr(args[1] ?? ','));
        case 'abs':
          return Math.abs(toNum(args[0] ?? 0));
        case 'round': {
          const dec = args[1] !== undefined ? Math.max(0, Math.min(10, Math.floor(toNum(args[1])))) : 0;
          const factor = Math.pow(10, dec);
          return Math.round(toNum(args[0] ?? 0) * factor) / factor;
        }
        case 'floor':
          return Math.floor(toNum(args[0] ?? 0));
        case 'ceil':
          return Math.ceil(toNum(args[0] ?? 0));
        case 'sqrt':
          return Math.sqrt(Math.max(0, toNum(args[0] ?? 0)));
        case 'pow':
          return Math.pow(toNum(args[0] ?? 0), toNum(args[1] ?? 1));
        case 'mod': {
          const d = toNum(args[1] ?? 1);
          if (d === 0) throw new Error('Modulo par zéro');
          return toNum(args[0] ?? 0) % d;
        }
        case 'min': {
          const nums = flattenNumericArgs(args);
          return nums.length > 0 ? Math.min(...nums) : 0;
        }
        case 'max': {
          const nums = flattenNumericArgs(args);
          return nums.length > 0 ? Math.max(...nums) : 0;
        }
        case 'sum': {
          const nums = flattenNumericArgs(args);
          return nums.reduce((acc, n) => acc + n, 0);
        }
        case 'avg': {
          const nums = flattenNumericArgs(args);
          return nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : 0;
        }
        case 'first':
          return Array.isArray(args[0]) ? (args[0][0] ?? null) : null;
        case 'last':
          return Array.isArray(args[0]) ? (args[0][args[0].length - 1] ?? null) : null;
        case 'at':
          return Array.isArray(args[0]) ? (args[0][Math.floor(toNum(args[1] ?? 0))] ?? null) : null;
        case 'unique':
          return Array.isArray(args[0]) ? Array.from(new Set(args[0].map(toStr))) : [];
        case 'now':
        case 'today':
          return formatDateIso(new Date());
        case 'parsedate': {
          const d = parseDateVal(args[0] ?? null);
          return d ? formatDateIso(d) : '';
        }
        case 'formatdate': {
          const d = parseDateVal(args[0] ?? null);
          if (!d) return '';
          const fmt = toStr(args[1] ?? 'YYYY-MM-DD');
          const yyyy = String(d.getFullYear());
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return fmt.replace(/YYYY/g, yyyy).replace(/MM/g, mm).replace(/DD/g, dd);
        }
        case 'year': {
          const d = parseDateVal(args[0] ?? null);
          return d ? d.getFullYear() : 0;
        }
        case 'month': {
          const d = parseDateVal(args[0] ?? null);
          return d ? d.getMonth() + 1 : 0;
        }
        case 'date': {
          const d = parseDateVal(args[0] ?? null);
          return d ? d.getDate() : 0;
        }
        case 'day': {
          const d = parseDateVal(args[0] ?? null);
          return d ? d.getDay() : 0;
        }
        case 'datebetween': {
          const d1 = parseDateVal(args[0] ?? null);
          const d2 = parseDateVal(args[1] ?? null);
          if (!d1 || !d2) return 0;
          const unit = toStr(args[2] ?? 'days').toLowerCase();
          const diffMs = d1.getTime() - d2.getTime();
          if (unit.startsWith('year')) return Math.round((diffMs / (86400000 * 365.25)) * 100) / 100;
          if (unit.startsWith('month')) return Math.round((diffMs / (86400000 * 30.4375)) * 100) / 100;
          if (unit.startsWith('week')) return Math.round(diffMs / (86400000 * 7));
          if (unit.startsWith('hour')) return Math.round(diffMs / 3600000);
          if (unit.startsWith('min')) return Math.round(diffMs / 60000);
          return Math.round(diffMs / 86400000);
        }
        case 'dateadd':
        case 'datesubtract': {
          const d = parseDateVal(args[0] ?? null);
          if (!d) return '';
          const rawAmount = toNum(args[1] ?? 0);
          const amount = fn === 'datesubtract' ? -rawAmount : rawAmount;
          const unit = toStr(args[2] ?? 'days').toLowerCase();
          const out = new Date(d.getTime());
          if (unit.startsWith('year')) out.setFullYear(out.getFullYear() + amount);
          else if (unit.startsWith('month')) out.setMonth(out.getMonth() + amount);
          else if (unit.startsWith('week')) out.setDate(out.getDate() + amount * 7);
          else out.setDate(out.getDate() + amount);
          return formatDateIso(out);
        }
        default:
          throw new Error(`Fonction inconnue : ${node.name}`);
      }
    }
  }
}

function normalizeFormulaResult(val: FormulaValue): CellValue {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.map(toStr);
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return Math.round(val * 1000000) / 1000000;
  }
  return val;
}

export function evaluateFormula(
  expression: string,
  ctx: FormulaEvalContext
): FormulaEvalResult {
  const trimmed = expression.trim();
  if (!trimmed) return { value: '' };
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return { value: '' };
    const ast = new Parser(tokens).parse();
    const raw = evalAst(ast, ctx);
    return { value: normalizeFormulaResult(raw) };
  } catch (err) {
    return {
      value: '',
      error: err instanceof Error ? err.message : 'Erreur de formule',
    };
  }
}

export function computeRollupValue(
  col: DatabaseColumn,
  row: DatabaseRow,
  columns: DatabaseColumn[],
  rowsByPage: Record<string, DatabaseRow[]>,
  pagesById: Map<string, WorkspacePage>
): CellValue {
  const relCol = columns.find((c) => c.id === col.rollupRelationColId && c.type === 'relation');
  if (!relCol || !relCol.relationTargetPageId) return col.rollupFn === 'values' ? [] : 0;

  const rawLinked = row.cells[relCol.id];
  const linkedIds = Array.isArray(rawLinked)
    ? rawLinked
    : typeof rawLinked === 'string' && rawLinked
      ? [rawLinked]
      : [];

  const targetPage = pagesById.get(relCol.relationTargetPageId);
  const targetRows = rowsByPage[relCol.relationTargetPageId] ?? [];
  const targetRowMap = new Map(targetRows.map((r) => [r.id, r]));
  const matchedRows = linkedIds
    .map((id) => targetRowMap.get(id))
    .filter((r): r is DatabaseRow => Boolean(r));

  const fn: RollupFunction = col.rollupFn ?? 'count';
  if (fn === 'count') {
    return matchedRows.length;
  }

  const targetColId =
    col.rollupTargetColId || targetPage?.columns?.[0]?.id || '';
  if (!targetColId) return 0;

  const targetCol = targetPage?.columns?.find((c) => c.id === targetColId);
  const values = matchedRows.map((r) => {
    if (targetCol && (targetCol.type === 'formula' || targetCol.type === 'rollup') && targetPage) {
      return computeSingleCell(targetCol, r, targetPage.columns ?? [], rowsByPage, pagesById, new Set()).value;
    }
    return r.cells[targetColId];
  });

  if (fn === 'checked_count') {
    return values.filter((v) => v === true || String(v).toLowerCase() === 'true').length;
  }

  if (fn === 'values') {
    const out: string[] = [];
    for (const v of values) {
      if (Array.isArray(v)) out.push(...v.map(String));
      else if (v !== undefined && v !== null && v !== '') out.push(String(v));
    }
    return Array.from(new Set(out));
  }

  const nums = values
    .filter((v) => v !== undefined && v !== null && v !== '' && typeof v !== 'boolean')
    .map((v) => Number(String(v).replace(/\s/g, '').replace(',', '.')))
    .filter((n) => Number.isFinite(n));

  if (nums.length === 0) return 0;
  if (fn === 'sum') return Math.round(nums.reduce((a, b) => a + b, 0) * 1000000) / 1000000;
  if (fn === 'avg') return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  if (fn === 'min') return Math.min(...nums);
  if (fn === 'max') return Math.max(...nums);
  return 0;
}

function computeSingleCell(
  col: DatabaseColumn,
  row: DatabaseRow,
  columns: DatabaseColumn[],
  rowsByPage: Record<string, DatabaseRow[]>,
  pagesById: Map<string, WorkspacePage>,
  visitedCols: Set<string>
): FormulaEvalResult {
  if (visitedCols.has(col.id)) {
    return { value: '', error: 'Référence circulaire' };
  }

  if (col.type === 'rollup') {
    return {
      value: computeRollupValue(col, row, columns, rowsByPage, pagesById),
    };
  }

  if (col.type === 'formula') {
    const nextVisited = new Set(visitedCols);
    nextVisited.add(col.id);
    const expr = col.formulaExpression ?? '';
    return evaluateFormula(expr, {
      resolveProp: (propName: string): FormulaValue => {
        const clean = propName.trim().toLowerCase();
        const targetCol =
          columns.find((c) => c.name === propName) ??
          columns.find((c) => c.name.trim().toLowerCase() === clean) ??
          columns.find((c) => c.id === propName);
        if (!targetCol) return null;

        if (targetCol.type === 'formula' || targetCol.type === 'rollup') {
          const sub = computeSingleCell(targetCol, row, columns, rowsByPage, pagesById, nextVisited);
          if (sub.error) throw new Error(sub.error);
          return Array.isArray(sub.value) ? [...sub.value] : (sub.value ?? null);
        }

        const raw = row.cells[targetCol.id];
        if (targetCol.type === 'relation') {
          const ids = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
          if (!targetCol.relationTargetPageId) return ids;
          const relPage = pagesById.get(targetCol.relationTargetPageId);
          const relPrimaryColId = relPage?.columns?.[0]?.id;
          const relRows = rowsByPage[targetCol.relationTargetPageId] ?? [];
          const relRowMap = new Map(relRows.map((r) => [r.id, r]));
          return ids.map((id) => {
            const targetRow = relRowMap.get(id);
            if (!targetRow) return id;
            return relPrimaryColId ? String(targetRow.cells[relPrimaryColId] ?? id) : id;
          });
        }

        if (raw === undefined) return targetCol.type === 'number' ? 0 : targetCol.type === 'checkbox' ? false : '';
        return Array.isArray(raw) ? [...raw] : raw;
      },
    });
  }

  const raw = row.cells[col.id];
  return { value: raw ?? '' };
}

export function getComputedRowCells(
  page: WorkspacePage,
  row: DatabaseRow,
  allPages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): { cells: Record<string, CellValue>; errors: Record<string, string> } {
  const columns = page.columns ?? [];
  const pagesById = new Map(allPages.map((p) => [p.id, p]));
  const cells: Record<string, CellValue> = { ...row.cells };
  const errors: Record<string, string> = {};

  for (const col of columns) {
    if (col.type === 'formula' || col.type === 'rollup') {
      const res = computeSingleCell(col, row, columns, rowsByPage, pagesById, new Set());
      cells[col.id] = res.value;
      if (res.error) errors[col.id] = res.error;
    }
  }

  return { cells, errors };
}

export function formatCellText(
  col: DatabaseColumn,
  val: CellValue | undefined,
  allPages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): string {
  if (val === undefined || val === null) return '';
  if (col.type === 'relation' && col.relationTargetPageId) {
    const ids = Array.isArray(val) ? val : typeof val === 'string' && val ? [val] : [];
    const targetPage = allPages.find((p) => p.id === col.relationTargetPageId);
    const primaryColId = targetPage?.columns ? getPrimaryColumn(targetPage.columns)?.id : undefined;
    const targetRows = rowsByPage[col.relationTargetPageId] ?? [];
    const rowMap = new Map(targetRows.map((r) => [r.id, r]));
    return ids
      .map((id) => {
        const target = rowMap.get(id);
        return target && primaryColId ? String(target.cells[primaryColId] ?? id) : id;
      })
      .join(', ');
  }
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'boolean') return val ? 'Oui' : 'Non';
  return String(val);
}
