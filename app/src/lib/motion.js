// The motion system. Every animation in the OS reads its timing from here, so motion is one
// decision rather than forty scattered ones.
//
// The rule that keeps this from turning the product loud again: **motion must do a job.**
// It either (a) shows state changing, (b) carries continuity between two states so the eye can
// follow one thing moving instead of two things swapping, or (c) confirms an action landed.
// Motion that does none of those is decoration, and decoration is what made eight KPI cards
// spring-scale into place and read as a loading screen. Restraint is not the absence of motion;
// it is motion that only appears where it explains something.

// Durations, in seconds. Nothing in an admin UI needs longer than a QUART.
export const D = {
  INSTANT: 0.12,   // hover, focus, a colour change
  QUICK: 0.2,      // a chip toggling, a row reordering
  BASE: 0.28,      // an element entering, a panel opening
  SLOW: 0.42,      // a full view transition — rare
};

// One easing for almost everything: Apple's standard curve. Decelerate for entrances, so the
// element arrives settling rather than braking.
export const E = {
  STANDARD: [0.25, 0.1, 0.25, 1],
  OUT: [0.16, 1, 0.3, 1],
  IN: [0.4, 0, 1, 1],
};

// A glide that carries a shared element (the nav indicator) between positions. Tuned to land
// without overshoot — a bouncing selection marker is the tell of a UI showing off.
export const GLIDE = { type: 'spring', stiffness: 520, damping: 44, mass: 0.7 };

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Wrap any variant set. When the viewer has asked for reduced motion they get the END state
 * immediately — never a slower version of the same movement, and never nothing at all.
 * Reduced motion is an accessibility setting, not a performance one: the information the
 * animation carried must still arrive, just without the travel.
 */
export const still = (variants) =>
  prefersReducedMotion()
    ? { initial: variants.animate ?? {}, animate: variants.animate ?? {}, exit: variants.animate ?? {} }
    : variants;

// ── the sanctioned set ────────────────────────────────────────────────────────
// Adding a variant here is a deliberate act. If a new animation does not fit one of these,
// ask what job it is doing before inventing another.

/** An element arriving: a short rise, no scale. Scale-in reads as a popup, not a panel. */
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: D.BASE, ease: E.OUT } },
  exit: { opacity: 0, y: 4, transition: { duration: D.QUICK, ease: E.IN } },
};

/** A list arriving. The stagger is small enough to read as one gesture, not a cascade. */
export const list = { animate: { transition: { staggerChildren: 0.03 } } };

/** A row that moved because the data changed under it — the eye follows the row. */
export const row = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: D.QUICK, ease: E.STANDARD } },
  exit: { opacity: 0, transition: { duration: D.INSTANT } },
  layout: { duration: D.QUICK, ease: E.STANDARD },
};

/** A panel or sheet opening from an action the person took. */
export const panel = {
  initial: { opacity: 0, y: -6, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: D.QUICK, ease: E.OUT } },
  exit: { opacity: 0, y: -4, scale: 0.99, transition: { duration: D.INSTANT, ease: E.IN } },
};

export default { D, E, GLIDE, still, enter, list, row, panel, prefersReducedMotion };
