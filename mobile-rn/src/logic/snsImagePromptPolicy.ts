function compact(value: string | undefined, limit = 180): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function asSentence(value: string): string {
  const text = compact(value);
  if (!text) return '';
  return /[.!?。！？]$/.test(text) ? text : `${text}.`;
}

/** Tells the SNS composer to return one concise Korean scene description. */
export function snsImagePromptInstruction(): string {
  return '이미지가 어울리면 imagePrompt를 게시물의 시간·장소·행동·분위기에 맞는 짧은 한글 서술형 한두 문장으로 작성한다. 영어 태그 나열, 화질 키워드 반복, 카메라 사양 나열은 쓰지 않는다. 인물이 나오면 새 인물이 아니라 이 캐릭터 본인이다.';
}

/** Builds a Korean scene when the model omitted a usable Korean prompt. */
export function fallbackSnsImagePrompt(context: string): string {
  const situation = compact(context, 140) || '조용한 일상의 한순간';
  return `“${situation}”라는 게시물 상황에 어울리게, 캐릭터가 자연스러운 표정과 자세로 그 순간을 보내는 모습을 담은 SNS 사진.`;
}

/** Keeps model output only when it is already a Korean narrative prompt. */
export function normalizeSnsImagePrompt(candidate: string | undefined, context: string): string {
  const prompt = compact(candidate);
  return /[가-힣]/.test(prompt) && !/[A-Za-z]{4,}/.test(prompt)
    ? asSentence(prompt)
    : fallbackSnsImagePrompt(context);
}

/** Adds one clear Korean adult boundary without tag-like duplication. */
export function ensureSnsAdultTone(prompt: string): string {
  const sentence = asSentence(prompt);
  return /등장인물은 모두 성인/.test(sentence) ? sentence : `등장인물은 모두 성인이다. ${sentence}`;
}

/** Produces the final concise Korean prompt sent to the image provider. */
export function snsFinalImagePrompt(scene: string, usesReference: boolean): string {
  const identity = usesReference
    ? '첨부한 기준 이미지와 동일한 인물로 얼굴, 헤어스타일, 전체적인 인상을 유지한다.'
    : '캐릭터 본인의 모습이 자연스럽게 이어지도록 표현한다.';
  return [
    identity,
    asSentence(scene),
    '게시물의 시간, 장소, 행동과 분위기에 맞는 자연스러운 SNS 사진으로 표현한다.',
    '화면 안에 글자, 로고, 워터마크를 넣지 않는다.',
  ].filter(Boolean).join(' ');
}
