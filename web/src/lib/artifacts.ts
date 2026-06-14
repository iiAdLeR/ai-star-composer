/** Build browser URL for `GET /artifacts/{filename}` from a server-side path. */
export function artifactUrl(apiBase: string, serverPath: string | null | undefined): string | null {
  if (serverPath == null || serverPath === "") return null;
  const parts = serverPath.split(/[/\\]/);
  const name = parts[parts.length - 1];
  if (!name) return null;
  return `${apiBase}/artifacts/${encodeURIComponent(name)}`;
}
