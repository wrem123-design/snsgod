import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  fallbackSnsImagePrompt,
  snsFinalImagePrompt,
  snsImagePromptInstruction,
} from '../src/logic/snsImagePromptPolicy.ts';

const snsSource = readFileSync(new URL('../src/logic/sns.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/logic/api.ts', import.meta.url), 'utf8');
const imageReferenceSource = readFileSync(new URL('../src/logic/imageReference.ts', import.meta.url), 'utf8');
const promptsSource = readFileSync(new URL('../src/logic/prompts.ts', import.meta.url), 'utf8');

test('SNS image prompts are short Korean narrative descriptions of the post situation', () => {
  const fallback = fallbackSnsImagePrompt('햇살 좋은 카페에서 조용히 커피를 마시는 아침');
  const instruction = snsImagePromptInstruction();

  assert.match(fallback, /햇살 좋은 카페/);
  assert.match(fallback, /사진/);
  assert.doesNotMatch(fallback, /Natural phone photo|English visual prompt|matching this social post mood/i);
  assert.match(instruction, /한글 서술형/);
  assert.match(instruction, /한두 문장/);
  assert.match(instruction, /영어 태그/);
});

test('SNS final prompts keep the reference identity while staying concise and Korean', () => {
  const finalPrompt = snsFinalImagePrompt('창가 자리에 앉아 커피잔을 바라보며 미소 짓는 아침 장면', true);

  assert.match(finalPrompt, /첨부한 기준 이미지/);
  assert.match(finalPrompt, /동일한 인물/);
  assert.match(finalPrompt, /창가 자리에 앉아/);
  assert.match(finalPrompt, /글자.*로고.*워터마크/);
  assert.doesNotMatch(finalPrompt, /MANDATORY|Requested scene|Character visual identity|Create a/i);
});

test('image generation does not inject a blanket adult assertion', () => {
  const finalPrompt = snsFinalImagePrompt('침실 창가의 차분한 셀카 장면', false);
  assert.doesNotMatch(finalPrompt, /등장인물은 모두 성인|이 캐릭터는 성인|clearly adult|fictional adult/i);
  assert.doesNotMatch(snsSource, /ensureSnsAdultTone/);
  assert.doesNotMatch(apiSource, /Keep every depicted person clearly adult|fictional adult female character/);
  assert.match(promptsSource, /imageGenerationToneRules: ''/);
  assert.match(promptsSource, /LEGACY_IMAGE_GENERATION_TONE_RULES/);
  assert.match(apiSource, /if \(options\.kind === 'sns'\)[\s\S]*?imageTone/);
  assert.match(apiSource, /if \(options\.kind === 'profile'\)[\s\S]*?imageTone/);
});

test('SNS generation and retry share the Korean policy and attach every renderable reference URI', () => {
  assert.match(snsSource, /snsImagePromptInstruction\(\)/);
  assert.match(snsSource, /kind: 'sns'/);
  assert.match(snsSource, /referenceImage: characterReferenceImageForSns\(character\)/);
  assert.match(imageReferenceSource, /characterReferenceImageForSns[\s\S]*?return primaryCharacterReferenceImage\(character\)/);
  assert.doesNotMatch(snsSource, /include imagePrompt as English visual prompt/);
  assert.match(apiSource, /\|https:\)\/i/);
  assert.doesNotMatch(apiSource, /\|https\?:\)\/i/);
});
