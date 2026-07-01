export function formatMessageTime(timestamp?: number): string {
  const date = new Date(Number(timestamp) || Date.now());
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours % 12 || 12;
  return `${period} ${displayHour}:${minutes}`;
}

const KOREAN_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function messageDateKey(timestamp?: number): string {
  const date = new Date(Number(timestamp) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameMessageDate(first?: number, second?: number): boolean {
  return messageDateKey(first) === messageDateKey(second);
}

export function formatMessageDateLabel(timestamp?: number): string {
  const date = new Date(Number(timestamp) || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일 ${KOREAN_WEEKDAYS[date.getDay()]}`;
}

export function formatMessageDateTimeLabel(timestamp?: number): string {
  return `${formatMessageDateLabel(timestamp)} ${formatMessageTime(timestamp)}`;
}
