# GymGym interface system

Hallmark v2.0.0, application scope. Baseline: e7122ee12f46280d82d2830b1cac5455a29ab07a.

## Purpose

The current training session is the main task. Today’s routine is the first object on Home; sets are a ledger during training. Templates are reference rows, not competing feature cards. Statistics remain secondary to recording a set.

## Material and hierarchy

- Keep the existing dark and lime identity. Neutral surfaces use a muted green tint. Lime identifies the main action, current navigation and completed sets.
- Use the system sans face for Chinese text and controls. Tabular numerals keep weight, reps, time and statistics stable. Monospace is reserved for measurements, not section labels.
- Tokens live in the `:root` block of `src/index.css`. Cards, inputs, selected tabs, supersets, warning and heatmap colors share the same system.
- Limit the content column to 640px. Two columns are only for short routine choices and the existing body map. Long text and controls wrap inside the column.
- Home gives today’s workout a larger solid panel. Templates use quiet divided rows. History statistics form one summary strip. Drawers use the same solid surfaces.
- Preserve the fixed `inset: 0` app shell and the in-flow bottom navigation used for iOS PWA stability. Rest controls occupy a bounded floating strip above it.

## Controls and states

Fields and set completion targets are at least 44px tall. Inputs have a visible border and instant lime focus ring. Disabled controls are visibly muted. Completed values remain readable. Reduced-motion disables transitions and drawer animation. Error, empty and saved states keep their existing logic and wording except decorative emoji and metadata separators.

## Kept

All five routes, existing forms, handlers, test hooks, workout calculations, progression, persistence, backup, sync and notifications. No storage migration, backend change, new dependency or route deletion.

## Review

Capture Home and each of the five routes at phone and desktop sizes. Seed only synthetic workout data for the training and history screenshots. Check 320px, 390px and desktop layouts, especially cardio fields, RIR, keyboard avoidance and rest bar spacing. Browser checks do not establish real iPhone safe-area behavior; verify that on device before production release.
