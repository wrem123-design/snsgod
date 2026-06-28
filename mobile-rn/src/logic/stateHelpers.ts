import { SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { makeId } from './ids';

export function allRooms(state: SNSGodState): SNSGodRoom[] {
  return Object.values(state.chatRooms || {}).flat();
}

export function findRoom(state: SNSGodState, roomId?: string): SNSGodRoom | undefined {
  if (!roomId) return undefined;
  return allRooms(state).find(room => room.id === roomId);
}

export function findCharacter(state: SNSGodState, characterId?: string): SNSGodCharacter | undefined {
  if (!characterId) return undefined;
  return state.characters.find(character => character.id === characterId);
}

export function roomMessages(state: SNSGodState, roomId?: string): SNSGodMessage[] {
  if (!roomId) return [];
  return state.messages[roomId] || [];
}

export function ensureCharacterRooms(state: SNSGodState): SNSGodState {
  const chatRooms = { ...state.chatRooms };
  const messages = { ...state.messages };
  let selectedRoomId = state.selectedRoomId;
  for (const character of state.characters) {
    const existing = chatRooms[character.id] || [];
    if (existing.length) {
      chatRooms[character.id] = existing;
      for (const room of existing) messages[room.id] = messages[room.id] || [];
      if (!selectedRoomId) selectedRoomId = existing[0].id;
      continue;
    }
    const room = createRoom(character.id, '기본 채팅');
    chatRooms[character.id] = [room];
    messages[room.id] = character.firstMessage
      ? [{ id: makeId('msg'), role: 'character', characterId: character.id, content: character.firstMessage, createdAt: Date.now() }]
      : [];
    if (!selectedRoomId) selectedRoomId = room.id;
  }
  return { ...state, chatRooms, messages, selectedRoomId };
}

export function createRoom(characterId: string, name = '기본 채팅'): SNSGodRoom {
  const now = Date.now();
  return { id: `${characterId}_${makeId('room')}`, characterId, name, createdAt: now, lastActivity: now };
}

export function appendMessage(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  const room = findRoom(state, roomId);
  const messages = { ...state.messages, [roomId]: [...(state.messages[roomId] || []), message].slice(-160) };
  const chatRooms = { ...state.chatRooms };
  if (room) {
    const rooms = [...(chatRooms[room.characterId] || [])];
    const index = rooms.findIndex(item => item.id === roomId);
    if (index >= 0) rooms[index] = { ...rooms[index], lastActivity: message.createdAt };
    chatRooms[room.characterId] = rooms;
  }
  return { ...state, messages, chatRooms, selectedRoomId: roomId };
}

export function updateRoom(state: SNSGodState, roomId: string, patch: Partial<SNSGodRoom>): SNSGodState {
  const room = findRoom(state, roomId);
  if (!room) return state;
  const chatRooms = { ...state.chatRooms };
  chatRooms[room.characterId] = (chatRooms[room.characterId] || []).map(item => item.id === roomId ? { ...item, ...patch } : item);
  return { ...state, chatRooms };
}

export function updateCharacter(state: SNSGodState, characterId: string, patch: Partial<SNSGodCharacter>): SNSGodState {
  return { ...state, characters: state.characters.map(character => character.id === characterId ? { ...character, ...patch } : character) };
}

