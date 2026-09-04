import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle";
import { getWardrobe } from "@zauq/shared/wardrobe";
import {
  getOutfits,
  saveOutfit,
  validateOutfit,
  EVENT_LABEL,
  type Validation,
} from "@zauq/shared/outfits";
import { logWear } from "@zauq/shared/wearlog";
import { RoomMantel } from "../components/ClosetRooms";
import { PageShell, Toast, useFlash, ArchSkeleton, Arch, Chip, Tabs, LoadError, EmptyState } from "../components/ui";
import { TryOnModal } from "../components/TryOnModal";
import { LookBoard } from "../components/LookBoard";
import { resolveImageUrl } from "../lib/api";
import type { WardrobeItem } from "@zauq/shared/types";

// Compose: build an outfit by hand. The board on the left fills as you tap
// pieces on the right; the validator scores it as you go, in words, not a
// number. Save it, wear it today, or see it on you.

const SLOTS: {
  key: string;
  label: string;
  test: (i: WardrobeItem) => boolean;
}[] = [
  {
    key: "outer",
    label: "Outer",
    test: (i) => i.category === "outerwear" || i.layerRole === "outer",
  },
  {
    key: "top",
    label: "Tops",
    test: (i) =>
      i.category === "top" || i.layerRole === "base" || i.layerRole === "mid",
  },
  { key: "dress", label: "Dresses", test: (i) => i.category === "dress" },
  { key: "bottom", label: "Bottoms", test: (i) => i.category === "bottom" },
  { key: "shoes", label: "Shoes", test: (i) => i.category === "footwear" },
  {
    key: "extras",
    label: "Extras",
    test: (i) => i.category === "accessory" || i.category === "other",
  },
];
const EVENTS = ["work", "casual", "evening", "occasion"];

function verdictLine(
  v: Validation | null,
  n: number,
): { text: string; tone: "quiet" | "good" | "warn" } {
  if (n === 0)
    return {
      text: "Tap pieces to start. A top and a bottom, or a dress, is enough.",
      tone: "quiet",
    };
  if (!v) return { text: "Reading it…", tone: "quiet" };
  if (v.violations.length)
    return { text: v.violations[0].message, tone: "warn" };
  if (v.warnings.length)
    return { text: `Holds together. ${v.warnings[0].message}`, tone: "good" };
  if (v.pairQuality >= 8)
    return {
      text: "This sings. The pieces were made for each other.",
      tone: "good",
    };
  if (v.pairQuality >= 6.5)
    return { text: "Holds together well.", tone: "good" };
  return {
    text: "Wearable. The colours are doing more work than the cut.",
    tone: "good",
  };
}

