/** Transient confirmation in the corner (above the phone tab bar). */
export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-4 z-50 max-w-sm animate-fade-up rounded-2xl bg-navy px-4 py-3 text-sm text-navy-ink shadow-lift sm:right-6 lg:bottom-6"
    >
      {message}
    </div>
  );
}
