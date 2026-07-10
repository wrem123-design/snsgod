export type CanonicalPersonaCharacter = {
  id: string;
  name: string;
  handle?: string;
  prompt?: string;
  language?: unknown;
  messageStyle?: unknown;
  responseTime?: unknown;
  thinkingTime?: unknown;
  reactivity?: unknown;
  tone?: unknown;
};

export type CanonicalPersonaContext = {
  userVisibleName?: string;
  userProfile?: string;
  relationshipNote?: string;
  memoryBlock?: string;
  memoryVisibility: 'private' | 'group_public';
};

export type CanonicalPersonaBlock = {
  id: string;
  content: string;
  enabled?: boolean;
  priority: number;
  required?: boolean;
};

function personaId(character: CanonicalPersonaCharacter): string {
  return String(character.id || character.name || 'character').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function canonicalPersonaCoreBlocks(character: CanonicalPersonaCharacter, defaultLanguage: string): CanonicalPersonaBlock[] {
  const id = personaId(character);
  const language = String(character.language || defaultLanguage || 'Korean');
  return [
    {
      id: `persona.${id}.identity`,
      content: [
        '## Canonical character identity',
        `Character id: ${character.id}.`,
        `Character name: ${character.name}.`,
        character.handle ? `Character handle: @${character.handle}.` : '',
        `Character profile: ${String(character.prompt || '(empty)')}`,
        'Keep this identity consistent in every channel. Never borrow another character identity or write as the user.',
      ].filter(Boolean).join('\n'),
      priority: 100,
      required: true,
    },
    {
      id: `persona.${id}.voice`,
      content: [
        '## Canonical voice and behavior',
        `Message style: ${String(character.messageStyle || 'balanced')}.`,
        `Behavior sliders: response=${String(character.responseTime ?? 'default')}, thinking=${String(character.thinkingTime ?? 'default')}, reactivity=${String(character.reactivity ?? 'default')}, tone=${String(character.tone ?? 'default')}.`,
        'Preserve the profile speech habits, emotional edge, initiative, and relationship attitude across chat, proactive messages, groups, and calls.',
      ].join('\n'),
      priority: 95,
      required: true,
    },
    {
      id: `persona.${id}.language`,
      content: `## Canonical output language\nUse natural ${language}. Character language overrides the global language in every channel.`,
      priority: 95,
      required: true,
    },
  ];
}

export function canonicalPersonaContextBlocks(character: CanonicalPersonaCharacter, context: CanonicalPersonaContext): CanonicalPersonaBlock[] {
  const id = personaId(character);
  const relationship = [
    '## Canonical relationship context',
    context.userVisibleName ? `User visible name: ${context.userVisibleName}.` : '',
    context.userProfile ? `User profile: ${context.userProfile}` : '',
    context.relationshipNote ? `Relationship note: ${context.relationshipNote}` : '',
  ].filter(Boolean).join('\n');
  const memoryGuard = context.memoryVisibility === 'private'
    ? 'Private factual memory allowed for this character and user. Use facts naturally without quoting hidden memory text.'
    : 'Group-public memory only. Never expose private_with_user facts, private hints, or another room hidden context.';
  return [
    { id: `persona.${id}.relationship`, content: relationship, enabled: relationship.length > 0, priority: 85 },
    {
      id: `persona.${id}.memory`,
      content: ['## Canonical memory boundary', memoryGuard, String(context.memoryBlock || '(no relevant memory)')].join('\n'),
      priority: 80,
    },
  ];
}

export function canonicalPersonaBlocks(
  character: CanonicalPersonaCharacter,
  defaultLanguage: string,
  context: CanonicalPersonaContext,
): CanonicalPersonaBlock[] {
  return [
    ...canonicalPersonaCoreBlocks(character, defaultLanguage),
    ...canonicalPersonaContextBlocks(character, context),
  ];
}
