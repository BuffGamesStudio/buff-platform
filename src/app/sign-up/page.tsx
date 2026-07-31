import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthFormCard from "@/components/AuthFormCard";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
  }>;
}) {
  const resolvedSearchParams =
    await searchParams;
  const nextTarget =
    resolvedSearchParams.next?.trim() ||
    "/account";

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl items-center justify-center px-6 py-16">
        <AuthFormCard
          mode="sign-up"
          nextTarget={nextTarget}
        />
      </section>

      <Footer />
    </main>
  );
}
