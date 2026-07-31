import MarketingPage from "@/components/MarketingPage";

export default function ShopPage() {
  return (
    <MarketingPage
      eyebrow="Shop"
      title="The Buff Games shop is not live yet."
      description="Merchandise, rewards, and digital extras are planned for a later release. This page now acts as a valid stop in the site flow instead of a missing route."
      primaryHref="/games/movie-buff/lobby"
      primaryLabel="Play Now"
      secondaryHref="/"
      secondaryLabel="Back to Home"
    />
  );
}
