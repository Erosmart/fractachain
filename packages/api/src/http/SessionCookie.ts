import type { Request, Response } from 'express';

export interface SessionCookieOptions {
  name: string;
  secure: boolean;
}

/**
 * The browser session lives in an `HttpOnly; SameSite=Strict` cookie: script
 * on the page (an XSS) can no longer read it, and other sites cannot make the
 * browser send it. Bearer tokens keep working for non-browser clients.
 */
export class SessionCookie {
  constructor(private readonly options: SessionCookieOptions) {}

  set(res: Response, token: string, expiresAt: string): void {
    const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    res.cookie(this.options.name, token, {
      httpOnly: true,
      secure: this.options.secure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
  }

  clear(res: Response): void {
    res.clearCookie(this.options.name, {
      httpOnly: true,
      secure: this.options.secure,
      sameSite: 'strict',
      path: '/',
    });
  }

  read(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() === this.options.name) {
        const value = part.slice(eq + 1).trim();
        try {
          return decodeURIComponent(value) || undefined;
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }
}
