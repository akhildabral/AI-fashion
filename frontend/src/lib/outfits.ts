import { apiFetch } from "./api";
import type { WardrobeItem } from "./types";

// The Outfits room: every look the closet can make — saved, worn, suggested,
// or composed by hand — and the pairing intelligence under every piece.

export interface Outfit {
  id: string;
  itemIds: string[];
  items: WardrobeItem[];
  rationale: string | null;
  eventType: string;
  provenance: "ai" | "user" | "copied";
  rating: number | null;
  wearCount: number;
  createdAt: string;
}

export interface Validation {
  ok: boolean;
  score: number;
  violations: { rule: string; message: string }[];
  warnings: { rule: string; message: string }[];
  /** 0–10 average pair quality across the pieces. */
  pairQuality: number;
}

export interface Suggested {
  items: WardrobeItem[];
  rationale: string;
  validation: {
    ok: boolean;
    score: number;
    violations: { rule: string; message: string }[];
    warnings: { rule: string; message: string }[];
  };
}

export interface PairsResponse {
  pairs: { item: WardrobeItem; score: number }[];
  outfits: { items: WardrobeItem[]; score: number }[];
  outfitCount: number;
}

export function getOutfits() {
  return apiFetch<{ outfits: Outfit[] }>("/outfits");
}

export function saveOutfit(body: {
  itemIds: string[];
  rationale?: string | null;
  eventType?: string;
  provenance?: "ai" | "user" | "copied";
}) {
  return apiFetch<{ outfit: Outfit }>("/outfits", { method: "POST", body });
}

export function deleteOutfit(id: string) {
  return apiFetch<{ ok: true }>(`/outfits/${id}`, { method: "DELETE" });
}

export function validateOutfit(itemIds: string[], eventType?: string) {
  return apiFetch<{ validation: Validation }>("/outfits/validate", {
    method: "POST",
    body: { itemIds, eventType },
  });
}

/** The engine, with an optional piece pinned into every outfit. */
export function suggestOutfits(body: {
  occasion: string;
  eventType?: string;
  pin?: string;
}) {
  return apiFetch<{ outfits: Suggested[] }>("/wardrobe/outfit", {
    method: "POST",
    body,
  });
}

export function getPairs(itemId: string) {
  return apiFetch<PairsResponse>(`/wardrobe/${itemId}/pairs`);
}

export const EVENT_LABEL: Record<string, string> = {
  work: "Work",
  casual: "Weekend",
  evening: "Evening",
  occasion: "Occasion",
  athletic: "Training",
  travel: "Travel",
};

export interface StoryResponse {
  wearCount: number;
  lastWorn: string | null;
  firstWorn: string | null;
  costPerWear: number | null;
  wornWith: { item: WardrobeItem; times: number }[];
  days: string[];
  idleDays: number | null;
}

export function getStory(itemId: string) {
  return apiFetch<StoryResponse>(`/wardrobe/${itemId}/story`);
}
