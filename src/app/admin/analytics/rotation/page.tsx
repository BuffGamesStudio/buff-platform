import AdminHeader from "@/components/admin/AdminHeader";
import {
  updateMovieBuffClipControlsAction,
  warmMovieBuffGlobalPoolAction,
} from "@/app/admin/analytics/actions";
import { listMovieBuffClipAdminRows } from "@/lib/server/movieBuffAnalyticsAdmin";
import { getMovieBuffGlobalPoolStatus } from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";

const statuses = [
  "active",
  "featured",
  "cooling_down",
  "retired",
  "test_only",
];

export default async function AdminRotationControlPage() {
  const [clipRows, poolStatus] = await Promise.all([
    listMovieBuffClipAdminRows(160),
    getMovieBuffGlobalPoolStatus(),
  ]);
  const rows = [...clipRows].sort((first, second) => {
    if (second.rotationWeight !== first.rotationWeight) {
      return second.rotationWeight - first.rotationWeight;
    }

    return second.totalPlays - first.totalPlays;
  });

  return (
    <>
      <AdminHeader
        title="Rotation Control"
        description="Adjust admin boost, clip status, and QA flags without bypassing quality and cooldown protection."
      />

      <div className="space-y-6 p-5 sm:p-8">
        <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-7 text-amber-100">
          Rotation is weighted, not purely random. Admin boost can help prioritize
          a clip, but clips with weak quality or cooldown status still collapse
          toward zero weight.
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
                Global ready pool
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Pre-fill clip variants before players request them
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                The warm pool sits above per-round generation. It keeps ready
                variants across Fan, Fanatic, and Buff, while respecting
                quality gating, cooldown-style exclusions, and diversity caps.
              </p>
            </div>

            <form action={warmMovieBuffGlobalPoolAction}>
              <button
                type="submit"
                className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-black transition hover:bg-amber-300"
              >
                Warm global pool now
              </button>
            </form>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {poolStatus.perLabel.map((entry) => (
              <div
                key={entry.label}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                  {entry.label}
                </p>
              <p className="mt-3 text-3xl font-black text-white">
                  {entry.primaryReadyAssets}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  primary ready assets from {entry.eligibleClips} eligible clips
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  secondary reserve: {entry.secondaryReadyAssets}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Snapshot generated {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(poolStatus.generatedAt))}. Primary ready:{" "}
            {poolStatus.totalPrimaryReadyAssets}. Secondary ready:{" "}
            {poolStatus.totalSecondaryReadyAssets}. Eligible clips:{" "}
            {poolStatus.totalEligibleClips}.
          </p>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-[1560px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Movie</th>
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Boost</th>
                  <th className="px-6 py-4">Flags</th>
                  <th className="px-6 py-4">Sample</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Quality score</th>
                  <th className="px-6 py-4">Rotation score</th>
                  <th className="px-6 py-4">Rotation weight</th>
                  <th className="px-6 py-4">Last played</th>
                  <th className="px-6 py-4">Save</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {rows.map((row) => {
                  const formId = `rotation-${row.contentMediaId}`;

                  return (
                    <tr key={row.contentMediaId}>
                      <td className="px-6 py-4">
                        <p className="font-black text-white">
                          {row.movieTitle}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {row.systemDifficultyLabel} - {row.totalPlays} plays
                        </p>
                      </td>
                      <td className="px-6 py-4 capitalize">
                        {row.section ?? "any"}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          form={formId}
                          name="status"
                          defaultValue={row.status}
                          className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          form={formId}
                          type="number"
                          name="adminBoost"
                          min={-3}
                          max={3}
                          defaultValue={row.adminBoost}
                          className="w-24 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          form={formId}
                          type="text"
                          name="qualityFlags"
                          defaultValue={row.qualityFlags.join(", ")}
                          placeholder="title_card, credits"
                          className="w-64 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {row.sampleSize}
                      </td>
                      <td className="px-6 py-4">
                        {Math.round(row.confidenceFactor * 100)}%
                      </td>
                      <td className="px-6 py-4">
                        {row.qualityScore.toFixed(1)}
                      </td>
                      <td className="px-6 py-4">
                        {row.rotationScore.toFixed(1)}
                      </td>
                      <td className="px-6 py-4">
                        {row.rotationWeight.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {row.lastPlayedAt
                          ? new Intl.DateTimeFormat("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(row.lastPlayedAt))
                          : "Not played yet"}
                      </td>
                      <td className="px-6 py-4">
                        <form
                          id={formId}
                          action={updateMovieBuffClipControlsAction}
                        >
                          <input
                            type="hidden"
                            name="contentMediaId"
                            value={row.contentMediaId}
                          />

                          <button
                            type="submit"
                            className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-400"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
