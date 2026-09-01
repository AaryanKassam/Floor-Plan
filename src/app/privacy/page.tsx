export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <a href="/" className="text-sm underline">Back to floor plan</a>
      <h1 className="display mb-6 mt-4 text-3xl">Privacy</h1>
      <div className="space-y-4 text-[var(--ink-muted)]">
        <p>
          <strong className="text-[var(--ink)]">What is stored.</strong> Guest name,
          party size, date, time, and optional phone number, in a SQLite file on the
          machine running this app. Nothing else is collected.
        </p>
        <p>
          <strong className="text-[var(--ink)]">Floor plan images.</strong> Images you
          upload are sent once to the configured vision provider, either Google Gemini
          or Anthropic, to detect table positions. They are then stored locally. They
          are not sent anywhere else and are not sent again on later visits.
        </p>
        <p>
          <strong className="text-[var(--ink)]">Google Sheets.</strong> If a sheet
          webhook is configured, each confirmed reservation is copied to that sheet.
          Disable it by removing the webhook URL from the environment file.
        </p>
        <p>
          <strong className="text-[var(--ink)]">No third-party analytics</strong>, no
          advertising identifiers, and no cookies beyond what the framework needs to
          serve the page.
        </p>
        <p>
          <strong className="text-[var(--ink)]">Deletion.</strong> Cancelling a booking
          removes it from the local database. It does not remove the row already written
          to your Google Sheet; delete that row directly.
        </p>
      </div>
    </main>
  );
}
