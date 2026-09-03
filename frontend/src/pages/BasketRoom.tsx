import { useCallback, useEffect, useState } from "react";
import { usePageTitle } from "../lib/usePageTitle";
import {
  basketClean,
  updateWardrobeItem,
  getBasket,
  type BasketResponse,
} from "@zauq/shared/wardrobe";
import { ClosetRooms, RoomMantel } from "../components/ClosetRooms";
import { GarmentTile, PageShell, Toast, useFlash, ArchSkeleton, LoadError } from "../components/ui";
import { resolveImageUrl } from "../lib/api";
import type { WardrobeItem } from "@zauq/shared/types";

// The basket: what's out of rotation and why. The stylist never proposes a
// piece that's here; one tap brings it back.

const STATE_LABEL: Record<string, string> = {
  "in-wash": "In the wash",
  packed: "Packed",
  "lent-out": "Lent out",
};

function daysAgo(iso: string | null): string {
  if (!iso) return "not yet";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export function BasketRoom() {
  usePageTitle("The basket");
  const { toast, flash } = useFlash();
  const [data, setData] = useState<BasketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getBasket());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function back(item: WardrobeItem) {
    setBusy(item.id);
    try {
      await updateWardrobeItem(item.id, { state: "clean" });
      flash(`The ${item.subtype ?? item.category} is back in rotation.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function allClean() {
    setBusy("all");
    try {
      const { count } = await basketClean();
      flash(
        count === 1
          ? "One piece back from the wash."
          : `${count} pieces back from the wash.`,
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  const groups = (["in-wash", "packed", "lent-out"] as const)
    .map((s) => ({
      state: s,
      items: data?.items.filter((i) => i.state === s) ?? [],
    }))
    .filter((g) => g.items.length > 0);
  const inWash = data?.counts.inWash ?? 0;

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel
        eyebrow="The collection"
        title="The basket"
        line={
          data
            ? `${data.items.length} out of rotation · last wash ${daysAgo(data.lastWashedAt)}`
            : undefined
        }
      />
      <ClosetRooms current="basket" />

      {loading && <ArchSkeleton count={4} className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" />}

      {!loading && failed && (
        <LoadError message="Couldn’t open the basket. Check your connection and try again." onRetry={() => { setLoading(true); void load() }} />
      )}

      {!loading && !failed && data && (
        <>
          {/* The plaque: is it worth a load? */}
          <div className="plaque mt-8 flex animate-rise-1 flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
                Laundry
              </p>
              <p className="mt-1 font-display text-2xl italic text-ink">
                {inWash === 0
                  ? "Nothing in the wash. Everything is yours to wear."
                  : data.worthALoad
                    ? `${inWash} pieces in the wash. Worth a load.`
                    : `${inWash} in the wash. A load is worth it at ${data.loadWorth}.`}
              </p>
              {data.oneMoreWear.length > 0 && (
                <p className="mt-1 text-sm text-ink/55">
                  One more wear and{" "}
                  {data.oneMoreWear.length === 1
                    ? `the ${data.oneMoreWear[0].subtype ?? data.oneMoreWear[0].category} joins`
                    : `${data.oneMoreWear.length} more pieces join`}{" "}
                  it.
                </p>
              )}
            </div>
            {inWash > 0 && (
              <button
                type="button"
                disabled={busy === "all"}
                onClick={() => void allClean()}
                className="btn-primary whitespace-nowrap"
              >
                {busy === "all"
                  ? "Folding…"
                  : "Everything’s back from the wash"}
              </button>
            )}
          </div>

          {groups.length === 0 && (
            <div className="mt-10 animate-rise-2 text-center">
              <div
                className="arch-bezel mx-auto w-40"
                style={{ aspectRatio: "5 / 6" }}
              >
                <div className="arch-niche flex h-full w-full items-center justify-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">
                    Empty
                  </span>
                </div>
              </div>
              <p className="mt-5 font-display text-xl italic text-ink/60">
                The basket fills itself. Log a wear, and pieces come here when
                they’ve had their turn.
              </p>
            </div>
          )}

          {groups.map((g) => (
            <section key={g.state} className="mt-10 animate-rise-2">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-2xl font-medium text-ink">
                  {STATE_LABEL[g.state]}
                </h2>
                <span className="text-xs text-ink/45">{g.items.length}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {g.items.map((it) => (
                  <div key={it.id}>
                    <GarmentTile
                      imageUrl={resolveImageUrl(it.imageUrl)}
                      label={it.subtype ?? it.category}
                      sublabel={
                        g.state === "in-wash"
                          ? `after ${it.wearsSinceWash ?? 1} wear${(it.wearsSinceWash ?? 1) === 1 ? "" : "s"}`
                          : STATE_LABEL[g.state]
                      }
                    />
                    <button
                      type="button"
                      disabled={busy === it.id}
                      onClick={() => void back(it)}
                      className="btn-ghost btn-sm mt-2 w-full"
                    >
                      {busy === it.id
                        ? "…"
                        : g.state === "in-wash"
                          ? "Back from the wash"
                          : g.state === "packed"
                            ? "Unpacked"
                            : "Returned"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </PageShell>
  );
}
