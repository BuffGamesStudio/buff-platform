"use client";

import Image from "next/image";
import { Bot, Sparkles, MessageCircle, Zap } from "lucide-react";

export default function Buffster() {
  return (
    <section className="bg-zinc-950 py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-8 lg:grid-cols-2">

        <div className="flex justify-center">

          <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl">

            <Image
              src="/assets/mascots/buffster.jpeg"
              alt="Buffster"
              width={500}
              height={500}
              className="h-auto w-full object-cover"
            />

          </div>

        </div>

        <div>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-red-600/30 bg-red-600/10 px-4 py-2 text-red-400">
            <Bot size={18} />
            Meet Buffster
          </div>

          <h2 className="mb-6 text-5xl font-black text-white">
            Your AI Game Host
          </h2>

          <p className="mb-10 text-xl leading-8 text-zinc-300">
            Buffster is the personality behind Buff Games. He welcomes players,
            explains the rules, announces tournaments, celebrates victories,
            and will eventually provide AI-powered hints, voice interaction,
            and personalized recommendations.
          </p>

          <div className="space-y-5">

            <div className="flex items-start gap-4 rounded-2xl border border-zinc-800 bg-black/50 p-5">
              <Sparkles className="mt-1 text-red-500" />
              <div>
                <h3 className="font-bold text-white">AI Personality</h3>
                <p className="text-zinc-400">
                  Friendly, entertaining, and always ready to challenge players.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-zinc-800 bg-black/50 p-5">
              <MessageCircle className="mt-1 text-red-500" />
              <div>
                <h3 className="font-bold text-white">Voice Assistant</h3>
                <p className="text-zinc-400">
                  Future updates will allow Buffster to speak with players during games.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-2xl border border-zinc-800 bg-black/50 p-5">
              <Zap className="mt-1 text-red-500" />
              <div>
                <h3 className="font-bold text-white">Live Events</h3>
                <p className="text-zinc-400">
                  Tournament announcements, countdowns, and live event hosting.
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}