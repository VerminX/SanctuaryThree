import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import {
  clearRulesConfigCache,
  getICD10WoundMappings,
  getLCDSpecificTerms,
  getProblemICD10Mappings,
  getWoundTypeSynonyms,
  RulesConfigParseError,
  RulesConfigValidationError
} from '../config/rules';

function writeValidRuleFiles(root: string): void {
  writeFileSync(
    join(root, 'icd10-problem-map.v1.json'),
    JSON.stringify(
      {
        version: 1,
        mappings: {
          'test description': 'T00.000',
          'dfu': 'E11.621'
        }
      },
      null,
      2
    ),
    'utf-8'
  );

  writeFileSync(
    join(root, 'wound-type-synonyms.v1.json'),
    JSON.stringify(
      {
        version: 1,
        synonyms: {
          diabetic_foot_ulcer: ['dfu', 'diabetic foot ulcer'],
          test_type: ['test synonym']
        }
      },
      null,
      2
    ),
    'utf-8'
  );

  writeFileSync(
    join(root, 'icd10-wound-mappings.v1.json'),
    JSON.stringify(
      {
        version: 1,
        mappings: {
          'E11.6': 'diabetic_foot_ulcer',
          'T00.0': 'test_type'
        }
      },
      null,
      2
    ),
    'utf-8'
  );

  writeFileSync(
    join(root, 'lcd-specific-terms.v1.json'),
    JSON.stringify(
      {
        version: 1,
        terms: ['skin substitute', 'test term']
      },
      null,
      2
    ),
    'utf-8'
  );
}

describe('rules loader - default configuration', () => {
  beforeEach(() => {
    clearRulesConfigCache();
    delete process.env.RULES_CONFIG_ROOT;
  });

  it('loads bundled configuration data', () => {
    const problemMap = getProblemICD10Mappings();
    expect(problemMap['diabetic foot ulcer']).toBe('E11.621');

    const synonyms = getWoundTypeSynonyms();
    expect(synonyms.diabetic_foot_ulcer).toContain('dfu');

    const icdMappings = getICD10WoundMappings();
    expect(icdMappings['L89']).toBe('pressure_ulcer');

    const lcdTerms = getLCDSpecificTerms();
    expect(lcdTerms).toContain('skin substitute');
  });
});

describe('rules loader - configurable root', () => {
  let originalRoot: string | undefined;
  let tempRoot: string;

  beforeEach(() => {
    clearRulesConfigCache();
    originalRoot = process.env.RULES_CONFIG_ROOT;
    tempRoot = mkdtempSync(join(tmpdir(), 'rules-config-'));
    process.env.RULES_CONFIG_ROOT = tempRoot;
    writeValidRuleFiles(tempRoot);
  });

  afterEach(() => {
    clearRulesConfigCache();
    if (originalRoot === undefined) {
      delete process.env.RULES_CONFIG_ROOT;
    } else {
      process.env.RULES_CONFIG_ROOT = originalRoot;
    }
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('caches and invalidates when files change', async () => {
    const firstRead = getProblemICD10Mappings();
    const secondRead = getProblemICD10Mappings();
    expect(secondRead).toBe(firstRead);

    await wait(25);

    writeFileSync(
      join(tempRoot, 'icd10-problem-map.v1.json'),
      JSON.stringify(
        {
          version: 1,
          mappings: {
            'test description': 'T00.000',
            'dfu': 'E11.622'
          }
        },
        null,
        2
      ),
      'utf-8'
    );

    const thirdRead = getProblemICD10Mappings();
    expect(thirdRead).not.toBe(firstRead);
    expect(thirdRead['dfu']).toBe('E11.622');
  });

  it('throws a parse error when JSON is invalid', () => {
    clearRulesConfigCache();
    writeFileSync(join(tempRoot, 'icd10-problem-map.v1.json'), '{ invalid json', 'utf-8');

    expect(() => getProblemICD10Mappings()).toThrow(RulesConfigParseError);
  });

  it('throws validation error when version mismatches file name', () => {
    clearRulesConfigCache();
    writeFileSync(
      join(tempRoot, 'icd10-problem-map.v1.json'),
      JSON.stringify({ version: 2, mappings: { dfu: 'E11.621' } }),
      'utf-8'
    );

    expect(() => getProblemICD10Mappings()).toThrow(RulesConfigValidationError);
  });

  it('throws validation error for malformed synonym entries', () => {
    clearRulesConfigCache();
    writeFileSync(
      join(tempRoot, 'wound-type-synonyms.v1.json'),
      JSON.stringify({ version: 1, synonyms: { diabetic_foot_ulcer: [] } }),
      'utf-8'
    );

    expect(() => getWoundTypeSynonyms()).toThrow(RulesConfigValidationError);
  });
});
