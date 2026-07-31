import { Ticket } from "lucide-react";

type MovieBuffLoadingTickerProps = {
  title: string;
  subtitle: string;
  statusLabel: string;
  variant?: "page" | "clip";
};

export default function MovieBuffLoadingTicker({
  title,
  subtitle,
  statusLabel,
  variant = "clip",
}: MovieBuffLoadingTickerProps) {
  const pageVariant = variant === "page";

  return (
    <div
      className={`movie-buff-loading-card movie-buff-loading-card--${variant}`}
    >
      {pageVariant ? (
        <div className="movie-buff-clapper" aria-hidden="true">
          <div className="movie-buff-clapper__top" />

          <div className="movie-buff-clapper__body">
            <div className="movie-buff-clapper__row">
              <span>Scene 26</span>
              <span>Take 4</span>
            </div>

            <div className="movie-buff-clapper__action">
              Action
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="movie-buff-loading-ticket" aria-hidden="true">
            <Ticket className="h-5 w-5 shrink-0" />
            <span className="movie-buff-loading-ticket__brand">
              Movie Buff
            </span>
            <span className="movie-buff-loading-ticket__stub">
              Loading
            </span>
          </div>

          <div className="movie-buff-loading-popcorn" aria-hidden="true">
            <span className="movie-buff-loading-popcorn__kernel" />
            <span className="movie-buff-loading-popcorn__kernel" />
            <span className="movie-buff-loading-popcorn__kernel" />
            <span className="movie-buff-loading-popcorn__kernel" />
          </div>
        </>
      )}

      <p className="movie-buff-loading-status">{statusLabel}</p>
      <p className="movie-buff-loading-title">{title}</p>

      {!pageVariant ? (
        <div className="movie-buff-loading-marquee" aria-hidden="true">
          <span>
            MOVIE BUFF • NEXT SCENE LOADING • MOVIE BUFF • NEXT SCENE LOADING •
          </span>
        </div>
      ) : null}

      <p className="movie-buff-loading-subtitle">{subtitle}</p>
    </div>
  );
}
