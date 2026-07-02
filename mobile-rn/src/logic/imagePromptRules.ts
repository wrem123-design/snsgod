export const DEFAULT_FORBIDDEN_PROMPT_RULES = [
  'Follow the requested prompt closely.',
  'Keep outfit, body fit, lighting, camera angle, and background coherent.',
  'Do not add unrelated random outfit parts.',
  'Avoid under 19.',
  'Avoid duplicate face.',
  'Avoid clone.',
  'Avoid text.',
  'Avoid logo.',
  'Avoid watermark.',
  'Avoid duplicated faces.',
  'Avoid broken anatomy.',
  'Avoid UI.',
  'Avoid random mixed clothing parts.',
  'Avoid gown when a casual outfit is requested.',
  'Avoid swimsuit unless the selected outfit preset or user prompt requests swimwear.',
  'Avoid fantasy armor unless the selected outfit preset or user prompt requests fantasy styling.',
  'Avoid leather catsuit unless the selected outfit preset or user prompt requests latex or catsuit styling.',
  'Avoid evening gown unless the selected outfit preset or user prompt requests formal evening styling.',
  'Avoid bodycon dress when the selected outfit calls for loose preppy or uniform styling.',
  'Avoid loose sweater when the selected outfit calls for tight nightlife styling.',
  'Avoid lace lingerie unless the selected outfit preset or user prompt requests lingerie styling.',
  'Avoid business blazer when the selected outfit calls for sporty or casual styling.',
  'Avoid summer bikini unless the selected outfit preset or user prompt requests beach or swim styling.',
  'Avoid school blazer only when the selected outfit is not uniform or preppy.',
  'Avoid formal skirt suit unless the selected outfit preset or user prompt requests office styling.',
  'Avoid athletic leggings unless the selected outfit preset or user prompt requests sporty styling.',
  'Avoid heavy coat unless the selected outfit preset or user prompt requests winter styling.',
  'Avoid latex unless the selected outfit preset or user prompt requests latex styling.',
  'Avoid sportswear unless the selected outfit preset or user prompt requests sporty styling.',
  'Avoid school tie only when the selected outfit is not uniform or preppy.',
  'Avoid thigh-high boots unless the selected outfit preset or user prompt requests that styling.',
  'Avoid swimwear unless the selected outfit preset or user prompt requests swimwear.',
  'Avoid sporty casual when the selected outfit calls for formal, office, fantasy, or evening styling.',
  'Avoid cotton casual when the selected outfit calls for metallic, latex, or fantasy styling.'
].join('\n');

const LEGACY_DEFAULT_FORBIDDEN_PROMPT_RULES = 'Global image rules: follow the user-requested prompt closely. Do not add text, logo, watermark, UI, duplicated faces, broken anatomy, or unrelated random outfit parts. Keep outfit, body fit, lighting, camera angle, and background coherent.';

export function editableForbiddenPromptRules(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_FORBIDDEN_PROMPT_RULES;
  const text = String(value);
  if (text.trim() === LEGACY_DEFAULT_FORBIDDEN_PROMPT_RULES) return DEFAULT_FORBIDDEN_PROMPT_RULES;
  return text;
}
