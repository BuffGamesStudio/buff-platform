import MarketingPage from "@/components/MarketingPage";

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact"
      title="Need help with Movie Buff or Buff Games?"
      description="Use this page as the support destination for the current site navigation. It gives visitors a valid path while fuller support tooling is still being built."
      primaryHref="/games/movie-buff/lobby"
      primaryLabel="Go to Movie Buff"
      secondaryHref="/community"
      secondaryLabel="Visit Community"
    />
  );
}
