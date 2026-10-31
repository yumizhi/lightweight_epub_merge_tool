// Short feedback stays separate from spring-driven spatial changes.
export const MOTION = {
  micro: 0.14,
  content: 0.18,
  result: 0.28,
  ease: [0.2, 0, 0, 1] as const,
  spring: { type: "spring" as const, stiffness: 430, damping: 38 },
  sort: { duration: 280, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)", idle: true },
};
