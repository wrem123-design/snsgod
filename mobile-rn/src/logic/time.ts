export function formatMessageTime(timestamp?: number): string {
  const date = new Date(Number(timestamp) || Date.now());
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours % 12 || 12;
  return `${period} ${displayHour}:${minutes}`;
}
