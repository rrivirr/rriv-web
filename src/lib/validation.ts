/**
 * rriv-api's `getNameSchema()` (`z.string().min(3).max(20).trim()`): library
 * config names, descriptions and version notes, and saved snapshot names.
 */
export const NAME_MIN = 3;
export const NAME_MAX = 20;
/** Context names allow more (rriv-api's `CONTEXT_NAME_MAX`). */
export const CONTEXT_NAME_MAX = 30;

/**
 * What's wrong with a name or description, as the API would see it; `null`
 * when it's fine. Pass `optional` for fields that may be left empty.
 */
export function nameProblem(
  value: string,
  label: string,
  optional = false,
  max = NAME_MAX,
): string | null {
  const length = value.trim().length;
  if (length === 0) return optional ? null : `${label} is required.`;
  if (length < NAME_MIN || length > max) {
    return `${label} must be ${NAME_MIN}–${max} characters.`;
  }
  return null;
}
