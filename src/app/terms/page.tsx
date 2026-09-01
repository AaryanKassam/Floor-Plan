export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <a href="/" className="text-sm underline">Back to floor plan</a>
      <h1 className="display mb-6 mt-4 text-3xl">Terms of Service</h1>
      <div className="space-y-4 text-[var(--ink-muted)]">
        <p>
          This software is provided as is, without warranty of any kind. It is a
          reservation tool for a single venue and makes no guarantee of availability,
          uptime, or data durability.
        </p>
        <p>
          Reservations recorded here are held in a local database. Cancelling or
          modifying a booking in this tool does not notify the guest. Confirming a
          reservation with the guest remains the venue&apos;s responsibility.
        </p>
        <p>
          You are responsible for the floor plan images you upload and for having the
          right to use them.
        </p>
        <p>
          Operators may change or remove features at any time. Continued use after a
          change constitutes acceptance of it.
        </p>
      </div>
    </main>
  );
}
