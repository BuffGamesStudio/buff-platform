import AdminHeader from "@/components/admin/AdminHeader";

export default function AdminSettingsPage() {
  return (
    <section>
      <AdminHeader
        title="CMS Settings"
        description="Configuration tools for the Movie Buff content system will live here. This route now exists so the admin navigation stays intact."
      />

      <div className="px-5 py-8 sm:px-8">
        <div className="max-w-3xl rounded-3xl border border-white/10 bg-zinc-950/70 p-8">
          <h2 className="text-2xl font-black text-white">
            Settings workspace
          </h2>

          <p className="mt-3 text-sm leading-7 text-zinc-400">
            The settings screen is not populated yet, but the page is now a
            valid destination inside the admin flow.
          </p>
        </div>
      </div>
    </section>
  );
}
