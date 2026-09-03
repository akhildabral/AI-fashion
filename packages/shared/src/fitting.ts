import { apiFetch } from "./api";
import type { StyleProfile } from "./types";

// The fitting's small helpers: save what the stylist has learned so far,
// check a handle, and let the weather answer back.

export type FittingPatch = Partial<
  Pick<
    StyleProfile,
    | "bodyType"
    | "heightCm"
    | "sizes"
    | "skinTone"
    | "styleVibe"
    | "budgetBand"
    | "avoidColors"
    | "city"
    | "styleFor"
    | "currency"
  >
> & {
  intents?: string[];
  occasions?: string[];
  fittingStep?: number;
  fittingDone?: boolean;
  units?: "metric" | "imperial" | null;
};

/** The way out: the account and every file, after typing the email to confirm. */
export function deleteAccount(confirm: string) {
  return apiFetch<void>("/auth/me", { method: "DELETE", body: { confirm } });
}

export function updateName(firstName: string, lastName: string | null) {
  return apiFetch<{ user: import("./types").User }>("/auth/me", { method: "PATCH", body: { firstName, lastName } });
}

export function saveFitting(patch: FittingPatch) {
  return apiFetch<{ profile: StyleProfile }>("/profile", {
    method: "PUT",
    body: patch,
  });
}

export function checkHandle(handle: string) {
  return apiFetch<{ handle: string; available: boolean; reason?: string }>(
    `/social/handle/available?handle=${encodeURIComponent(handle)}`,
  );
}

export function weatherFor(city: string) {
  return apiFetch<{
    ok: boolean;
    location: string;
    temperatureC?: number;
    description?: string;
  }>(`/weather?city=${encodeURIComponent(city)}`);
}
