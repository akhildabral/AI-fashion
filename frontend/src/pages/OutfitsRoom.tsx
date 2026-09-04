import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle";
import {
  deleteOutfit,
  getOutfits,
  saveOutfit,
  suggestOutfits,
  EVENT_LABEL,
  type Outfit,
  type Suggested,
} from "@zauq/shared/outfits";
import { logWear } from "@zauq/shared/wearlog";
import { ClosetRooms, RoomMantel } from "../components/ClosetRooms";
import { PageShell, Toast, useFlash, SkeletonBlock, LoadError, UndoBar } from "../components/ui";
import { LookBoard } from "../components/LookBoard";
import { Spinner } from "../components/Spinner";
import { ShareButton } from "../components/ShareButton";
import { TryOnModal } from "../components/TryOnModal";
import { AskCircleModal } from "../components/ComposeModals";
import type { WardrobeItem } from "@zauq/shared/types";

// The Outfits room: every look the closet can make. Suggested by the engine
// for the day you name, saved by you, worn and counted. Composing by hand
// has its own page; this is where the results live.

const OCCASIONS: { key: string; label: string; ask: string }[] = [
  { key: "work", label: "Work", ask: "a normal working day" },
  { key: "casual", label: "Weekend", ask: "an easy weekend day out" },
  { key: "evening", label: "Evening", ask: "dinner out this evening" },
  { key: "occasion", label: "Occasion", ask: "a special occasion" },
];

function names(items: WardrobeItem[]): string {
  return items.map((i) => i.subtype ?? i.category).join(" · ");
}

function Provenance({ o }: { o: Outfit }) {
  const worn = o.wearCount > 0 ? `worn ${o.wearCount}×` : null;
  const by =
    o.provenance === "user"
      ? "composed by you"
      : o.provenance === "copied"
        ? "from a friend"
        : "from the stylist";
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
      {EVENT_LABEL[o.eventType] ?? o.eventType} · {by}
      {worn ? ` · ${worn}` : ""}
    </p>
  );
}

