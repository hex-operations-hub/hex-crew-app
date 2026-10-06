// Brand config lives here, separate from the portal logic, so the same app
// can be re-skinned for Matt's other brands later: each brand gets its own
// portal template folder under portal/ and its own entry like this one.
// Portal templates the app can serve (portal/<key>/portal.liquid).
export type PortalKey = "hex" | "hex-v2";

export const brand = {
  name: "HEX Energy",
  programme: "HEX Crew",
  // Portal template, rendered by Shopify inside the store's theme.
  //   "hex-v2": dark landing (Oct 2026)   "hex": original page, moved as-is
  portal: "hex-v2" as PortalKey,
  // Go-live visibility per tab (Matt's decisions, Sept 2026).
  //   leaderboard: "show" | "blur" | "hide"   -> live but blurred
  //   creatorView: "show" | "hide"            -> phase 2
  tabs: {
    leaderboard: "blur",
    creatorView: "hide",
  },
  colors: {
    bg: "#f5f4ee",
    ink: "#0a0a0a",
    mute: "#6a6a6a",
    border: "#e8e6dd",
    gold: "#b88f2a",
  },
} as const;
