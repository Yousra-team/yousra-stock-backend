/**
 * Drops keys whose value is `undefined`. Needed because `exactOptionalPropertyTypes`
 * distinguishes "key absent" from "key present but `undefined`", and a zod
 * `.partial()` schema's inferred type carries the latter — the ORM's update
 * input wants the former. Used on every PATCH service function before calling
 * `.update(...)`.
 */
export function omitUndefined<T extends object>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const result = {} as { [K in keyof T]?: Exclude<T[K], undefined> };
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value as Exclude<T[keyof T], undefined>;
    }
  }
  return result;
}
