import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle";
import { useProfile } from "../context/useProfile";
import { useAuth } from "../context/useAuth";
import { Arch, Toast, useFlash } from "../components/ui";
import { FlatLay } from "../components/CircleCards";
import { Spinner } from "../components/Spinner";
import { resolveImageUrl } from "../lib/api";
import { getQuiz, submitQuiz } from "../lib/quiz";
import { setHandle as claimHandle } from "../lib/social";
import { uploadPhoto } from "../lib/tryon";
import { addWardrobeItem, getWardrobe } from "../lib/wardrobe";
import { getBrief, type BriefResponse } from "../lib/brief";
import { enableRitual, pushSupported } from "../lib/push";
import {
  checkHandle,
  saveFitting,
  weatherFor,
  type FittingPatch,
} from "../lib/fitting";
import type { QuizPair, WardrobeItem } from "../lib/types";

// The fitting: first run as a sitting with your stylist. One decision per
// screen in the stylist's voice; a thread that speaks instead of counting;
// notes that fill as you answer; the first look as the ending. Every screen
// can be skipped and the step lives in the URL, so refresh and back behave
// and an abandoned fitting resumes from Today.

const STEPS = [
  "threshold",
  "intent",
  "occasions",
  "dressing",
  "taste",
  "fit",
  "sizes",
  "tone",
  "budget",
  "city",
  "handle",
  "mirror",
  "closet",
  "reveal",
] as const;
type Step = (typeof STEPS)[number];
const LAST = STEPS.length - 1;

// Weighted by effort, not by count: the closet is the real last stretch.
const PROGRESS = [12, 18, 24, 28, 46, 52, 58, 64, 68, 72, 76, 80, 92, 100];
// The thread speaks in the stylist's voice, never in minutes.
const WORDS = [
  "A good start",
  "A good start",
  "Good to know",
  "Good to know",
  "Getting to know you",
  "Taking your measure",
  "Taking your measure",
  "A clear picture",
  "A clear picture",
  "Almost dressed",
  "Almost dressed",
  "Almost dressed",
  "Nearly there",
  "Composed",
];

const MIN_PIECES = 3;

const INTENTS = [
  [
    "decided",
    "Decided for me",
    "The outfit is waiting when I wake. I just put it on.",
  ],
  [
    "own",
    "Wearing what I own, better",
    "Fewer new things, more of my closet actually worn.",
  ],
  [
    "friends",
    "Dressed by my friends",
    "Verdicts, picks, and looks from people whose taste I trust.",
  ],
] as const;
const OCCASIONS = [
  ["work", "Work"],
  ["casual", "Weekends"],
  ["evening", "Evenings out"],
  ["occasion", "Occasions"],
  ["athletic", "Training"],
] as const;
const BUILDS = ["slim", "athletic", "average", "curvy", "plus"] as const;
const TONES: [string, string][] = [
  ["fair", "#F3DCC8"],
  ["light", "#E6BE9A"],
  ["medium", "#C9946A"],
  ["tan", "#A06A45"],
  ["deep", "#5E3B2A"],
];
const COLOURS: [string, string][] = [
  ["red", "#B8322E"],
  ["orange", "#D9782D"],
  ["yellow", "#E3C24B"],
  ["green", "#4E7A4B"],
  ["teal", "#2F7F84"],
  ["blue", "#3459A8"],
  ["purple", "#6E4B9E"],
  ["pink", "#D98AA9"],
  ["brown", "#7A5230"],
  ["neon", "#B6F53A"],
];
const BUDGETS = [
  ["budget", "Carefully"],
  ["mid", "Mid-range"],
  ["premium", "Premium"],
  ["luxury", "Luxury"],
] as const;
const DRESSING_LINES = [
  "Taking your measure…",
  "Cutting the pieces…",
  "Setting the light…",
];

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- small pieces ---------- */

function Who({ children }: { children: ReactNode }) {
  return (
    <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
      {children}
    </p>
  );
}
function Ask({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-3 max-w-[16ch] animate-rise-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl lg:text-6xl">
      {children}
    </h1>
  );
}
function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-[44ch] animate-rise-1 font-display text-lg italic leading-snug text-ink/60 sm:text-xl">
      {children}
    </p>
  );
}
function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-3">{children}</div>
  );
}
function Later({
  onClick,
  children = "Decide later",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press px-1 py-2 text-sm text-ink/45 transition-colors hover:text-ink/70"
    >
      {children}
    </button>
  );
}
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`chip ${on ? "chip-on" : ""}`}
    >
      {children}
    </button>
  );
}
function RowLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
      {children}
    </p>
  );
}

/* ---------- the page ---------- */

