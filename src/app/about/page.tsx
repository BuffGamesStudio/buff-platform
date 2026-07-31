import MarketingPage from "@/components/MarketingPage";

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About Buff Games"
      title="We build competitive entertainment for movie and TV fans."
      description="Buff Games is focused on turning film and television knowledge into a fast, social game experience. Movie Buff is the first step, with more formats and community features on the way."
      primaryHref="/games/movie-buff"
      primaryLabel="Explore Movie Buff"
      secondaryHref="/contact"
      secondaryLabel="Contact Us"
    />
  );
}
