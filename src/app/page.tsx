import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeaturedGames from "@/components/FeaturedGames";
import Buffster from "@/components/Buffster";
import Leaderboard from "@/components/Leaderboard";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <Hero />
      <FeaturedGames />
      <Buffster />
      <Leaderboard />
      <Footer />
    </main>
  );
}