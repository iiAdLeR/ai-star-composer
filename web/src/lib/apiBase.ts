/** Dev: Vite proxies `/api` → FastAPI. Prod: set `VITE_API_BASE` to e.g. http://127.0.0.1:8000 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE as string | undefined;
  if (raw != null && raw.trim() !== "") {
    return raw.replace(/\/$/, "");
  }
  return "/api";
}
