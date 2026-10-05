// Brand config lives here, separate from the portal logic, so the same app
// can be re-skinned for Matt's other brands later: each brand gets its own
// portal template folder under portal/ and its own entry like this one.
export const brand = {
  name: "HEX Energy",
  programme: "HEX Crew",
  // Portal template (portal/<key>/portal.liquid), rendered by Shopify inside
  // the store's theme. Register new keys in app/proxy/[[...path]]/route.ts.
  portal: "hex",
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