export function ComposePage() {
  usePageTitle("Compose");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast, flash } = useFlash();
  const [closet, setCloset] = useState<WardrobeItem[] | null>(null);
  const [closetFailed, setClosetFailed] = useState(false);
  const [tryOn, setTryOn] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [slot, setSlot] = useState<string>("top");
  const [eventType, setEventType] = useState("work");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Load the closet, and whatever we're composing from: a pinned piece or a saved outfit.
  useEffect(() => {
    getWardrobe()
      .then((r) => {
        setCloset(r.items.filter((i) => i.status === "ready" && !i.suppressed));
        setClosetFailed(false);
      })
      .catch(() => setClosetFailed(true));
    const pin = params.get("pin");
    const from = params.get("from");
    if (pin) setChosen([pin]);
    if (from)
      getOutfits()
        .then((r) => {
          const o = r.outfits.find((x) => x.id === from);
          if (o) {
            setChosen(o.itemIds);
            setEventType(o.eventType);
          }
        })
        .catch(() => undefined);
  }, [params]);

  const byId = useMemo(
    () => new Map((closet ?? []).map((i) => [i.id, i])),
    [closet],
  );
  const picked = chosen
    .map((id) => byId.get(id))
    .filter((i): i is WardrobeItem => !!i);

  // Live validation, a beat after the last tap.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (chosen.length === 0) {
      setValidation(null);
      return;
    }
    setValidation(null);
    timer.current = window.setTimeout(() => {
      validateOutfit(chosen, eventType)
        .then((r) => setValidation(r.validation))
        .catch(() => setValidation(null));
    }, 350);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [chosen, eventType]);

  // Categories you only ever wear one of at a time.
  const SINGULAR = new Set(["bottom", "footwear", "dress"]);
  const isSeparate = (i: WardrobeItem) => i.category === "top" || i.category === "bottom";

  // Would adding `a` mean wearing two of something you can't? Then `b` steps out.
  function conflicts(a: WardrobeItem, b: WardrobeItem): boolean {
    if (SINGULAR.has(a.category) && b.category === a.category) return true; // one bottom / pair of shoes / dress
    if (a.subtype && b.subtype && a.subtype === b.subtype) return true; // no two of the same subtype
    if (a.category === "dress" && isSeparate(b)) return true; // a dress replaces the top/bottom
    if (isSeparate(a) && b.category === "dress") return true; // and a top/bottom replaces the dress
    return false;
  }

  function toggle(id: string) {
    setChosen((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= 8) return c;
      const item = byId.get(id);
      if (!item) return [...c, id];
      // An outfit is one-per-slot: adding a piece swaps out anything it would
      // double up. Different subtypes still layer (a camisole under a shirt,
      // a bag with a belt).
      const kept = c.filter((xid) => {
        const x = byId.get(xid);
        return !x || !conflicts(item, x);
      });
      return [...kept, id];
    });
  }

  async function save() {
    setBusy("save");
    try {
      await saveOutfit({ itemIds: chosen, eventType, provenance: "user" });
      flash("Kept. It lives in your outfits now.");
      navigate("/closet/outfits");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not keep that.");
    } finally {
      setBusy(null);
    }
  }
  async function wearToday() {
    setBusy("wear");
    try {
      await saveOutfit({ itemIds: chosen, eventType, provenance: "user" });
      await logWear({ itemIds: chosen, eventType });
      flash("Logged for today.");
      navigate("/closet/outfits");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not log that.");
    } finally {
      setBusy(null);
    }
  }

  const line = verdictLine(validation, chosen.length);
  const inSlot = (closet ?? []).filter((i) =>
    SLOTS.find((s) => s.key === slot)!.test(i),
  );

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel
        eyebrow="Outfits"
        title="Compose"
        line="Tap pieces; the stylist reads it as you go."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* The board */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="animate-rise-1">
            {picked.length > 0 ? (
              <LookBoard items={picked} />
            ) : (
              <div className="rect-frame aspect-[5/4]">
                <div className="arch-niche flex h-full w-full items-center justify-center px-8 text-center">
                  <span className="font-display text-lg italic text-[var(--text-in-niche-muted)]">
                    The board is empty.
                  </span>
                </div>
              </div>
            )}
          </div>
          <p
            className={`mt-4 font-display text-lg italic leading-snug ${line.tone === "warn" ? "text-[rgb(var(--c-danger))]" : line.tone === "good" ? "text-ink" : "text-ink/50"}`}
            aria-live="polite"
          >
            {validation === null && chosen.length > 0 ? <span className="text-ink/50">Reading it…</span> : line.text}
          </p>
          {picked.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">In the outfit</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {picked.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => toggle(i.id)}
                    className="press group relative w-16 shrink-0 text-center"
                    aria-label={`Remove ${i.subtype ?? i.category}`}
                    title={`Remove ${i.subtype ?? i.category}`}
                  >
                    <Arch aspect="aspect-[5/6]">
                      <img
                        src={resolveImageUrl(i.imageUrl)}
                        alt={i.subtype ?? i.category}
                        loading="lazy"
                        className="relative z-[1] h-full w-full object-contain p-[10%]"
                      />
                    </Arch>
                    <span
                      aria-hidden
                      className="absolute -right-1.5 -top-1.5 z-[2] flex h-5 w-5 items-center justify-center rounded-[3px] border border-bone/20 bg-ink/85 text-bone transition-colors group-hover:bg-[rgb(var(--c-danger))]"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.7" fill="none" />
                      </svg>
                    </span>
                    <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                      {i.subtype ?? i.category}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              For
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVENTS.map((e) => (
                <Chip key={e} onClick={() => setEventType(e)} on={eventType === e}>
                  {EVENT_LABEL[e]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="action-row mt-6">
            <button
              type="button"
              disabled={
                chosen.length < 2 ||
                busy !== null ||
                (validation ? !validation.ok : true)
              }
              onClick={() => void save()}
              className="btn-primary"
            >
              {busy === "save" ? "Keeping…" : "Keep it"}
            </button>
            <button
              type="button"
              disabled={chosen.length < 2 || busy !== null}
              onClick={() => void wearToday()}
              className="btn-ghost"
            >
              Wearing it today
            </button>
            {chosen.length >= 2 && (
              <button
                type="button"
                onClick={() => setTryOn(true)}
                className="btn-quiet"
              >
                See it on me
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-quiet"
            >
              Back
            </button>
          </div>
        </div>

        {/* The rail */}
        <div className="animate-rise-2">
          <Tabs
            label="Piece type"
            value={slot}
            onChange={setSlot}
            items={SLOTS.filter((s) => (closet ?? []).filter(s.test).length > 0).map((s) => ({ key: s.key, label: s.label, count: (closet ?? []).filter(s.test).length }))}
          />
          {closet === null && !closetFailed && (
            <ArchSkeleton count={10} className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:gap-6" />
          )}
          {closetFailed && (
            <LoadError
              className="min-h-[24vh]"
              message="Couldn’t load your closet. Check your connection and try again."
              onRetry={() => { setClosetFailed(false); getWardrobe().then((r) => { setCloset(r.items.filter((i) => i.status === 'ready' && !i.suppressed)) }).catch(() => setClosetFailed(true)) }}
            />
          )}
          {closet && closet.length === 0 && (
            <EmptyState
              className="mt-6"
              line="Your closet is empty. Add a few pieces first, then style them by hand here."
              action={
                <button type="button" onClick={() => navigate('/closet')} className="btn-primary">
                  Add pieces
                </button>
              }
            />
          )}
          {closet && closet.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:gap-6">
              {inSlot.map((i) => {
                const on = chosen.includes(i.id);
                const dirty = i.state !== "clean";
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(i.id)}
                    className="press text-left"
                    title={
                      dirty
                        ? `${i.subtype ?? i.category} · ${i.state}`
                        : (i.subtype ?? i.category)
                    }
                  >
                    <Arch aspect="aspect-[5/6]" bright={on} className={`transition-opacity ${dirty ? "opacity-50" : ""}`}>
                      <img
                        src={resolveImageUrl(i.imageUrl)}
                        alt={i.subtype ?? i.category}
                        className="relative z-[1] h-full w-full object-contain p-[7%]"
                        loading="lazy"
                      />
                    </Arch>
                    <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                      {i.subtype ?? i.category}
                      {dirty && (
                        <span className="ml-1 text-brass-ink">
                          · {i.state === "in-wash" ? "in the wash" : i.state}
                        </span>
                      )}
                    </p>
                  </button>
                );
              })}
              {inSlot.length === 0 && (
                <p className="empty-line col-span-full">
                  Nothing of this kind in the closet yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {tryOn && chosen.length >= 2 && <TryOnModal itemIds={chosen} onClose={() => setTryOn(false)} />}
    </PageShell>
  );
}
