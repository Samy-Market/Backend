const SECRET = /password|hash|token|secret/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '••••' : redact(v)]));
  }
  return value;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const pick = (o: unknown, ...paths: string[][]): string | null => {
  for (const path of paths) {
    let cur: unknown = o;
    for (const key of path) cur = isObj(cur) ? cur[key] : undefined;
    if (typeof cur === 'string' && cur) return cur;
  }
  return null;
};

export function describeTarget(before: unknown, after: unknown): string | null {
  for (const v of [after, before]) {
    const name = pick(v, ['fullName'], ['name'], ['email'], ['employee', 'fullName'], ['user', 'email']);
    if (name) return name;
  }
  return null;
}