export function FittingPage() {
  usePageTitle("The fitting");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { toast, flash } = useFlash();
  const { user } = useAuth();
  const { profile, loading: profileLoading, setProfile } = useProfile();

  const step = Math.max(0, Math.min(LAST, Number(params.get("s") ?? 0) || 0));
  const name: Step = STEPS[step];

  // ---- local answers (mirrored to the profile as we go) ----
  const [intent, setIntent] = useState<string | null>(null);
  const [occasions, setOccasions] = useState<Set<string>>(new Set());
  const [dressing, setDressing] = useState<string | null>(null);
  const [pairs, setPairs] = useState<QuizPair[] | null>(null);
  const [choices, setChoices] = useState<Record<string, "left" | "right">>({});
  const [tasteNotes, setTasteNotes] = useState<string[]>([]);
  const [height, setHeight] = useState(170);
  const [build, setBuild] = useState<string | null>(null);
  const [sizes, setSizes] = useState<{
    top?: string;
    bottom?: string;
    shoe?: string;
  }>({});
  const [tone, setTone] = useState<string | null>(null);
  const [avoid, setAvoid] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [weather, setWeather] = useState<{
    location: string;
    temperatureC: number;
    description: string;
  } | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [handle, setHandleText] = useState("");
  const [handleState, setHandleState] = useState<{ ok: boolean; msg: string }>({
    ok: false,
    msg: "Letters, numbers, underscore. At least three.",
  });
  const [claimed, setClaimed] = useState<string | null>(user?.handle ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pieces, setPieces] = useState<WardrobeItem[]>([]);
  const [adding, setAdding] = useState(0);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [revealLine, setRevealLine] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ritualBusy, setRitualBusy] = useState(false);
  const [ritualSet, setRitualSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const pieceInput = useRef<HTMLInputElement>(null);
  const pieceCamera = useRef<HTMLInputElement>(null);

  // Hydrate from a saved profile so a resumed fitting shows what it knows.
  useEffect(() => {
    if (hydrated.current || profileLoading) return;
    hydrated.current = true;
    if (!profile) return;
    if (profile.intents?.[0]) setIntent(profile.intents[0]);
    if (profile.occasions?.length) setOccasions(new Set(profile.occasions));
    if (profile.styleFor) setDressing(profile.styleFor);
    if (profile.heightCm) setHeight(profile.heightCm);
    if (profile.bodyType) setBuild(profile.bodyType);
    if (profile.sizes) setSizes(profile.sizes);
    if (profile.skinTone) setTone(profile.skinTone);
    if (profile.avoidColors?.length) setAvoid(new Set(profile.avoidColors));
    if (profile.budgetBand) setBudget(profile.budgetBand);
    if (profile.city) setCity(profile.city);
    // Resume where they left off if they arrive without a step.
    if (
      !params.get("s") &&
      (profile.fittingStep ?? 0) > 0 &&
      !profile.fittingCompletedAt
    ) {
      setParams(
        { s: String(Math.min(LAST, profile.fittingStep ?? 0)) },
        { replace: true },
      );
    }
  }, [profile, profileLoading, params, setParams]);

  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(LAST, n));
      setParams({ s: String(next) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setParams],
  );

  // Save what we know and move on. Never blocks on failure: the fitting is
  // the product's first impression, and a flaky save must not stall it.
  const advance = useCallback(
    async (patch: FittingPatch = {}, to: number = step + 1) => {
      setBusy(true);
      try {
        const { profile: p } = await saveFitting({ ...patch, fittingStep: to });
        setProfile(p);
      } catch {
        /* keep going; the next save carries it */
      } finally {
        setBusy(false);
        go(to);
      }
    },
    [step, go, setProfile],
  );

  // ---- taste pairs ----
  useEffect(() => {
    if (name !== "taste" || pairs) return;
    getQuiz()
      .then((r) => setPairs(r.pairs.slice(0, 5)))
      .catch(() => setPairs([]));
  }, [name, pairs]);
  const tasteIndex = useMemo(
    () => (pairs ? pairs.findIndex((p) => !(p.id in choices)) : -1),
    [pairs, choices],
  );

  async function pick(side: "left" | "right" | "skip") {
    if (!pairs) return;
    const pair = pairs[tasteIndex];
    if (!pair) return;
    const nextChoices = {
      ...choices,
      [pair.id]: side === "skip" ? "left" : side,
    };
    setChoices(nextChoices);
    if (side !== "skip")
      setTasteNotes((n) => [
        ...n,
        `${title(pair[side].label)}, over ${pair[side === "left" ? "right" : "left"].label}`,
      ]);
    const remaining = pairs.filter((p) => !(p.id in nextChoices));
    if (remaining.length === 0) {
      try {
        const { profile: p } = await submitQuiz(nextChoices);
        setProfile(p);
      } catch {
        /* the notes still stand */
      }
      void advance({}, step + 1);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (name !== "taste") return;
      if (e.key === "ArrowLeft") void pick("left");
      if (e.key === "ArrowRight") void pick("right");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---- weather answer-back ----
  async function askWeather() {
    const c = city.trim();
    if (!c) return;
    setWeatherBusy(true);
    try {
      const w = await weatherFor(c);
      setWeather(
        w.ok && w.temperatureC != null
          ? {
              location: w.location,
              temperatureC: w.temperatureC,
              description: w.description ?? "",
            }
          : null,
      );
      if (!w.ok)
        flash(
          `Couldn’t find the weather for ${c} yet. The stylist keeps trying.`,
        );
    } catch {
      setWeather(null);
    } finally {
      setWeatherBusy(false);
    }
  }

  // ---- handle availability ----
  useEffect(() => {
    if (name !== "handle") return;
    const h = handle;
    if (h.length < 3) {
      setHandleState({
        ok: false,
        msg: "Letters, numbers, underscore. At least three.",
      });
      return;
    }
    const t = window.setTimeout(() => {
      checkHandle(h)
        .then((r) =>
          setHandleState(
            r.available
              ? { ok: true, msg: `@${h} is free.` }
              : { ok: false, msg: r.reason ?? `@${h} is taken. Try another.` },
          ),
        )
        .catch(() =>
          setHandleState({ ok: false, msg: "Could not check that just now." }),
        );
    }, 250);
    return () => window.clearTimeout(t);
  }, [handle, name]);

  async function claim() {
    if (!handleState.ok) return;
    setBusy(true);
    try {
      const { user: u } = await claimHandle(handle);
      setClaimed(u.handle);
      void advance({}, step + 1);
    } catch (err) {
      setHandleState({
        ok: false,
        msg: err instanceof Error ? err.message : "Could not claim that.",
      });
      setBusy(false);
    }
  }

  // ---- photo ----
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { photoUrl: url } = await uploadPhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save your photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  // ---- closet: the first pieces, developing in place ----
  useEffect(() => {
    if (name !== "closet" && name !== "reveal") return;
    getWardrobe()
      .then((r) => setPieces(r.items))
      .catch(() => undefined);
  }, [name]);
  const processing = pieces.some((p) => p.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = window.setInterval(() => {
      getWardrobe()
        .then((r) => setPieces(r.items))
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(t);
  }, [processing]);
  async function onPieces(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setAdding((n) => n + files.length);
    for (const f of files) {
      try {
        const { item } = await addWardrobeItem(f);
        setPieces((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
      } catch (err) {
        flash(
          err instanceof Error ? err.message : "That piece did not upload.",
        );
      } finally {
        setAdding((n) => n - 1);
      }
    }
  }
  const ready = pieces.filter((p) => p.status === "ready").length;
  const shown = pieces.slice(0, 3);

  // ---- the reveal ----
  useEffect(() => {
    if (name !== "reveal") return;
    setRevealed(false);
    setRevealLine(0);
    const lineTimer = window.setInterval(
      () => setRevealLine((n) => (n + 1) % DRESSING_LINES.length),
      1400,
    );
    getBrief({})
      .then((b) => {
        setBrief(b);
        setRevealed(true);
        void saveFitting({ fittingStep: LAST, fittingDone: true })
          .then((r) => setProfile(r.profile))
          .catch(() => undefined);
      })
      .catch(() => {
        setBrief({ mode: "starter" } as BriefResponse);
        setRevealed(true);
      })
      .finally(() => window.clearInterval(lineTimer));
    return () => window.clearInterval(lineTimer);
  }, [name, setProfile]);

  async function wakeMe() {
    setRitualBusy(true);
    try {
      await enableRitual(7);
      setRitualSet(true);
      flash("Set. Your look will be waiting at 7:00.");
    } catch (err) {
      flash(
        err instanceof Error ? err.message : "Could not set the ritual here.",
      );
    } finally {
      setRitualBusy(false);
    }
  }

  // ---- the dossier ----
  const notes = useMemo(() => {
    const n: string[] = [];
    if (intent)
      n.push(
        {
          decided: "wants mornings decided",
          own: "wants to wear what they own, better",
          friends: "wants friends in the loop",
        }[intent] ?? "",
      );
    if (occasions.size)
      n.push(
        `dresses mostly for ${[...occasions].map((o) => OCCASIONS.find(([k]) => k === o)?.[1].toLowerCase() ?? o).join(", ")}`,
      );
    if (dressing)
      n.push(
        {
          female: "dressing her wardrobe",
          male: "dressing his wardrobe",
          unisex: "dressing both wardrobes",
        }[dressing] ?? "",
      );
    for (const t of tasteNotes) n.push(`Noted: ${t.toLowerCase()}`);
    if (build) n.push(`${build} build, ${height} cm`);
    const sz = [
      sizes.top && `top ${sizes.top}`,
      sizes.bottom && `bottom ${sizes.bottom}`,
      sizes.shoe && `shoe ${sizes.shoe}`,
    ].filter(Boolean);
    if (sz.length) n.push(`wears ${sz.join(" · ")}`);
    if (tone) n.push(`${tone} skin tone`);
    if (avoid.size) n.push(`never ${[...avoid].join(", ")}`);
    if (budget)
      n.push(
        `shops ${BUDGETS.find(([k]) => k === budget)?.[1].toLowerCase()} when a gap needs filling`,
      );
    if (city) n.push(`mornings in ${city}, weather checked daily`);
    if (claimed) n.push(`their room is at /u/${claimed}`);
    if (photoUrl) n.push("in the Mirror: looks render on you");
    if (pieces.length)
      n.push(
        `${pieces.length} piece${pieces.length === 1 ? "" : "s"} in the closet`,
      );
    if (ritualSet) n.push("woken at 7 with the look");
    return n.filter(Boolean);
  }, [
    intent,
    occasions,
    dressing,
    tasteNotes,
    build,
    height,
    sizes,
    tone,
    avoid,
    budget,
    city,
    claimed,
    photoUrl,
    pieces.length,
    ritualSet,
  ]);

  if (profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const back =
    step > 0 ? <Later onClick={() => go(step - 1)}>Back</Later> : null;

  return (
    <div className="min-h-[100dvh]">
      <Toast msg={toast} />

      {/* the thread */}
      <div className="sticky top-16 z-20 bg-bone/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="relative h-0.5 flex-1 bg-ink/10">
            <div
              className="absolute left-0 top-0 h-full transition-[width] duration-700 ease-[cubic-bezier(.23,1,.32,1)]"
              style={{
                width: `${PROGRESS[step]}%`,
                background:
                  "linear-gradient(90deg, var(--c-brass-lo), var(--c-brass-hi))",
              }}
            >
              {/* the diamond at the head of the thread, sitting on the line */}
              <span
                aria-hidden
                className="absolute -right-[6px] -top-[5px] h-3 w-3 rotate-45"
                style={{ background: "var(--c-brass-hi)" }}
              />
            </div>
          </div>
          <p
            className="min-w-[12ch] text-right font-display text-sm italic text-brass"
            aria-live="polite"
          >
            {WORDS[step]}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <main className="min-h-[56dvh]" key={step}>
          {/* 0 threshold */}
          {name === "threshold" && (
            <>
              <Who>Welcome in</Who>
              <Ask>
                Let’s take <em className="text-brass">your measure.</em>
              </Ask>
              <Lead>
                A few taps, and tomorrow morning is decided for you, from
                clothes you already own.
              </Lead>
              <Actions>
                <button
                  type="button"
                  onClick={() => void advance({}, 1)}
                  className="btn-primary"
                >
                  Begin the fitting
                </button>
              </Actions>
            </>
          )}

          {/* 1 intent */}
          {name === "intent" && (
            <>
              <Who>First</Who>
              <Ask>
                What matters <em className="text-brass">most?</em>
              </Ask>
              <Lead>
                Pick the one that rings truest. It decides what the stylist puts
                first.
              </Lead>
              <div
                className="mt-7 grid animate-rise-2 gap-3 sm:grid-cols-3"
                role="group"
              >
                {INTENTS.map(([k, b, s]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={intent === k}
                    onClick={() => {
                      setIntent(k);
                      window.setTimeout(
                        () => void advance({ intents: [k] }, 2),
                        220,
                      );
                    }}
                    className={`press card card-hover p-5 text-left ${intent === k ? "!border-brass bg-iris-soft/40" : ""}`}
                  >
                    <span className="block font-display text-2xl font-medium leading-tight text-ink">
                      {b}
                    </span>
                    <span className="mt-2 block text-sm text-ink/60">{s}</span>
                  </button>
                ))}
              </div>
              <Actions>
                {back}
                <Later onClick={() => void advance({}, 2)}>Skip for now</Later>
              </Actions>
            </>
          )}

          {/* 2 occasions */}
          {name === "occasions" && (
            <>
              <Who>Mostly</Who>
              <Ask>
                What do you dress <em className="text-brass">for?</em>
              </Ask>
              <Lead>
                Pick the days that fill your week. The stylist plans those
                first.
              </Lead>
              <div
                className="mt-6 flex animate-rise-2 flex-wrap gap-2"
                role="group"
              >
                {OCCASIONS.map(([k, l]) => (
                  <Chip
                    key={k}
                    on={occasions.has(k)}
                    onClick={() =>
                      setOccasions((s) =>
                        s.has(k)
                          ? new Set([...s].filter((x) => x !== k))
                          : new Set([...s, k]),
                      )
                    }
                  >
                    {l}
                  </Chip>
                ))}
              </div>
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void advance({ occasions: [...occasions] }, 3)}
                  className="btn-primary"
                >
                  {occasions.size ? "Next" : "Skip for now"}
                </button>
              </Actions>
            </>
          )}

          {/* 3 dressing */}
          {name === "dressing" && (
            <>
              <Who>Then</Who>
              <Ask>
                Whose wardrobe are we <em className="text-brass">dressing?</em>
              </Ask>
              <Lead>
                This decides the shapes the stylist reaches for. Changeable any
                time.
              </Lead>
              <div className="mt-7 grid max-w-xl animate-rise-2 grid-cols-3 gap-4">
                {(
                  [
                    [
                      "female",
                      "Her wardrobe",
                      "M12 3h4l3 9-3 1 1 8H7l1-8-3-1 3-9h4",
                    ],
                    [
                      "male",
                      "His wardrobe",
                      "M8 3h8l4 4v6l-3 1v7H7v-7l-3-1V7z",
                    ],
                    ["unisex", "Both", "M6 4h12v16H6zM9 4v16M15 4v16"],
                  ] as const
                ).map(([k, l, d]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={dressing === k}
                    onClick={() => {
                      setDressing(k);
                      window.setTimeout(
                        () => void advance({ styleFor: k }, 4),
                        220,
                      );
                    }}
                    className="press text-center"
                  >
                    <Arch aspect="aspect-[5/6]" bright={dressing === k}>
                      <svg
                        viewBox="0 0 24 24"
                        className="relative z-[1] mx-auto h-full w-1/2 text-brass-lo"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        aria-hidden="true"
                      >
                        <path d={d} />
                      </svg>
                    </Arch>
                    <span
                      className={`mt-2 block text-[11px] font-semibold uppercase tracking-[0.14em] ${dressing === k ? "text-brass" : "text-ink/55"}`}
                    >
                      {l}
                    </span>
                  </button>
                ))}
              </div>
              <Actions>
                {back}
                <Later onClick={() => void advance({}, 4)} />
              </Actions>
            </>
          )}

          {/* 4 taste */}
          {name === "taste" && (
            <>
              <Who>
                Taste
                {pairs && tasteIndex >= 0
                  ? ` · ${tasteIndex + 1} of ${pairs.length}`
                  : ""}
              </Who>
              <Ask>
                This, <em className="text-brass">or that?</em>
              </Ask>
              <Lead>
                {tasteIndex <= 0
                  ? "No wrong answers. Tap the one you’d reach for."
                  : "Keep going, the stylist is taking notes."}
              </Lead>
              {!pairs && (
                <div className="mt-10 text-ink/40">
                  <Spinner className="h-5 w-5" />
                </div>
              )}
              {pairs && pairs.length === 0 && (
                <Actions>
                  <button
                    type="button"
                    onClick={() => void advance({}, 5)}
                    className="btn-primary"
                  >
                    Continue
                  </button>
                </Actions>
              )}
              {pairs && tasteIndex >= 0 && (
                <div
                  key={pairs[tasteIndex].id}
                  className="mt-7 grid max-w-2xl animate-rise-2 grid-cols-[1fr_auto_1fr] items-center gap-4"
                >
                  {(["left", "right"] as const).map((side, i) => (
                    <Fragment key={side}>
                      {i === 1 && (
                        <span className="font-display text-2xl italic text-ink/35">
                          or
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void pick(side)}
                        className="press text-center"
                        aria-label={`Choose ${pairs[tasteIndex][side].label}`}
                      >
                        <Arch aspect="aspect-[3/4]">
                          <img
                            src={resolveImageUrl(
                              pairs[tasteIndex][side].imageUrl,
                            )}
                            alt=""
                            className="relative z-[1] h-full w-full object-cover"
                          />
                        </Arch>
                        <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/60">
                          {pairs[tasteIndex][side].label}
                        </span>
                      </button>
                    </Fragment>
                  ))}
                </div>
              )}
              <Actions>
                {tasteIndex > 0 ? (
                  <Later
                    onClick={() => {
                      const prev = pairs![tasteIndex - 1];
                      setChoices((c) => {
                        const n = { ...c };
                        delete n[prev.id];
                        return n;
                      });
                      setTasteNotes((n) => n.slice(0, -1));
                    }}
                  >
                    Back
                  </Later>
                ) : (
                  back
                )}
                {pairs && tasteIndex >= 0 && (
                  <Later onClick={() => void pick("skip")}>
                    Neither, honestly
                  </Later>
                )}
              </Actions>
              <p className="mt-4 text-xs text-ink/40">← → to choose</p>
            </>
          )}

          {/* 5 fit */}
          {name === "fit" && (
            <>
              <Who>Your measure</Who>
              <Ask>
                How tall, and <em className="text-brass">how built?</em>
              </Ask>
              <Lead>
                Proportions decide what falls right. Nothing here is shown to
                anyone.
              </Lead>
              <div className="mt-7 max-w-xl animate-rise-2">
                <p className="font-display text-6xl leading-none text-ink [font-variant-numeric:tabular-nums]">
                  {height}
                  <span className="ml-2 font-sans text-xs uppercase tracking-[0.2em] text-ink/45">
                    cm
                  </span>
                </p>
                <input
                  type="range"
                  min={140}
                  max={210}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  aria-label="Height in centimetres"
                  className="tape mt-4 w-full"
                  style={{
                    ["--p" as string]: `${((height - 140) / 70) * 100}%`,
                  }}
                />
                <div className="mt-2 flex justify-between text-[10px] tracking-[0.14em] text-ink/40">
                  <span>140</span>
                  <span>175</span>
                  <span>210</span>
                </div>
                <RowLabel>Build</RowLabel>
                <div className="mt-3 flex flex-wrap gap-2">
                  {BUILDS.map((b) => (
                    <Chip key={b} on={build === b} onClick={() => setBuild(b)}>
                      {title(b)}
                    </Chip>
                  ))}
                </div>
              </div>
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void advance(
                      { heightCm: height, bodyType: build ?? undefined },
                      // Straight to the photo. Sizes, tone, budget, city and
                      // handle are refinements — offered after the first look,
                      // not before it, so the reveal comes fast.
                      11,
                    )
                  }
                  className="btn-primary"
                >
                  Next
                </button>
                <Later onClick={() => void advance({}, 11)} />
              </Actions>
            </>
          )}

          {/* 6 sizes */}
          {name === "sizes" && (
            <>
              <Who>Sizes</Who>
              <Ask>
                What do you <em className="text-brass">reach for?</em>
              </Ask>
              <Lead>Whatever’s on your labels. Skip any you’re unsure of.</Lead>
              <div className="animate-rise-2">
                {(
                  [
                    ["top", "Tops", ["XS", "S", "M", "L", "XL", "XXL"]],
                    [
                      "bottom",
                      "Bottoms",
                      ["26", "28", "30", "32", "34", "36", "38", "40"],
                    ],
                    [
                      "shoe",
                      "Shoes",
                      ["5", "6", "7", "8", "9", "10", "11", "12"],
                    ],
                  ] as const
                ).map(([k, label, opts]) => (
                  <div key={k}>
                    <RowLabel>{label}</RowLabel>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {opts.map((o) => (
                        <Chip
                          key={o}
                          on={sizes[k] === o}
                          onClick={() =>
                            setSizes((s) => ({
                              ...s,
                              [k]: s[k] === o ? undefined : o,
                            }))
                          }
                        >
                          {o}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void advance({ sizes }, 7)}
                  className="btn-primary"
                >
                  Next
                </button>
                <Later onClick={() => void advance({}, 7)} />
              </Actions>
            </>
          )}

          {/* 7 tone & colours */}
          {name === "tone" && (
            <>
              <Who>Colour</Who>
              <Ask>
                Your tone, and what to{" "}
                <em className="text-brass">keep away.</em>
              </Ask>
              <Lead>
                Tone helps the stylist pick shades that flatter. Strike any
                colour you never want to see on you.
              </Lead>
              <div className="animate-rise-2">
                <RowLabel>Skin tone</RowLabel>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {TONES.map(([k, c]) => (
                    <button
                      key={k}
                      type="button"
                      aria-label={k}
                      aria-pressed={tone === k}
                      onClick={() => setTone(k)}
                      className={`press h-11 w-11 rounded-[3px] border border-black/15 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-bone ${tone === k ? "ring-2 ring-iris ring-offset-2 ring-offset-bone" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <RowLabel>Never on me</RowLabel>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {COLOURS.map(([k, c]) => {
                    const on = avoid.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-label={`Avoid ${k}`}
                        aria-pressed={on}
                        onClick={() =>
                          setAvoid((s) =>
                            s.has(k)
                              ? new Set([...s].filter((x) => x !== k))
                              : new Set([...s, k]),
                          )
                        }
                        className={`press relative h-11 w-11 rounded-[3px] border border-black/15 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-bone ${on ? "opacity-45" : ""}`}
                        style={{ background: c }}
                      >
                        {on && (
                          <span
                            aria-hidden
                            className="absolute -left-1.5 -right-1.5 top-1/2 h-0.5 -rotate-45 bg-ink ring-2 ring-bone"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void advance(
                      { skinTone: tone ?? undefined, avoidColors: [...avoid] },
                      8,
                    )
                  }
                  className="btn-primary"
                >
                  Next
                </button>
                <Later onClick={() => void advance({}, 8)} />
              </Actions>
            </>
          )}

          {/* 8 budget */}
          {name === "budget" && (
            <>
              <Who>Budget</Who>
              <Ask>
                When something’s missing,{" "}
                <em className="text-brass">how do you shop?</em>
              </Ask>
              <Lead>
                Only for the rare gap the closet can’t fill. The stylist never
                sends you shopping otherwise.
              </Lead>
              <div className="mt-6 flex animate-rise-2 flex-wrap gap-2">
                {BUDGETS.map(([k, l]) => (
                  <Chip
                    key={k}
                    on={budget === k}
                    onClick={() => {
                      setBudget(k);
                      window.setTimeout(
                        () => void advance({ budgetBand: k }, 9),
                        220,
                      );
                    }}
                  >
                    {l}
                  </Chip>
                ))}
              </div>
              <Actions>
                {back}
                <Later onClick={() => void advance({}, 9)} />
              </Actions>
            </>
          )}

          {/* 9 city */}
          {name === "city" && (
            <>
              <Who>Where</Who>
              <Ask>
                Where do mornings <em className="text-brass">happen?</em>
              </Ask>
              <Lead>
                The weather in your city is the first thing the stylist checks
                each day.
              </Lead>
              <form
                className="mt-6 flex max-w-lg animate-rise-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void askWeather();
                }}
              >
                <label htmlFor="fit-city" className="sr-only">
                  Your city
                </label>
                <input
                  id="fit-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="field !text-base"
                  placeholder="Your city"
                  autoComplete="address-level2"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={weatherBusy || !city.trim()}
                  className="btn-primary !px-4 disabled:opacity-50"
                >
                  {weatherBusy ? <Spinner className="h-4 w-4" /> : "Check"}
                </button>
              </form>
              {weather && (
                <div className="mt-4 inline-flex animate-rise items-center gap-3 rounded-[3px] border border-brass bg-iris-soft px-4 py-2.5 text-sm text-ink">
                  <span className="font-display text-2xl text-brass">
                    {weather.temperatureC}°
                  </span>
                  <span>
                    {title(weather.description)} in <b>{weather.location}</b>.
                    Good to know.
                  </span>
                </div>
              )}
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy || !city.trim()}
                  onClick={() => void advance({ city: city.trim() }, 10)}
                  className="btn-primary disabled:opacity-50"
                >
                  Next
                </button>
                <Later onClick={() => void advance({}, 10)}>Skip</Later>
              </Actions>
            </>
          )}

          {/* 10 handle */}
          {name === "handle" && (
            <>
              <Who>Your name</Who>
              <Ask>
                How should friends <em className="text-brass">find you?</em>
              </Ask>
              <Lead>
                Friends see you by name. Your address on the circle is
                given to you; you can change it any time from your profile.
              </Lead>
              {claimed ? (
                <p className="mt-6 animate-rise-2 text-sm text-ink/60">
                  You go by <b className="text-ink">{user?.name ?? user?.firstName ?? claimed}</b>
                  {'. '}Your address is <span className="text-ink/45">/u/{claimed}</span>.
                </p>
              ) : (
                <form
                  className="mt-6 max-w-lg animate-rise-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void claim();
                  }}
                >
                  <div className="flex items-center gap-1 rounded-[3px] border border-ink/15 bg-surface px-3 focus-within:border-iris/70 focus-within:ring-2 focus-within:ring-iris/20">
                    <span className="text-ink/40">@</span>
                    <label htmlFor="fit-handle" className="sr-only">
                      Handle
                    </label>
                    <input
                      id="fit-handle"
                      value={handle}
                      onChange={(e) =>
                        setHandleText(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, "")
                            .slice(0, 20),
                        )
                      }
                      className="w-full border-0 bg-transparent py-3 text-base text-ink outline-none placeholder:text-ink/35"
                      placeholder="your_name"
                      autoCapitalize="none"
                      autoFocus
                    />
                  </div>
                  <p
                    className={`mt-2 text-sm ${handleState.ok ? "text-brass" : "text-ink/50"}`}
                    aria-live="polite"
                  >
                    {handleState.msg}
                  </p>
                </form>
              )}
              <Actions>
                {back}
                <button
                  type="button"
                  disabled={busy || (!claimed && !handleState.ok)}
                  onClick={() =>
                    claimed ? void advance({}, 11) : void claim()
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {claimed ? "Next" : "Claim it"}
                </button>
                {!claimed && (
                  <Later onClick={() => void advance({}, 11)}>Later</Later>
                )}
              </Actions>
            </>
          )}

          {/* 11 mirror */}
          {name === "mirror" && (
            <>
              <Who>The Mirror</Who>
              <Ask>
                Let the Mirror <em className="text-brass">see you.</em>
              </Ask>
              <Lead>
                One full-length photo and every look can be rendered on you, not
                on a model. Only you see it. Entirely optional.
              </Lead>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => void onPhoto(e)}
                className="hidden"
              />
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void onPhoto(e)}
                className="hidden"
              />
              <div className="mt-7 max-w-[260px] animate-rise-2">
                <div className="arch-bezel aspect-[3/4]">
                  <div
                    className="relative h-full w-full overflow-hidden"
                    style={{
                      borderRadius: "46% 46% 5px 5px / 28% 28% 5px 5px",
                      background:
                        "radial-gradient(76% 66% at 50% 30%, #211d17, #0c0b09 84%)",
                    }}
                  >
                    {photoUrl ? (
                      <img
                        src={resolveImageUrl(photoUrl)}
                        alt="You"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <p className="absolute inset-0 grid place-items-center px-6 text-center font-display text-base italic text-[#ECE5D8]/80">
                        Your reflection hangs here.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {!photoUrl && (
                <label className="mt-5 flex max-w-lg animate-rise-3 cursor-pointer items-start gap-3 text-sm text-ink/70">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-iris"
                  />
                  <span>
                    I’m happy for this photo to be used to render outfits on me.
                    It stays private and I can delete it any time.
                  </span>
                </label>
              )}
              <Actions>
                {back}
                {photoUrl ? (
                  <button
                    type="button"
                    onClick={() => void advance({}, 12)}
                    className="btn-primary"
                  >
                    Next
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!consent || photoBusy}
                      onClick={() => cameraInput.current?.click()}
                      className="btn-primary disabled:opacity-50"
                    >
                      {photoBusy ? "Saving…" : "Take a photo"}
                    </button>
                    <button
                      type="button"
                      disabled={!consent || photoBusy}
                      onClick={() => photoInput.current?.click()}
                      className="btn-ghost disabled:opacity-50"
                    >
                      Choose from gallery
                    </button>
                    <Later onClick={() => void advance({}, 12)}>Not now</Later>
                  </>
                )}
              </Actions>
            </>
          )}

          {/* 12 closet */}
          {name === "closet" && (
            <>
              <Who>Last</Who>
              <Ask>
                Three pieces, and your first look{" "}
                <em className="text-brass">hangs here.</em>
              </Ask>
              <Lead>
                A top, a bottom, shoes. Photograph them flat or on a hanger; the
                stylist does the rest.
              </Lead>
              <input
                ref={pieceCamera}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void onPieces(e)}
                className="hidden"
              />
              <input
                ref={pieceInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void onPieces(e)}
                className="hidden"
              />
              <div className="mt-7 grid max-w-xl animate-rise-2 grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => {
                  const it = shown[i];
                  return it ? (
                    <Arch key={it.id} aspect="aspect-[5/6]">
                      <img
                        src={resolveImageUrl(it.imageUrl)}
                        alt={it.subtype ?? it.category}
                        className={`relative z-[1] h-full w-full object-contain p-[8%] transition duration-700 ${it.status === "processing" ? "scale-95 opacity-40 blur-[2px]" : ""}`}
                      />
                      {it.status === "processing" && (
                        <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] text-brass">
                          developing
                        </span>
                      )}
                    </Arch>
                  ) : (
                    <div key={i} className="arch-bezel aspect-[5/6] opacity-50">
                      <div className="arch-niche flex h-full w-full items-center justify-center">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">
                          {["Top", "Bottom", "Shoes"][i]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Actions>
                {back}
                {ready >= MIN_PIECES ? (
                  <button
                    type="button"
                    onClick={() => void advance({}, LAST)}
                    className="btn-primary"
                  >
                    Compose my first look
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={adding > 0}
                      onClick={() => pieceCamera.current?.click()}
                      className="btn-primary disabled:opacity-50"
                    >
                      {adding > 0 ? "Adding…" : "Photograph a piece"}
                    </button>
                    <button
                      type="button"
                      disabled={adding > 0}
                      onClick={() => pieceInput.current?.click()}
                      className="btn-ghost disabled:opacity-50"
                    >
                      Choose photos
                    </button>
                    <Later onClick={() => void advance({}, LAST)}>
                      I’ll do this later
                    </Later>
                  </>
                )}
              </Actions>
              <p className="mt-4 text-xs text-ink/45">
                {ready >= MIN_PIECES
                  ? `${ready} pieces. That’s a look.`
                  : processing
                    ? "Developing… each piece takes a moment."
                    : `${Math.max(0, MIN_PIECES - pieces.length)} to go. Each one develops in front of you.`}
              </p>
            </>
          )}

          {/* 13 reveal */}
          {name === "reveal" && (
            <>
              <Who>Composed</Who>
              <Ask>
                {brief?.mode === "brief" ? (
                  <>
                    Tomorrow, <em className="text-brass">wear this.</em>
                  </>
                ) : revealed ? (
                  <>
                    Almost <em className="text-brass">there.</em>
                  </>
                ) : (
                  <>
                    Composing <em className="text-brass">your first look.</em>
                  </>
                )}
              </Ask>
              <Lead>
                {brief?.mode === "brief" && brief.brief
                  ? brief.brief.rationale
                  : revealed
                    ? "Your stylist has your measure. Three pieces in the closet, and the first look hangs here."
                    : DRESSING_LINES[revealLine]}
              </Lead>
              <div className="mt-7 max-w-2xl animate-rise-2">
                <div
                  className="p-[3px]"
                  style={{
                    borderRadius: "24% 24% 6px 6px / 9% 9% 6px 6px",
                    background:
                      "linear-gradient(160deg, var(--c-brass-hi), var(--c-brass) 45%, var(--c-brass-lo) 84%)",
                  }}
                >
                  <div
                    className="arch-niche relative aspect-[5/4] w-full"
                    style={{ borderRadius: "24% 24% 5px 5px / 9% 9% 5px 5px" }}
                  >
                    {!revealed && (
                      <span className="animate-filament absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/60 to-transparent" />
                    )}
                    {revealed && brief?.mode === "brief" && brief.brief && (
                      <div className="animate-mirror-reveal h-full w-full">
                        <FlatLay items={brief.brief.items} />
                        <span
                          aria-hidden
                          className="animate-arch-sweep pointer-events-none absolute inset-0 z-[3]"
                          style={{
                            background:
                              "linear-gradient(115deg, transparent 44%, var(--c-sheen) 49%, transparent 55%)",
                          }}
                        />
                      </div>
                    )}
                    {revealed && brief?.mode !== "brief" && (
                      <div className="relative z-[1] flex h-full w-full flex-col items-center justify-center gap-5 px-8 text-center">
                        {/* The three slots the look is waiting on — the same arches as the closet screen, so the ask is legible. */}
                        <div className="flex gap-3">
                          {["Top", "Bottom", "Shoes"].map((slot, i) => {
                            const it = shown[i];
                            return it ? (
                              <div key={it.id} className="arch-bezel h-24 w-20">
                                <div className="arch-niche h-full w-full">
                                  <img
                                    src={resolveImageUrl(it.imageUrl)}
                                    alt=""
                                    className="h-full w-full object-contain p-[10%]"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div
                                key={slot}
                                className="arch-bezel h-24 w-20 opacity-40"
                              >
                                <div className="arch-niche flex h-full w-full items-center justify-center">
                                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ink/40">
                                    {slot}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => go(12)}
                          className="btn-primary"
                        >
                          {pieces.length
                            ? "Add the missing pieces"
                            : "Add three pieces"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {revealed && (
                  <div className="plaque mt-5 animate-rise p-5 pl-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
                      The morning ritual
                    </p>
                    <p className="mt-1 font-display text-lg italic text-ink">
                      {brief?.mode === "brief"
                        ? "Want this waiting for you at 7 tomorrow?"
                        : "Once the closet has its three, want the look waiting for you at 7?"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {ritualSet ? (
                        <span className="btn-ghost !border-brass/50 !text-brass">
                          Set for 7:00
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={ritualBusy || !pushSupported()}
                          onClick={() => void wakeMe()}
                          className="btn-primary disabled:opacity-50"
                        >
                          {ritualBusy ? "Setting…" : "Wake me with it"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate("/", { replace: true })}
                        className="btn-ghost"
                      >
                        {ritualSet ? "Open Today" : "Not now"}
                      </button>
                    </div>
                    {!pushSupported() && (
                      <p className="mt-2 text-xs text-ink/45">
                        Notifications aren’t available in this browser; you can
                        set the ritual later from your Profile.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* the dossier */}
        <aside
          className="mt-10 lg:sticky lg:top-20 lg:mt-0 lg:self-start"
          aria-live="polite"
        >
          <div className="card p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brass">
              Your stylist’s notes
            </p>
            <p className="mt-1 font-display text-2xl font-medium text-ink">
              {user?.firstName ? `${user.firstName}.` : "A new client."}
            </p>
            {notes.length === 0 ? (
              <p className="mt-3 font-display text-sm italic text-ink/45">
                Nothing yet. Every answer becomes a line here.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {notes.map((n, i) => (
                  <li
                    key={n}
                    className="animate-rise relative pl-4 text-sm leading-snug text-ink/70"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-[7px] h-1.5 w-1.5 bg-brass"
                    />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
