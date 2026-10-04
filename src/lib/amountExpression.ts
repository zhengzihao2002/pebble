/**
 * Arithmetic in amount fields: "12.5+8" -> "20.50".
 *
 * A small recursive-descent parser - NO eval, no Function(). Only digits,
 * one decimal point per number, + - * / and parentheses are accepted
 * (× ÷ and the true minus sign are mapped to them; $ , and spaces are
 * ignored). Anything else returns null.
 *
 * Every literal is read as exact integer cents from its digits, so + and -
 * are exact. * and / work on cents and the result is rounded to a whole cent
 * once, at the end.
 */

const MAX_LENGTH = 80;
const MAX_ABS_CENTS = 1e13;

function normalise(raw: string): string {
  return raw
    .replace(/[\s$,]/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[\u2212\u2013]/g, '-');
}

/** True when the text is more than a single (optionally negative) number. */
export function isAmountExpression(raw: string): boolean {
  const s = normalise(raw);
  return /[+*/()]/.test(s) || /.-/.test(s);
}

function literalCents(intPart: string, fracPart: string): number {
  const f = (fracPart + '000').slice(0, 3);
  const whole = intPart === '' ? 0 : Number(intPart);
  return whole * 100 + Number(f.slice(0, 2)) + (Number(f[2]) >= 5 ? 1 : 0);
}

class Parser {
  pos = 0;
  constructor(private readonly s: string) {}

  private peek(): string | undefined {
    return this.s[this.pos];
  }

  expr(): number {
    let v = this.term();
    for (;;) {
      const c = this.peek();
      if (c !== '+' && c !== '-') return v;
      this.pos++;
      const r = this.term();
      v = c === '+' ? v + r : v - r;
    }
  }

  private term(): number {
    let v = this.factor();
    for (;;) {
      const c = this.peek();
      if (c !== '*' && c !== '/') return v;
      this.pos++;
      const r = this.factor();
      if (c === '*') {
        v = (v * r) / 100;
      } else {
        if (r === 0) throw new Error('division by zero');
        v = (v / r) * 100;
      }
    }
  }

  private factor(): number {
    const c = this.peek();
    if (c === '-') { this.pos++; return -this.factor(); }
    if (c === '+') { this.pos++; return this.factor(); }
    if (c === '(') {
      this.pos++;
      const v = this.expr();
      if (this.peek() !== ')') throw new Error('missing )');
      this.pos++;
      return v;
    }
    const m = /^(\d*)(?:\.(\d*))?/.exec(this.s.slice(this.pos));
    if (!m || !/\d/.test(m[0])) throw new Error('expected a number');
    this.pos += m[0].length;
    return literalCents(m[1], m[2] ?? '');
  }
}

/**
 * The amount as a string with two decimals ("20.50"), or null when the text
 * is empty, incomplete, invalid, too large, or negative while negatives are
 * not allowed.
 */
export function evaluateAmount(raw: string, allowNegative = false): string | null {
  const s = normalise(raw);
  if (s === '' || s.length > MAX_LENGTH || !/^[0-9.+\-*/()]+$/.test(s)) return null;
  try {
    const parser = new Parser(s);
    const v = parser.expr();
    if (parser.pos !== s.length) return null;
    const cents = Math.round(v);
    if (!Number.isFinite(cents) || Math.abs(cents) > MAX_ABS_CENTS) return null;
    if (!allowNegative && cents < 0) return null;
    return (cents / 100).toFixed(2);
  } catch {
    return null;
  }
}
