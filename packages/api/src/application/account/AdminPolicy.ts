/**
 * Who is an administrator. Admin rights come from configuration
 * (`ADMIN_EMAILS`), never from anything a client can send.
 */
export class AdminPolicy {
  private readonly emails: ReadonlySet<string>;

  constructor(adminEmails: readonly string[]) {
    this.emails = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  }

  isAdminEmail(email?: string | null): boolean {
    return Boolean(email && this.emails.has(email.trim().toLowerCase()));
  }

  adminEmails(): string[] {
    return [...this.emails];
  }
}
