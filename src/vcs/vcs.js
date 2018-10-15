/**
 * @param {string|number} value
 * @param {number} defaultValue
 * @return {number}
 */
export function parseInt(value, defaultValue) {
  if (value) {
    const parsedValue = Number.parseInt(String(value), 10);
    if (!(parsedValue == null)) {
      if (!Number.isNaN(parsedValue)) {
        return parsedValue;
      }
    }
  }
  return defaultValue !== undefined ? defaultValue : 0;
}
/**
 *
 * @param {string|number} value
 * @param {number} defaultValue
 * @return {number}
 */
export function parseFloat(value, defaultValue) {
  if (value) {
    const parsedValue = Number.parseFloat(String(value));
    if (!(parsedValue == null)) {
      if (!Number.isNaN(parsedValue)) {
        return parsedValue;
      }
    }
  }
  return defaultValue !== undefined ? defaultValue : 0;
}
