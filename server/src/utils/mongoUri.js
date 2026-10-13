/** Database name in a MongoDB connection string ("" when the URI has none). Never returns credentials. */
export function databaseNameFromUri(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^/?#]*@)?[^/?#]*(?:\/([^?#]*))?/.exec(uri);
  if (!m) return null;
  try {
    return m[1] ? decodeURIComponent(m[1]) : "";
  } catch {
    return m[1];
  }
}
