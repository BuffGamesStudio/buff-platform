import AdminHeader from "@/components/admin/AdminHeader";
import { listContentSources } from "@/lib/server/contentSources";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getPolicyTone(policyState: string) {
  switch (policyState) {
    case "approved_now":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "discovery_only":
      return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    case "rejected":
      return "border-red-400/30 bg-red-500/10 text-red-200";
    case "conditional_next":
    default:
      return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  }
}

export default async function AdminSourcesPage() {
  const sources = await listContentSources();
  const activeSources = sources.filter((source) => source.isActive);
  const approvedSources = sources.filter(
    (source) => source.clipIngestSuitability === "approved",
  );
  const conditionalSources = sources.filter(
    (source) => source.clipIngestSuitability === "conditional",
  );
  const autoIngestSources = sources.filter(
    (source) => source.autoIngestAllowed,
  );

  return (
    <>
      <AdminHeader
        title="Source Registry"
        description="Control which movie-source lanes are trusted for discovery, watch access, and gameplay clip ingestion."
      />

      <div className="space-y-8 p-5 sm:p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Registered sources",
              value: sources.length,
            },
            {
              label: "Active sources",
              value: activeSources.length,
            },
            {
              label: "Clip-approved now",
              value: approvedSources.length,
            },
            {
              label: "Auto-ingest enabled",
              value: autoIngestSources.length,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-white/10 bg-zinc-950 p-5"
            >
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
                {card.label}
              </p>

              <p className="mt-3 text-3xl font-black text-white">
                {card.value.toLocaleString()}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">
            <p className="text-sm font-bold uppercase tracking-[0.18em]">
              Approved now
            </p>

            <p className="mt-2 text-sm leading-7">
              These sources are acceptable for Movie Buff clip intake only when
              each title still passes item-level rights validation.
            </p>
          </div>

          <div className="rounded-3xl border border-violet-400/20 bg-violet-400/10 p-5 text-violet-100">
            <p className="text-sm font-bold uppercase tracking-[0.18em]">
              Conditional next
            </p>

            <p className="mt-2 text-sm leading-7">
              These lanes can support expansion later, but they should not be
              treated as blind auto-ingest sources for launch.
            </p>
          </div>

          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
            <p className="text-sm font-bold uppercase tracking-[0.18em]">
              Discovery only
            </p>

            <p className="mt-2 text-sm leading-7">
              Discovery-only sources can help find movies, but they do not
              establish legal clip-use rights by themselves.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4">Policy</th>
                  <th className="px-6 py-4">Clip ingest</th>
                  <th className="px-6 py-4">Watch</th>
                  <th className="px-6 py-4">Legal basis</th>
                  <th className="px-6 py-4">Trust</th>
                  <th className="px-6 py-4">Auto-ingest</th>
                  <th className="px-6 py-4">Last checked</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td className="px-6 py-5 align-top">
                      <p className="font-black text-white">
                        {source.name}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {formatLabel(source.type)}
                      </p>
                      <p className="mt-2 max-w-sm text-xs leading-6 text-zinc-400">
                        {source.baseUrl ?? "No base URL stored"}
                      </p>
                    </td>

                    <td className="px-6 py-5 align-top">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${getPolicyTone(
                          source.policyState,
                        )}`}
                      >
                        {formatLabel(source.policyState)}
                      </span>

                      {source.notes ? (
                        <p className="mt-2 max-w-xs text-xs leading-6 text-zinc-400">
                          {source.notes}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-6 py-5 align-top">
                      <p className="font-semibold text-white">
                        {formatLabel(source.clipIngestSuitability)}
                      </p>
                      <p className="mt-2 max-w-xs text-xs leading-6 text-zinc-400">
                        {source.validationRule ?? "No validation rule stored"}
                      </p>
                    </td>

                    <td className="px-6 py-5 align-top">
                      {formatLabel(source.watchSuitability)}
                    </td>

                    <td className="px-6 py-5 align-top">
                      <p className="max-w-xs text-xs leading-6 text-zinc-300">
                        {source.legalBasis}
                      </p>
                    </td>

                    <td className="px-6 py-5 align-top">
                      <p>{formatLabel(source.trustLevel)}</p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {source.country ?? "Country unset"}
                        {" • "}
                        {source.language ?? "Language unset"}
                      </p>
                    </td>

                    <td className="px-6 py-5 align-top">
                      {source.autoIngestAllowed ? "Enabled" : "Off"}
                    </td>

                    <td className="px-6 py-5 align-top text-xs leading-6 text-zinc-400">
                      <p>Checked: {formatDateTime(source.lastCheckedAt)}</p>
                      <p>
                        Success:{" "}
                        {formatDateTime(source.lastSuccessfulIngestAt)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <h2 className="text-xl font-black text-white">
            Launch policy reminders
          </h2>

          <ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-400">
            <li>
              Movie Buff should keep full-movie watch access and gameplay clip
              eligibility as related but separate decisions.
            </li>
            <li>
              Internet availability is not enough. Every gameplay candidate
              still needs item-level rights confirmation before live clip use.
            </li>
            <li>
              Auto-ingest should stay off for launch unless a source has strong
              rights metadata and a validation pipeline behind it.
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
