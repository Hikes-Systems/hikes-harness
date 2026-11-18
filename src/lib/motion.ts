import type { Transition, Variants } from "framer-motion";

/** Shared spring curves. Subtle by default: short travel, no bounce unless asked. */
export const spring = {
  smooth: { type: "spring", stiffness: 260, damping: 32, mass: 0.8 },
  snappy: { type: "spring", stiffness: 420, damping: 34, mass: 0.6 },
  soft: { type: "spring", stiffness: 180, damping: 26, mass: 0.9 },
  bouncy: { type: "spring", stiffness: 500, damping: 28, mass: 0.7 },
} satisfies Record<string, Transition>;

export const ease = [0.22, 1, 0.36, 1] as const;

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, transition: { duration: 0.2, ease } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

export const pop: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.14 } },
};

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: -22 },
  show: { opacity: 1, x: 0, transition: spring.smooth },
  exit: { opacity: 0, x: -18, transition: { duration: 0.18 } },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: 22 },
  show: { opacity: 1, x: 0, transition: spring.smooth },
  exit: { opacity: 0, x: 18, transition: { duration: 0.18 } },
};

export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring.smooth },
};
