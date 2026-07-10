import type { PromptSet } from '../types';

export type PromptSettingDefinition = {
  key: keyof PromptSet;
  label: string;
  help: string;
  consumer: string;
};

export const HIDDEN_LEGACY_PROMPT_FIELDS: Array<keyof PromptSet> = ['roleObjective', 'language'];

export const PROMPT_SETTING_DEFINITIONS: PromptSettingDefinition[] = [
  { key: 'systemRules', label: '대화 공통 안전 규칙', help: '개인톡과 선톡의 기본 행동 규칙에 적용됩니다.', consumer: 'direct and proactive chat' },
  { key: 'characterActing', label: '개인톡 연기 지침', help: '개인톡 답장의 주도성과 자연스러운 행동에 적용됩니다.', consumer: 'direct chat' },
  { key: 'jsonFormat', label: '개인톡 JSON 형식', help: '개인톡 답장의 메시지 배열과 부가 필드 형식을 정합니다.', consumer: 'direct chat output adapter' },
  { key: 'memoryRules', label: '개인톡 메모리 생성', help: '일반 답장에서 새 장기 기억을 만들지 여부를 정합니다.', consumer: 'direct chat memory output' },
  { key: 'stickerRules', label: '스티커 사용 규칙', help: '사용 가능한 스티커가 있는 개인톡에서만 적용됩니다.', consumer: 'direct chat sticker capability' },
  { key: 'adultBoundaryRules', label: '성인 및 미성년자 경계 규칙', help: '개인톡, 단톡과 SNS 생성의 공통 안전 경계입니다.', consumer: 'direct, group, and SNS generation' },
  { key: 'chatImageRules', label: '개인톡 이미지 규칙', help: '이미지 기능이 켜져 있고 시각 요청이 있는 개인톡에 적용됩니다.', consumer: 'direct image capability' },
  { key: 'groupChatImageRules', label: '단톡 이미지 규칙', help: '이미지 기능이 켜져 있고 시각 요청이 있는 단톡에 적용됩니다.', consumer: 'group image capability' },
  { key: 'imageGenerationToneRules', label: '이미지 생성 공통 톤', help: '프로필, 채팅, SNS와 만남 이미지 prompt의 공통 톤에 적용됩니다.', consumer: 'imagePromptFor and SNS images' },
  { key: 'meetingEventRules', label: '만남 이벤트 발동 규칙', help: '채팅에서 실제 만남 이벤트를 시작할지 판단할 때 사용합니다.', consumer: 'meeting event detector' },
  { key: 'blindDateCandidateRules', label: '블라인드 후보 생성 규칙', help: '블라인드 및 우연한 만남 후보 생성에 적용됩니다.', consumer: 'blind date candidate generation' },
  { key: 'datingAppProfileRules', label: '데이트앱 프로필 생성 규칙', help: '데이트앱 캐릭터 프로필과 첫 메시지 생성에 적용됩니다.', consumer: 'dating app profile generation' },
  { key: 'randomCharacterRules', label: '랜덤 캐릭터 생성 규칙', help: '랜덤채팅 캐릭터의 성격과 첫 메시지 생성에 적용됩니다.', consumer: 'random chat character generation' },
  { key: 'sumgodRules', label: '썸갓 응답 규칙', help: '썸갓의 성인 질문 응답에만 적용됩니다.', consumer: 'SumGod answer generation' },
  { key: 'snsPosting', label: 'SNS 게시 규칙', help: '캐릭터 SNS 게시물 본문 생성에 적용됩니다.', consumer: 'SNS post generation' },
  { key: 'snsSubjectGuide', label: 'SNS 주제 해석 규칙', help: '저장된 SNS 주제를 실제 게시물 소재로 바꾸는 방식에 적용됩니다.', consumer: 'SNS subject compilation' },
  { key: 'snsNsfwBackAccount', label: 'SNS 성인 뒷계 규칙', help: 'NSFW 뒷계정 모드가 켜진 SNS 생성에만 적용됩니다.', consumer: 'SNS NSFW generation' },
  { key: 'profileCreation', label: '신규 캐릭터 생성 규칙', help: '새 캐릭터의 이름, 프로필과 첫 메시지를 AI로 만들 때 사용합니다.', consumer: 'new and random character creation' },
];
