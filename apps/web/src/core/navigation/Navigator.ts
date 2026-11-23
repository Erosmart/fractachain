/**
 * Page navigation for a multi-page Astro app: every route is a document, so
 * navigating is a plain browser navigation (no client router to keep in sync).
 */
export class Navigator {
  navigate(path: string): void {
    window.location.assign(path);
  }

  replace(path: string): void {
    window.location.replace(path);
  }

  /** Path + query of the current page (what `?next=` should bring the user back to). */
  currentPath(): string {
    if (typeof window === 'undefined') return '/';
    return `${window.location.pathname}${window.location.search}`;
  }

  pathname(): string {
    return typeof window === 'undefined' ? '/' : window.location.pathname;
  }

  searchParam(name: string): string | null {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get(name);
  }

  loginUrl(): string {
    return `/login?next=${encodeURIComponent(this.currentPath())}`;
  }
}
