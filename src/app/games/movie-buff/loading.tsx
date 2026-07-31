import MovieBuffLoadingTicker from "@/components/movie-buff/MovieBuffLoadingTicker";

export default function MovieBuffLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
      <MovieBuffLoadingTicker
        variant="page"
        statusLabel="Scene 26 • Take 4"
        title="Action"
        subtitle="Loading the next Movie Buff page."
      />
    </div>
  );
}
