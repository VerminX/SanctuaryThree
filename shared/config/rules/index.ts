import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const DEFAULT_CONFIG_ROOT = resolve(process.cwd(), 'shared/config/rules');

const PROBLEM_MAP_VERSION = 1;
const WOUND_SYNONYM_VERSION = 1;
const ICD10_WOUND_VERSION = 1;
const LCD_TERMS_VERSION = 1;

const PROBLEM_MAP_FILE = `icd10-problem-map.v${PROBLEM_MAP_VERSION}.json`;
const WOUND_SYNONYM_FILE = `wound-type-synonyms.v${WOUND_SYNONYM_VERSION}.json`;
const ICD10_WOUND_FILE = `icd10-wound-mappings.v${ICD10_WOUND_VERSION}.json`;
const LCD_TERMS_FILE = `lcd-specific-terms.v${LCD_TERMS_VERSION}.json`;

const problemMapSchema = z.object({
  version: z.number().int().positive(),
  mappings: z.record(z.string(), z.string())
});

const woundSynonymSchema = z.object({
  version: z.number().int().positive(),
  synonyms: z.record(z.string(), z.array(z.string().min(1)).nonempty())
});

const icd10WoundSchema = z.object({
  version: z.number().int().positive(),
  mappings: z.record(z.string(), z.string())
});

const lcdTermsSchema = z.object({
  version: z.number().int().positive(),
  terms: z.array(z.string().min(1)).nonempty()
});

type ProblemMapConfig = z.infer<typeof problemMapSchema>;
type WoundSynonymConfig = z.infer<typeof woundSynonymSchema>;
type Icd10WoundConfig = z.infer<typeof icd10WoundSchema>;
type LcdTermsConfig = z.infer<typeof lcdTermsSchema>;

interface CacheEntry<T> {
  data: T;
  mtimeMs: number;
}

const configCache = new Map<string, CacheEntry<unknown>>();

export class RulesConfigError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RulesConfigError';
  }
}

export class RulesConfigMissingError extends RulesConfigError {
  constructor(filePath: string) {
    super(`Rules configuration file not found: ${filePath}`);
    this.name = 'RulesConfigMissingError';
  }
}

export class RulesConfigParseError extends RulesConfigError {
  constructor(filePath: string, cause: unknown) {
    super(`Unable to parse rules configuration file: ${filePath}`, cause);
    this.name = 'RulesConfigParseError';
  }
}

export class RulesConfigValidationError extends RulesConfigError {
  constructor(filePath: string, details: string, cause?: unknown) {
    super(`Rules configuration validation failed for ${filePath}: ${details}`, cause);
    this.name = 'RulesConfigValidationError';
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  Object.freeze(value);

  for (const key of Object.getOwnPropertyNames(value)) {
    const property = (value as Record<string, unknown>)[key];
    if (property && typeof property === 'object' && !Object.isFrozen(property)) {
      deepFreeze(property);
    }
  }

  for (const symbol of Object.getOwnPropertySymbols(value)) {
    const property = (value as Record<string | symbol, unknown>)[symbol];
    if (property && typeof property === 'object' && !Object.isFrozen(property)) {
      deepFreeze(property);
    }
  }

  return value;
}

function getConfigRoot(): string {
  const override = process.env.RULES_CONFIG_ROOT;
  if (override && override.trim().length > 0) {
    return resolve(override);
  }
  return DEFAULT_CONFIG_ROOT;
}

function loadJsonConfig<T>(filename: string, schema: z.ZodType<T>, expectedVersion: number): T {
  const configRoot = getConfigRoot();
  const filePath = resolve(configRoot, filename);

  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RulesConfigMissingError(filePath);
    }
    throw new RulesConfigError(`Unable to access rules configuration file: ${filePath}`, error);
  }

  const cacheKey = filePath;
  const cached = configCache.get(cacheKey) as CacheEntry<T> | undefined;
  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.data;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new RulesConfigError(`Unable to read rules configuration file: ${filePath}`, error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new RulesConfigParseError(filePath, error);
  }

  let parsed: T;
  try {
    parsed = schema.parse(parsedJson);
  } catch (error) {
    throw new RulesConfigValidationError(filePath, 'Schema validation error', error);
  }

  if ((parsed as { version: number }).version !== expectedVersion) {
    throw new RulesConfigValidationError(filePath, `Expected version ${expectedVersion} but found ${(parsed as { version: number }).version}`);
  }

  const frozen = deepFreeze(parsed);
  configCache.set(cacheKey, { data: frozen, mtimeMs: stats.mtimeMs });
  return frozen;
}

export function clearRulesConfigCache(): void {
  configCache.clear();
}

export function getProblemICD10Mappings(): Readonly<Record<string, string>> {
  const config = loadJsonConfig<ProblemMapConfig>(PROBLEM_MAP_FILE, problemMapSchema, PROBLEM_MAP_VERSION);
  return config.mappings;
}

export function getWoundTypeSynonyms(): Readonly<Record<string, readonly string[]>> {
  const config = loadJsonConfig<WoundSynonymConfig>(WOUND_SYNONYM_FILE, woundSynonymSchema, WOUND_SYNONYM_VERSION);
  return config.synonyms;
}

export function getICD10WoundMappings(): Readonly<Record<string, string>> {
  const config = loadJsonConfig<Icd10WoundConfig>(ICD10_WOUND_FILE, icd10WoundSchema, ICD10_WOUND_VERSION);
  return config.mappings;
}

export function getLCDSpecificTerms(): readonly string[] {
  const config = loadJsonConfig<LcdTermsConfig>(LCD_TERMS_FILE, lcdTermsSchema, LCD_TERMS_VERSION);
  return config.terms;
}
