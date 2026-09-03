/** Query keys owned by the fitting (the shared ones live in `@/src/lib/query`). */
export const fk = {
  quiz: ['fitting', 'quiz'] as const,
  firstBrief: ['fitting', 'first-brief'] as const,
}
