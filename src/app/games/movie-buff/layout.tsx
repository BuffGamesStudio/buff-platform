import type { ReactNode } from "react";

import { MovieBuffAuthoritativeNavigation } from "@/components/movie-buff/MovieBuffAuthoritativeNavigation";

export const dynamic = "force-dynamic";

export default function MovieBuffLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MovieBuffAuthoritativeNavigation>
      {children}
    </MovieBuffAuthoritativeNavigation>
  );
}
