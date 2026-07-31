import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type MarketingPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
};

export default function MarketingPage({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: MarketingPageProps) {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl flex-col items-center justify-center px-8 py-24 text-center">
        <span className="mb-6 rounded-full border border-red-600/40 bg-red-600/10 px-5 py-2 text-sm font-bold uppercase tracking-[0.35em] text-red-400">
          {eyebrow}
        </span>

        <h1 className="max-w-4xl text-5xl font-black leading-tight sm:text-6xl">
          {title}
        </h1>

        <p className="mt-8 max-w-3xl text-lg leading-8 text-zinc-300 sm:text-xl">
          {description}
        </p>

        <div className="mt-12 flex flex-col gap-5 sm:flex-row">
          <Link
            href={primaryHref}
            className="rounded-xl bg-red-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-red-700"
          >
            {primaryLabel}
          </Link>

          <Link
            href={secondaryHref}
            className="rounded-xl border border-zinc-700 px-8 py-4 text-lg font-bold text-white transition hover:border-red-500 hover:text-red-400"
          >
            {secondaryLabel}
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
