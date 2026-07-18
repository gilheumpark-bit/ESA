import type { MetadataRoute } from 'next';

/**
 * Sitemap Generation
 *
 * Static pages + all 56 calculator routes.
 * Every id below MUST be a valid key in CALCULATOR_NAMES/CALCULATOR_PARAMS
 * (src/app/(with-nav)/calc/[category]/[id]/page.tsx). category is display-only
 * and does not affect route resolution — the calc route keys solely off id.
 */

const BASE_URL = 'https://esva.engineer';

/** All calculator routes: { category, id } — id must match a real CALCULATOR_NAMES key */
const CALCULATOR_ROUTES: { category: string; id: string }[] = [
  // Power basics
  { category: 'power', id: 'single-phase-power' },
  { category: 'power', id: 'three-phase-power' },
  { category: 'power', id: 'power-factor' },
  { category: 'power', id: 'reactive-power' },
  { category: 'power', id: 'demand-diversity' },
  { category: 'power', id: 'max-demand' },
  { category: 'power', id: 'power-loss' },
  // Voltage drop
  { category: 'voltage-drop', id: 'voltage-drop' },
  { category: 'voltage-drop', id: 'three-phase-vd' },
  { category: 'voltage-drop', id: 'complex-voltage-drop' },
  { category: 'voltage-drop', id: 'busbar-vd' },
  { category: 'voltage-drop', id: 'country-compare-vd' },
  // Cable
  { category: 'cable', id: 'cable-sizing' },
  { category: 'cable', id: 'awg-converter' },
  { category: 'cable', id: 'ampacity-compare' },
  { category: 'cable', id: 'cable-impedance' },
  { category: 'cable', id: 'temp-correction' },
  // Transformer
  { category: 'transformer', id: 'transformer-capacity' },
  { category: 'transformer', id: 'transformer-loss' },
  { category: 'transformer', id: 'transformer-efficiency' },
  { category: 'transformer', id: 'impedance-voltage' },
  { category: 'transformer', id: 'inrush-current' },
  { category: 'transformer', id: 'parallel-operation' },
  // Protection
  { category: 'protection', id: 'short-circuit' },
  { category: 'protection', id: 'breaker-sizing' },
  { category: 'protection', id: 'earth-fault' },
  { category: 'protection', id: 'rcd-sizing' },
  { category: 'protection', id: 'relay-basic' },
  // Grounding
  { category: 'grounding', id: 'ground-resistance' },
  { category: 'grounding', id: 'ground-conductor' },
  { category: 'grounding', id: 'equipotential-bonding' },
  { category: 'grounding', id: 'lightning-protection' },
  // Motor
  { category: 'motor', id: 'motor-capacity' },
  { category: 'motor', id: 'starting-current' },
  { category: 'motor', id: 'motor-efficiency' },
  { category: 'motor', id: 'inverter-capacity' },
  { category: 'motor', id: 'motor-pf-correction' },
  { category: 'motor', id: 'braking-resistor' },
  // Renewable / ESS
  { category: 'renewable', id: 'solar-generation' },
  { category: 'renewable', id: 'battery-capacity' },
  { category: 'renewable', id: 'solar-cable' },
  { category: 'renewable', id: 'pcs-capacity' },
  { category: 'renewable', id: 'grid-connect' },
  // Substation
  { category: 'substation', id: 'substation-capacity' },
  { category: 'substation', id: 'ct-sizing' },
  { category: 'substation', id: 'vt-sizing' },
  { category: 'substation', id: 'surge-arrester' },
  { category: 'substation', id: 'ups-capacity' },
  { category: 'substation', id: 'emergency-generator' },
  // Lighting
  { category: 'lighting', id: 'illuminance' },
  { category: 'lighting', id: 'energy-saving' },
  // Global
  { category: 'global', id: 'ampacity-global-compare' },
  { category: 'global', id: 'awg-converter-full' },
  { category: 'global', id: 'frequency-compare' },
  { category: 'global', id: 'nec-load-calc' },
  // AI
  { category: 'ai', id: 'token-cost' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/calc`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/community`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/settings`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Dynamic calculator pages
  const calcPages: MetadataRoute.Sitemap = CALCULATOR_ROUTES.map(({ category, id }) => ({
    url: `${BASE_URL}/calc/${category}/${id}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...calcPages];
}
