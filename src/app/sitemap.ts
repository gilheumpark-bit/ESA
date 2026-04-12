import type { MetadataRoute } from 'next';

/**
 * Sitemap Generation
 *
 * Static pages + all 56 calculator routes (10 currently active + future).
 */

const BASE_URL = 'https://esva.engineer';

/** All calculator routes: { category, id } */
const CALCULATOR_ROUTES: { category: string; id: string }[] = [
  // Power basics
  { category: 'power', id: 'single-phase-power' },
  { category: 'power', id: 'three-phase-power' },
  { category: 'power', id: 'apparent-power' },
  { category: 'power', id: 'reactive-power' },
  { category: 'power', id: 'power-factor-correction' },
  // Voltage drop
  { category: 'voltage-drop', id: 'voltage-drop' },
  { category: 'voltage-drop', id: 'voltage-drop-3phase' },
  { category: 'voltage-drop', id: 'voltage-regulation' },
  // Cable
  { category: 'cable', id: 'cable-sizing' },
  { category: 'cable', id: 'cable-ampacity' },
  { category: 'cable', id: 'cable-derating' },
  { category: 'cable', id: 'cable-impedance' },
  { category: 'cable', id: 'conduit-fill' },
  // Transformer
  { category: 'transformer', id: 'transformer-capacity' },
  { category: 'transformer', id: 'transformer-losses' },
  { category: 'transformer', id: 'transformer-impedance' },
  { category: 'transformer', id: 'transformer-tap' },
  { category: 'transformer', id: 'transformer-parallel' },
  // Protection
  { category: 'protection', id: 'short-circuit' },
  { category: 'protection', id: 'breaker-sizing' },
  { category: 'protection', id: 'fuse-sizing' },
  { category: 'protection', id: 'relay-coordination' },
  { category: 'protection', id: 'arc-flash' },
  // Grounding
  { category: 'grounding', id: 'ground-resistance' },
  { category: 'grounding', id: 'ground-grid' },
  { category: 'grounding', id: 'step-touch-voltage' },
  { category: 'grounding', id: 'equipotential-bonding' },
  // Motor
  { category: 'motor', id: 'motor-starting' },
  { category: 'motor', id: 'motor-load' },
  { category: 'motor', id: 'motor-efficiency' },
  { category: 'motor', id: 'vfd-sizing' },
  { category: 'motor', id: 'motor-protection' },
  // Renewable / ESS
  { category: 'renewable', id: 'solar-generation' },
  { category: 'renewable', id: 'solar-sizing' },
  { category: 'renewable', id: 'battery-capacity' },
  { category: 'renewable', id: 'inverter-sizing' },
  { category: 'renewable', id: 'wind-power' },
  { category: 'renewable', id: 'ess-roi' },
  // Substation
  { category: 'substation', id: 'bus-bar-sizing' },
  { category: 'substation', id: 'ct-ratio' },
  { category: 'substation', id: 'pt-ratio' },
  { category: 'substation', id: 'switchgear-rating' },
  { category: 'substation', id: 'demand-load' },
  // Lighting
  { category: 'lighting', id: 'lux-calculation' },
  { category: 'lighting', id: 'lighting-layout' },
  { category: 'lighting', id: 'emergency-lighting' },
  { category: 'lighting', id: 'energy-saving' },
  // Global
  { category: 'global', id: 'nec-vs-kec' },
  { category: 'global', id: 'iec-conversion' },
  { category: 'global', id: 'unit-conversion' },
  { category: 'global', id: 'wire-gauge-convert' },
  // AI
  { category: 'ai', id: 'ai-cable-optimizer' },
  { category: 'ai', id: 'ai-load-scheduler' },
  { category: 'ai', id: 'ai-fault-diagnosis' },
  { category: 'ai', id: 'ai-design-review' },
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
