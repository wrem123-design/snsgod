# Prompt compiler 정책

SNSGod의 프롬프트는 하나의 긴 문자열을 여러 위치에서 직접 이어 붙이지 않고, ID가 있는 block 목록을 compiler에 전달해 조립합니다.

## Block과 trace

- 각 block은 고유 `id`, 본문, 활성 조건, 우선순위, 필수 여부를 가집니다.
- compiler 결과에는 최종 문자열뿐 아니라 포함된 block ID, 전체 문자 수, block별 포함 여부와 제외 이유가 들어갑니다.
- 비활성·빈 block은 출력에서 제거되며 trace에는 각각 `disabled`, `empty`로 남습니다.
- 문자 budget이 지정되면 필수 block을 먼저 보존하고 선택 block은 우선순위가 높은 순서로 채웁니다. 최종 출력 순서는 원래 block 순서를 유지합니다.

## 최신 사용자 입력

답장 생성 직전에는 최신 사용자 메시지가 이미 로컬 대화 배열에 저장되어 있습니다. 따라서 개인톡과 단톡 모두 다음 순서를 사용합니다.

1. context window에서 마지막으로 일치하는 사용자 메시지 한 건만 transcript에서 제외합니다.
2. 이전에 같은 문장을 보낸 기록은 그대로 유지합니다.
3. 최신 입력은 별도 `Latest user message` block에 정확히 한 번 넣습니다.

이 처리는 로컬 원문 배열을 복사해 수행하며 저장된 메시지를 수정하거나 삭제하지 않습니다.

## 후속 확장 경계

날짜·시간·이미지·전화·스티커 같은 capability 조건과 canonical Persona는 같은 compiler block으로 확장합니다. 채널별 코드는 필요한 block을 선택하되 공통 정책이나 Persona 문자열을 다시 복제하지 않습니다.
