// Short feedback stays separate from spring-driven spatial changes.
export const MOTION = {
  micro: 0.14,
  content: 0.18,
  exit: 0.12,
  layout: 0.36,
  spatial: { type: "spring" as const, duration: 0.36, bounce: 0 },
  result: 0.28,
  ease: [0.2, 0, 0, 1] as const,
  spring: { type: "spring" as const, stiffness: 430, damping: 38 },
  sort: { duration: 280, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)", idle: true },
};
