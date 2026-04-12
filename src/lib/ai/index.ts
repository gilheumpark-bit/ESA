/**
 * AI Module — Re-exports for logical grouping.
 * Import from '@/lib/ai' instead of individual files.
 */
export { PROVIDERS, type AIProvider, type AIModel } from '../ai-providers';
export { log as aiLog } from '../logger';
export { createLogger as createAILogger } from '../logger';
