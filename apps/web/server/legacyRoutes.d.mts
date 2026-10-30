import type { IncomingMessage, ServerResponse } from 'node:http';

export const MOVED_ROUTES: Record<string, string>;
export function legacyRedirect(pathAndQuery: string): string | null;
export function legacyRedirectMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void;
