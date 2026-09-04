import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPairs, type PairsResponse } from "@zauq/shared/outfits";
import { resolveImageUrl } from "../lib/api";
import { Arch, SkeletonBlock } from "./ui";

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
      <div className="mt-4 border-t border-ink/10 pt-4">
        <p className="text-sm text-ink/60">Couldn’t read the closet for pairings. Check your connection and try again.</p>
        <div className="action-row mt-4">
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setData(null);
              getPairs(itemId)
                .then((r) => setData(r))
                .catch(() => setFailed(true));
            }}
            className="btn-ghost btn-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="mt-4 border-t border-ink/10 pt-4" aria-busy="true" aria-label="Loading">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="mt-3 h-6 w-2/3" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="aspect-[5/6] w-16" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    );

  return (
    <section className="mt-4 border-t border-ink/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">
          Goes with
        </p>
        <Link to={`/closet/compose?pin=${itemId}`} className="btn-quiet btn-quiet-sm">
          Compose around it
        </Link>
      </div>
      <p className="mt-2 font-display text-xl italic text-ink">
        {data.pairs.length === 0
          ? "Nothing in the closet pairs with it yet."
          : `${data.pairs.length} piece${data.pairs.length === 1 ? "" : "s"} · ${data.outfitCount} outfit${data.outfitCount === 1 ? "" : "s"} ready.`}
      </p>
      {data.pairs.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {data.pairs.map(({ item, score }) => (
            <div
              key={item.id}
              className="w-16 flex-none"
              title={`${item.subtype ?? item.category} · ${score.toFixed(1)}`}
            >
              <Arch aspect="aspect-[5/6]">
                <img
                  src={resolveImageUrl(item.imageUrl)}
                  alt={item.subtype ?? item.category}
                  className="relative z-[1] h-full w-full object-contain p-[10%]"
                />
              </Arch>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
