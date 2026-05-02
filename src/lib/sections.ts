// Single source of truth for the section catalogue.
//
// Each section maps to a Polymarket Gamma-API tag slug. The whole UI —
// the dynamic /[section] route, the Nav, the home-page opportunity
// scanner, the basket section-locking — is driven from this list, so
// adding or removing a category is a one-line change.
//
// Tag slugs were probed against the live Gamma API to confirm they
// return events. If Polymarket retires or renames a tag, the only
// place to update is the `tagSlug` here.

export interface SectionConfig {
  id: string;
  label: string; // shown in nav, headers, banners
  tagSlug: string; // Polymarket Gamma `tag_slug` filter
  subtitle: string; // short description on the section page
}

export const SECTIONS: readonly SectionConfig[] = [
  {
    id: "politics",
    label: "Politics",
    tagSlug: "politics",
    subtitle:
      "Elections, leadership challenges, geopolitical events. The deepest category on Polymarket.",
  },
  {
    id: "sports",
    label: "Sports",
    tagSlug: "sports",
    subtitle:
      "Tournament winners, championship futures, and other multi-team mutex events.",
  },
  {
    id: "crypto",
    label: "Crypto",
    tagSlug: "crypto",
    subtitle:
      "Token prices, protocol launches, regulatory outcomes — high-volatility, high-volume on Polymarket.",
  },
  {
    id: "forex",
    label: "Forex",
    tagSlug: "forex",
    subtitle: "Currency-pair price targets and central-bank-driven outcomes.",
  },
  {
    id: "tech",
    label: "Tech",
    tagSlug: "tech",
    subtitle: "IPOs, product launches, M&A and corporate technology outcomes.",
  },
  {
    id: "ai",
    label: "AI",
    tagSlug: "ai",
    subtitle:
      "Frontier-lab releases, benchmark milestones, regulation and adoption events.",
  },
  {
    id: "business",
    label: "Business",
    tagSlug: "business",
    subtitle: "Earnings, deals, executive moves, broader macroeconomic outcomes.",
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    tagSlug: "geopolitics",
    subtitle: "Conflicts, treaties, multilateral negotiations, world-stage moves.",
  },
  {
    id: "pop-culture",
    label: "Pop Culture",
    tagSlug: "pop-culture",
    subtitle: "Celebrity, entertainment and consumer-cultural events.",
  },
  {
    id: "climate",
    label: "Climate",
    tagSlug: "climate",
    subtitle: "Temperature thresholds, sea-ice extents, weather records.",
  },
] as const;

export type Section = (typeof SECTIONS)[number]["id"];

const SECTION_BY_ID: Map<string, SectionConfig> = new Map(
  SECTIONS.map((s) => [s.id, s]),
);
const SECTION_BY_TAG: Map<string, SectionConfig> = new Map(
  SECTIONS.map((s) => [s.tagSlug, s]),
);

export function getSectionById(id: string): SectionConfig | undefined {
  return SECTION_BY_ID.get(id);
}

export function getSectionByTagSlug(slug: string): SectionConfig | undefined {
  return SECTION_BY_TAG.get(slug);
}

export function isValidSectionId(id: string): id is Section {
  return SECTION_BY_ID.has(id);
}
