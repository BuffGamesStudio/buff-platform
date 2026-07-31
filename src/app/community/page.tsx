import MarketingPage from "@/components/MarketingPage";

export default function CommunityPage() {
  return (
    <MarketingPage
      eyebrow="Community"
      title="Join the players shaping Buff Games."
      description="Community features are being staged for launch. For now, this page gives players a working destination instead of a dead end, and it points them back into the game and support flow."
      primaryHref="/games/movie-buff/lobby"
      primaryLabel="Enter Movie Buff"
      secondaryHref="/contact"
      secondaryLabel="Reach Support"
    />
  );
}
