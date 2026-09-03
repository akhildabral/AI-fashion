import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle";
import { getWardrobe } from "../lib/wardrobe";
import {
  getOutfits,
  saveOutfit,
  validateOutfit,
  EVENT_LABEL,
  type Validation,
} from "../lib/outfits";
import { logWear } from "../lib/wearlog";
import { RoomMantel } from "../components/ClosetRooms";
import { PageShell, Toast, useFlash, ArchSkeleton } from "../components/ui";
import { LookBoard } from "../components/LookBoard";
import { Spinner } from "../components/Spinner";
import { resolveImageUrl } from "../lib/api";
import type { WardrobeItem } from "../lib/types";

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

  function toggle(id: string) {
    setChosen((c) =>
      c.includes(id)
        ? c.filter((x) => x !== id)
        : c.length >= 8
          ? c
          : [...c, id],
    );
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
              <div className="arch-bezel aspect-[5/4]">
                <div className="arch-niche flex h-full w-full items-center justify-center px-8 text-center">
                  <span className="font-display text-lg italic text-ink/45">
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
            {validation === null && chosen.length > 0 ? (
              <span className="inline-flex items-center gap-2 text-ink/50">
                <Spinner className="h-3.5 w-3.5" /> reading it…
              </span>
            ) : (
              line.text
            )}
          </p>
          {picked.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {picked.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => toggle(i.id)}
                  className="chip !px-2.5 !py-1 !text-xs"
                  aria-label={`Remove ${i.subtype ?? i.category}`}
                >
                  {i.subtype ?? i.category} ×
                </button>
              ))}
            </div>
          )}
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
              For
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVENTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEventType(e)}
                  className={`chip !px-3 !py-1.5 !text-xs ${eventType === e ? "chip-on" : ""}`}
                >
                  {EVENT_LABEL[e]}
                </button>
              ))}
            </div>
          </div>
          <div className="action-row mt-5">
            <button
              type="button"
              disabled={
                chosen.length < 2 ||
                busy !== null ||
                (validation ? !validation.ok : true)
              }
              onClick={() => void save()}
              className="btn-primary disabled:opacity-50"
            >
              {busy === "save" ? "Keeping…" : "Keep it"}
            </button>
            <button
              type="button"
              disabled={chosen.length < 2 || busy !== null}
              onClick={() => void wearToday()}
              className="btn-ghost disabled:opacity-50"
            >
              Wearing it today
            </button>
            {chosen.length >= 2 && (
              <button
                type="button"
                onClick={() => navigate(`/mirror?items=${chosen.join(",")}`)}
                className="btn-quiet"
              >
                See it on me
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-quiet !text-ink/40"
            >
              Back
            </button>
          </div>
        </div>

        {/* The rail */}
        <div className="animate-rise-2">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Piece type"
          >
            {SLOTS.map((s) => {
              const n = (closet ?? []).filter(s.test).length;
              if (n === 0) return null;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={slot === s.key}
                  onClick={() => setSlot(s.key)}
                  className="tab press"
                >
                  {s.label}
                  <span className="count">{n}</span>
                </button>
              );
            })}
          </div>
          {closet === null && !closetFailed && (
            <ArchSkeleton count={10} className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" />
          )}
          {closetFailed && (
            <div className="mt-8">
              <p className="text-sm text-ink/60">Couldn’t load your closet. Check your connection.</p>
              <button type="button" onClick={() => { setClosetFailed(false); getWardrobe().then((r) => { setCloset(r.items.filter((i) => i.status === 'ready' && !i.suppressed)) }).catch(() => setClosetFailed(true)) }} className="btn-ghost btn-sm mt-3">Try again</button>
            </div>
          )}
          {closet && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
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
                    <div
                      className={`arch-bezel aspect-[5/6] transition ${on ? "brightness-110 ring-2 ring-iris ring-offset-2 ring-offset-bone" : ""} ${dirty ? "opacity-50" : ""}`}
                    >
                      <div className="arch-niche h-full w-full">
                        <img
                          src={resolveImageUrl(i.imageUrl)}
                          alt={i.subtype ?? i.category}
                          className="relative z-[1] h-full w-full object-contain p-[8%]"
                          loading="lazy"
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                      {i.subtype ?? i.category}
                      {dirty && (
                        <span className="ml-1 text-brass">
                          · {i.state === "in-wash" ? "in the wash" : i.state}
                        </span>
                      )}
                    </p>
                  </button>
                );
              })}
              {inSlot.length === 0 && (
                <p className="col-span-full text-sm text-ink/50">
                  Nothing of this kind in the closet yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
