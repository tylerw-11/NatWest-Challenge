/** Route browser requests through Next.js so session cookies stay same-origin. */
export function engineUrl(path: string): string {
  return `/engine${path.startsWith("/") ? path : `/${path}`}`;
}
