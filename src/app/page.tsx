export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">

      <h1 className="text-6xl font-extrabold text-red-600 mb-4">
        BUFF GAMES
      </h1>

      <p className="text-2xl text-gray-300 mb-10">
        Play What You Love
      </p>

      <div className="space-y-4 text-center">

        <div className="text-3xl">
          🎬 Movie Buff
        </div>

        <div className="text-3xl">
          📺 Couch Potato
        </div>

        <div className="text-xl text-gray-500 mt-6">
          More Games Coming Soon...
        </div>

      </div>

      <button className="mt-12 bg-red-600 hover:bg-red-700 px-8 py-4 rounded-xl text-xl font-bold transition">
        Play Movie Buff
      </button>

      <p className="mt-10 text-gray-500">
        Powered by Buffster™
      </p>

    </main>
  );
}