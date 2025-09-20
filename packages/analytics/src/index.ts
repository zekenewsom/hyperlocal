import { FeatureEngine } from './feature-engine.js';
const g = (globalThis as any);
if (!g.__FEATURE_ENGINE__) g.__FEATURE_ENGINE__ = new FeatureEngine();
export const featureEngine = g.__FEATURE_ENGINE__ as FeatureEngine;
export * from './feature-engine.js';

