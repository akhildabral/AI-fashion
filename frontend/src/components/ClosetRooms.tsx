import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { getBasket, getWishlist } from "../lib/wardrobe";

// The Closet's rooms: one row that says where you are and what's waiting in
// the others. Pieces, the outfits they make, the basket (what's out of
// rotation — in the wash, packed, or lent), and the wishlist.

export type Room = "pieces" | "outfits" | "basket" | "wishlist";

const ROOMS: { key: Room; to: string; label: string }[] = [
  { key: "pieces", to: "/closet", label: "Pieces" },
  { key: "outfits", to: "/closet/outfits", label: "Outfits" },
  { key: "basket", to: "/closet/basket", label: "The basket" },
  { key: "wishlist", to: "/closet/wishlist", label: "Wishlist" },
];

export function ClosetRooms({ current }: { current: Room }) {
  const [counts, setCounts] = useState({ basket: 0, wishlist: 0 });

  useEffect(() => {
    let alive = true;
    Promise.all([getBasket().catch(() => null), getWishlist().catch(() => null)]).then(
      ([b, w]) => {
        if (!alive) return;
        setCounts({
          basket: b ? b.counts.inWash + b.counts.packed + b.counts.lentOut : 0,
          wishlist: w ? w.items.length : 0,
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [current]);

  return (
    <div className="mt-6 flex animate-rise-1 items-end justify-between gap-x-4 border-b border-ink/10">
      <nav aria-label="Closet rooms" className="tabs min-w-0 !border-b-0">
        {ROOMS.map((r) => {
          const badge = r.key === "basket" ? counts.basket : r.key === "wishlist" ? counts.wishlist : 0;
          return (
            <NavLink
              key={r.key}
              to={r.to}
              end
              aria-current={current === r.key ? "page" : undefined}
              aria-selected={current === r.key}
              role="tab"
              className="tab press"
            >
              {r.label}
              {badge > 0 && current !== r.key && <span className="count tabular-nums !text-brass">{badge}</span>}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

/** The short mantel every room shares, so a room never feels like a different app. */
export function RoomMantel({
  eyebrow,
  title,
  line,
}: {
  eyebrow: string;
  title: string;
  line?: string;
}) {
  return (
    <div className="animate-rise border-b border-ink/10 pb-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">
        {eyebrow}
      </p>
      <h1 className="mt-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
        {title}
      </h1>
      {line && <p className="mt-2 text-sm text-ink/50">{line}</p>}
    </div>
  );
}
