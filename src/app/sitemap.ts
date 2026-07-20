import type { MetadataRoute } from 'next';

import { CALCULATOR_REGISTRY } from '@/engine/calculators';

/**
 * Sitemap generation uses the calculator registry as its single source of
 * truth so retired or imaginary calculator URLs cannot drift into search.
 */

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || 'https://esva.engineer';
  try {
    const parsed = new URL(configured);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : 'https://esva.engineer';
  } catch {
    return 'https://esva.engineer';
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const lastModified = new Date();
  const staticPages: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  }> = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/calc', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/search', changeFrequency: 'daily', priority: 0.9 },
    { path: '/standards', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/tools/studio', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/tools/sld', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/community', changeFrequency: 'daily', priority: 0.7 },
    { path: '/contact', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  ];

  const calculatorPages: MetadataRoute.Sitemap = Array.from(CALCULATOR_REGISTRY.values())
    .map((calculator) => ({
      url: `${baseUrl}/calc/${calculator.category}/${calculator.id}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));

  return [
    ...staticPages.map((page) => ({
      url: `${baseUrl}${page.path}`,
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...calculatorPages,
  ];
}
