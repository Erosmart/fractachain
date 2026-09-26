'use client';

export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 rounded-2xl bg-black text-white text-sm shadow-xl">
      {message}
    </div>
  );
}
