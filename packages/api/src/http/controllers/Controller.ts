import type { Router } from 'express';

/**
 * A controller owns a group of routes. Controllers translate HTTP into
 * service calls and back — no business rules live here.
 */
export interface Controller {
  register(router: Router): void;
}
