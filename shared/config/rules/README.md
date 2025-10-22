# Wound Care Rules Configuration

This directory stores the Medicare LCD rule tables that drive eligibility validation and RAG scoring. Medical coding specialists can update these files without touching application code by following this workflow.

## Files

| File | Purpose |
| --- | --- |
| `icd10-problem-map.v1.json` | Maps free-text diagnosis descriptions to ICD-10 codes used during pre-check validation. |
| `wound-type-synonyms.v1.json` | Lists wound type synonyms used to expand search terms and scoring. |
| `icd10-wound-mappings.v1.json` | Associates ICD-10 prefixes with canonical wound types. |
| `lcd-specific-terms.v1.json` | Terms that signal wound-care LCD relevance during scoring and fallbacks. |

Each JSON document includes a `version` field that must match both the file suffix (for example `v1`) and the loader constant inside `shared/config/rules/index.ts`.

## Update Procedure for Medical Coders

1. **Create a new versioned file**
   - Copy the current file to `*.v{next}.json` (for example `icd10-problem-map.v2.json`).
   - Update the `version` field inside the JSON to the same number.
2. **Populate the new rules**
   - Keep all keys lower-cased; the services normalise input before matching.
   - Record the Medicare citation for each change in the accompanying change request or commit message so compliance can audit the source quickly.
3. **Notify engineering**
   - Share the new file path and citation references. Engineers will bump the version constant in `shared/config/rules/index.ts` so the platform uses the refreshed dataset.
4. **Validation checklist (run locally or request engineering support)**
   - `RULES_CONFIG_ROOT=<path-to-updated-directory> npx jest shared/__tests__/rulesLoader.test.ts` – validates JSON shape and caching safeguards.
   - `npx jest server/__tests__/integration/eligibility-simple.test.ts` – confirms eligibility scoring remains unchanged.
   - Spot-check the Eligibility Analysis page (`client/src/pages/eligibility.tsx`) by running an analysis to verify audit trails still show mapped ICD codes and LCD citations.
5. **Archive prior versions**
   - Leave older `*.v{n-1}.json` files in place to preserve historical audits; do not delete prior versions without compliance approval.

## Notes

- During testing you can point the loader at a working directory by exporting `RULES_CONFIG_ROOT`.
- The loader caches results and automatically reloads when timestamps change, so updates take effect without restarting the server once the new version constant is deployed.
- Never store PHI in these files; use ICD codes, wound type labels, and generic descriptors only.
