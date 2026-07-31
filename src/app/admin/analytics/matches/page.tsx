import AdminHeader from "@/components/admin/AdminHeader";
import { getMovieBuffMatchAnalytics } from "@/lib/server/movieBuffAnalyticsAdmin";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminMatchAnalyticsPage() {
  const analytics =
    await getMovieBuffMatchAnalytics(250);

  return (
    <>
      <AdminHeader
        title="Match Analytics"
        description="Inspect recent room activity, event volume, and live gameplay flow."
      />

      <div className="space-y-6 p-5 sm:p-8">
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">
              Event counts
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {analytics.eventCounts.map((entry) => (
                <div
                  key={entry.eventType}
                  className="rounded-2xl border border-white/10 bg-black/40 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                    {entry.eventType}
                  </p>

                  <p className="mt-2 text-2xl font-black text-white">
                    {entry.count}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">
              Recent room summaries
            </h2>

            <div className="mt-4 space-y-3">
              {analytics.roomSummaries.map((room) => (
                <div
                  key={room.roomId}
                  className="rounded-2xl border border-white/10 bg-black/40 p-4"
                >
                  <p className="text-sm font-black text-white">
                    Room {room.roomId.slice(0, 8)}
                  </p>

                  <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                    <p>Total events: {room.totalEvents}</p>
                    <p>Rounds started: {room.roundsStarted}</p>
                    <p>Clips started: {room.clipsStarted}</p>
                    <p>Answers submitted: {room.answersSubmitted}</p>
                    <p>Failures: {room.failures}</p>
                    <p>Latest: {formatDateTime(room.latestAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-xl font-black text-white">
              Recent event stream
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1000px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">When</th>
                  <th className="px-6 py-4">Event</th>
                  <th className="px-6 py-4">Room</th>
                  <th className="px-6 py-4">Match</th>
                  <th className="px-6 py-4">Round</th>
                  <th className="px-6 py-4">Payload</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {analytics.recentEvents.map((eventRow) => (
                  <tr key={eventRow.id}>
                    <td className="px-6 py-4 text-zinc-400">
                      {formatDateTime(eventRow.occurred_at)}
                    </td>
                    <td className="px-6 py-4 font-black text-white">
                      {eventRow.event_type}
                    </td>
                    <td className="px-6 py-4">
                      {eventRow.room_id
                        ? eventRow.room_id.slice(0, 8)
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      {eventRow.match_id
                        ? eventRow.match_id.slice(0, 8)
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      {eventRow.round_id
                        ? eventRow.round_id.slice(0, 8)
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-400">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(
                          eventRow.payload ?? {},
                          null,
                          2
                        )}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
