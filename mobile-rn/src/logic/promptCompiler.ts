export type PromptBlock = {
  id: string;
  content: string;
  enabled?: boolean;
  priority?: number;
  required?: boolean;
};

export type PromptBlockTrace = {
  id: string;
  characters: number;
  included: boolean;
  reason: 'included' | 'disabled' | 'empty' | 'budget';
};

export type PromptCompilation = {
  content: string;
  includedBlockIds: string[];
  totalCharacters: number;
  maxCharacters?: number;
  trace: PromptBlockTrace[];
};

export type PromptCompilerOptions = {
  maxCharacters?: number;
  separator?: string;
};

type IndexedPromptBlock = PromptBlock & {
  content: string;
  index: number;
};

function renderedContent(blocks: IndexedPromptBlock[], selected: Set<number>, separator: string): string {
  return blocks
    .filter(block => selected.has(block.index))
    .map(block => block.content)
    .join(separator);
}

export function compilePromptBlocks(blocks: PromptBlock[], options: PromptCompilerOptions = {}): PromptCompilation {
  const separator = options.separator ?? '\n\n';
  const requestedBudget = Number(options.maxCharacters);
  const maxCharacters = options.maxCharacters === undefined || !Number.isFinite(requestedBudget)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(requestedBudget));
  const seenIds = new Set<string>();
  const indexed = blocks.map((block, index): IndexedPromptBlock => {
    const id = String(block.id || '').trim();
    if (!id) throw new Error(`Prompt block at index ${index} has no id.`);
    if (seenIds.has(id)) throw new Error(`Duplicate prompt block id: ${id}`);
    seenIds.add(id);
    return { ...block, id, content: String(block.content || '').trim(), index };
  });
  const selectable = indexed.filter(block => block.enabled !== false && block.content.length > 0);
  const selected = new Set<number>(selectable.filter(block => block.required).map(block => block.index));
  const optional = selectable
    .filter(block => !block.required)
    .sort((left, right) => (right.priority || 0) - (left.priority || 0) || left.index - right.index);

  for (const block of optional) {
    const proposed = new Set(selected);
    proposed.add(block.index);
    if (renderedContent(indexed, proposed, separator).length <= maxCharacters) selected.add(block.index);
  }

  const content = renderedContent(indexed, selected, separator);
  const trace = indexed.map((block): PromptBlockTrace => {
    if (block.enabled === false) return { id: block.id, characters: block.content.length, included: false, reason: 'disabled' };
    if (!block.content) return { id: block.id, characters: 0, included: false, reason: 'empty' };
    if (!selected.has(block.index)) return { id: block.id, characters: block.content.length, included: false, reason: 'budget' };
    return { id: block.id, characters: block.content.length, included: true, reason: 'included' };
  });

  return {
    content,
    includedBlockIds: indexed.filter(block => selected.has(block.index)).map(block => block.id),
    totalCharacters: content.length,
    ...(Number.isFinite(maxCharacters) ? { maxCharacters } : {}),
    trace,
  };
}

export function withoutLatestUserInput<T extends { role: string; content: string }>(messages: readonly T[], latestUserText: string): T[] {
  const target = String(latestUserText || '').trim();
  if (!target) return [...messages];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && String(message.content || '').trim() === target) {
      return [...messages.slice(0, index), ...messages.slice(index + 1)];
    }
  }
  return [...messages];
}

export function countExactPromptOccurrences(content: string, needle: string): number {
  const target = String(needle || '');
  if (!target) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = content.indexOf(target, offset)) >= 0) {
    count += 1;
    offset += target.length;
  }
  return count;
}
