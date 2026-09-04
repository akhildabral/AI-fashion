import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { getBasket, getWishlist } from "@zauq/shared/wardrobe";
import { PageHead } from "./ui";

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
    <nav aria-label="Closet rooms" role="tablist" className="tabs mt-8 animate-rise-1">
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
            {badge > 0 && current !== r.key && <span className="count tabular-nums !text-brass-ink">{badge}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** The short mantel every room shares, so a room never feels like a different app. */
export function RoomMantel({
  eyebrow,
  title,
  line,
  aside,
}: {
  eyebrow: string;
  title: React.ReactNode;
  line?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return <PageHead eyebrow={eyebrow} title={title} line={line} aside={aside} />;
}
