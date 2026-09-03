import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPairs, type PairsResponse } from "@zauq/shared/outfits";
import { resolveImageUrl } from "../lib/api";
import { Spinner } from "./Spinner";

// "Goes with": the pairing rail under every piece. A count you can act on,
// the pieces themselves, and the door to composing around it.

export function GoesWith({ itemId }: { itemId: string }) {
  const [data, setData] = useState<PairsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    getPairs(itemId)
      .then((r) => alive && setData(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [itemId]);

  if (failed)
    return (
      <p className="mt-5 border-t border-ink/10 pt-4 text-xs text-ink/45">
        Couldn’t read the closet for pairings.{' '}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setData(null);
            getPairs(itemId)
              .then((r) => setData(r))
              .catch(() => setFailed(true));
          }}
          className="press font-semibold text-brass hover:underline"
        >
          Try again
        </button>
      </p>
    );
  if (!data)
    return (
      <div className="mt-5 flex items-center gap-2 text-xs text-ink/45">
        <Spinner className="h-3.5 w-3.5" /> reading the closet…
      </div>
    );

  return (
    <section className="mt-5 border-t border-ink/10 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
          Goes with
        </p>
        <Link
          to={`/closet/compose?pin=${itemId}`}
          className="press text-xs font-semibold text-brass hover:underline"
        >
          Compose around it →
        </Link>
      </div>
      <p className="mt-1 font-display text-xl italic text-ink">
        {data.pairs.length === 0
          ? "Nothing in the closet pairs with it yet."
          : `${data.pairs.length} piece${data.pairs.length === 1 ? "" : "s"} · ${data.outfitCount} outfit${data.outfitCount === 1 ? "" : "s"} ready.`}
      </p>
      {data.pairs.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {data.pairs.map(({ item, score }) => (
            <div
              key={item.id}
              className="w-16 flex-none"
              title={`${item.subtype ?? item.category} · ${score.toFixed(1)}`}
            >
              <div className="arch-bezel aspect-[5/6]">
                <div className="arch-niche flex h-full w-full items-center justify-center">
                  <img
                    src={resolveImageUrl(item.imageUrl)}
                    alt={item.subtype ?? item.category}
                    className="relative z-[1] h-full w-full object-contain p-[10%]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