export function OutfitsRoom() {
  usePageTitle("Outfits");
  const navigate = useNavigate();
  const { toast, flash } = useFlash();
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [askingCircle, setAskingCircle] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Suggested[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tryOnItems, setTryOnItems] = useState<string[] | null>(null);
  const [pending, setPending] = useState<{ outfit: Outfit; timer: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getOutfits();
      setOutfits(r.outfits.filter((o) => o.items.length > 0));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function ask(key: string) {
    const occ = OCCASIONS.find((o) => o.key === key)!;
    setOccasion(key);
    setAsking(true);
    setSuggested(null);
    try {
      const r = await suggestOutfits({
        occasion: occ.ask,
        eventType: key,
        count: 3,
      } as { occasion: string; eventType: string });
      setSuggested(r.outfits);
    } catch (err) {
      flash(
        err instanceof Error
          ? err.message
          : "The stylist could not compose right now.",
      );
      setSuggested([]);
    } finally {
      setAsking(false);
    }
  }

  async function keep(s: Suggested) {
    setBusy(`keep:${s.items.map((i) => i.id).join(",")}`);
    try {
      await saveOutfit({
        itemIds: s.items.map((i) => i.id),
        rationale: s.rationale,
        eventType: occasion ?? "work",
        provenance: "ai",
      });
      flash("Kept. It’s in your outfits now.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function wear(o: {
    id?: string;
    items: WardrobeItem[];
    eventType?: string;
  }) {
    setBusy(`wear:${o.id ?? o.items.map((i) => i.id).join(",")}`);
    try {
      await logWear(
        o.id
          ? { outfitId: o.id }
          : { itemIds: o.items.map((i) => i.id), eventType: o.eventType },
      );
      flash("Logged for today. Anything worn past its turn is in the basket.");
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not log that.");
    } finally {
      setBusy(null);
    }
  }

  // Deferred delete with a 5s Undo window before the server call fires.
  function remove(o: Outfit) {
    if (pending) {
      window.clearTimeout(pending.timer);
      void deleteOutfit(pending.outfit.id).catch(() => undefined);
    }
    setOutfits((prev) => (prev ?? []).filter((x) => x.id !== o.id));
    const timer = window.setTimeout(() => {
      void deleteOutfit(o.id).catch(() => {
        flash("Couldn’t let it go. Try again.");
        setOutfits((prev) => [o, ...(prev ?? [])]);
      });
      setPending(null);
    }, 5000);
    setPending({ outfit: o, timer });
  }
  function undoRemove() {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    setOutfits((prev) => [pending.outfit, ...(prev ?? [])]);
    setPending(null);
  }

  const count = outfits?.length ?? 0;

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel
        eyebrow="The collection"
        title="Outfits"
        line={
          outfits
            ? `${count} outfit${count === 1 ? "" : "s"} the closet has made`
            : undefined
        }
      />
      <ClosetRooms current="outfits" />

      {/* Suggested: name the day, the engine composes from what's clean */}
      <section className="mt-8 animate-rise-1">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              Suggested
            </p>
            <h2 className="mt-1 font-display text-3xl font-medium text-ink">
              What would you <em className="text-brass">wear for…</em>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate("/closet/compose")}
            className="btn-primary"
          >
            Style by hand
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={asking}
              onClick={() => void ask(o.key)}
              className={`chip ${occasion === o.key ? "chip-on" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {asking && (
          <div className="mt-6 flex items-center gap-3 text-sm text-ink/55">
            <Spinner className="h-4 w-4" /> composing from what’s clean…
          </div>
        )}
        {suggested && suggested.length === 0 && !asking && (
          <p className="mt-6 font-display text-lg italic text-ink/55">
            Nothing held together for that. Try another day, or add a piece.
          </p>
        )}
        {suggested && suggested.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {suggested.map((s) => {
              const key = s.items.map((i) => i.id).join(",");
              return (
                <article key={key} className="card animate-rise p-4">
                  <LookBoard items={s.items} />
                  <p className="mt-3 font-display text-base italic leading-snug text-ink">
                    {s.rationale}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">{names(s.items)}</p>
                  {s.validation.warnings.length > 0 && (
                    <p className="mt-1 text-[11px] text-ink/45">
                      {s.validation.warnings[0].message}
                    </p>
                  )}
                  <div className="action-row mt-3">
                    <button
                      type="button"
                      disabled={busy === `keep:${key}`}
                      onClick={() => void keep(s)}
                      className="btn-primary btn-sm"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={busy === `wear:${key}`}
                      onClick={() =>
                        void wear({
                          items: s.items,
                          eventType: occasion ?? undefined,
                        })
                      }
                      className="btn-quiet btn-quiet-sm"
                    >
                      Wearing it today
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Yours */}
      <section className="mt-12 animate-rise-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">
          Yours
        </p>
        <h2 className="mt-1 font-display text-3xl font-medium text-ink">
          Kept and worn
        </h2>
        {outfits === null && !failed && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="aspect-[4/3]" />
            ))}
          </div>
        )}
        {failed && !outfits && (
          <LoadError className="min-h-[24vh]" message="Couldn’t load your outfits. Check your connection and try again." onRetry={() => { setFailed(false); void load() }} />
        )}
        {!failed && outfits && outfits.length === 0 && (
          <div className="mt-6 max-w-lg">
            <p className="font-display text-lg italic text-ink/60">
              Nothing kept yet. Wear a brief, keep a suggestion, or compose one
              by hand, and it lives here.
            </p>
            <Link to="/closet/compose" className="btn-ghost mt-4 inline-flex">
              Compose the first
            </Link>
          </div>
        )}
        {outfits && outfits.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {outfits.map((o) => (
              <article key={o.id} className="card p-4">
                <LookBoard items={o.items} />
                <div className="mt-3">
                  <Provenance o={o} />
                  {o.rationale && (
                    <p className="mt-1 font-display text-base italic leading-snug text-ink">
                      {o.rationale}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink/50">{names(o.items)}</p>
                </div>
                <div className="action-row mt-3">
                  <button
                    type="button"
                    disabled={busy === `wear:${o.id}`}
                    onClick={() => void wear(o)}
                    className="btn-primary btn-sm"
                  >
                    Wearing it today
                  </button>
                  <button
                    type="button"
                    onClick={() => setTryOnItems(o.itemIds)}
                    className="btn-quiet btn-quiet-sm"
                  >
                    See it on me
                  </button>
                  <button type="button" onClick={() => setAskingCircle(o.id)} className="btn-quiet btn-quiet-sm">
                    Ask the circle
                  </button>
                  <ShareButton target={{ kind: "outfit", id: o.id, title: "An outfit from my closet", text: o.rationale ?? undefined }} onDone={(l) => l && flash(l)} className="btn-quiet btn-quiet-sm" />
                  <Link
                    to={`/closet/compose?from=${o.id}`}
                    className="btn-quiet btn-quiet-sm"
                  >
                    Adjust
                  </Link>
                  <button
                    type="button"
                    disabled={busy === `rm:${o.id}`}
                    onClick={() => void remove(o)}
                    className="btn-quiet btn-quiet-sm !text-ink/40"
                  >
                    Let it go
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
          <AskCircleModal open={askingCircle !== null} onClose={() => setAskingCircle(null)} onAsked={() => flash("Asked. The verdict lands in your Circle.")} initialOutfitId={askingCircle} />
      {tryOnItems && <TryOnModal itemIds={tryOnItems} onClose={() => setTryOnItems(null)} />}
      {pending && <UndoBar message="Outfit let go." onUndo={undoRemove} />}
    </PageShell>
  );
}
