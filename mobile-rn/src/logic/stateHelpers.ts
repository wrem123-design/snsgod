import { RandomChatRoom, SNSGodCharacter, SNSGodMessage, SNSGodRoom, SNSGodState } from '../types';
import { makeId } from './ids';
import { appendMessageToHistory } from './messageHistoryPolicy';
import { markUserMessagesReadBeforeReply } from './messageReadReceipts';
import { updateRoomMemoryAfterAppend } from './memoryBridge';
import { applyMessageToCharacterWorld } from './characterWorld';
import { deleteCharacterCascade, deleteRoomCascade } from './deletionCascadePolicy';
import { recordContactUserReply } from './contactBudget';

function randomRoomAsChatRoom(room: RandomChatRoom): SNSGodRoom {
  return {
    id: room.id,
    characterId: room.characterId,
    name: room.name,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity || room.createdAt,
    type: 'random'
  };
}

export function allRooms(state: SNSGodState): SNSGodRoom[] {
  const directRooms = Object.values(state.chatRooms || {}).flat();
  const randomRooms = (state.randomChats || []).map(randomRoomAsChatRoom);
  return [...directRooms, ...randomRooms];
}

export function findRoom(state: SNSGodState, roomId?: string): SNSGodRoom | undefined {
  if (!roomId) return undefined;
  return allRooms(state).find(room => room.id === roomId);
}

export function isRoomDisabled(state: SNSGodState, roomId?: string): boolean {
  if (!roomId) return false;
  const direct = Object.values(state.chatRooms || {}).flat().find(room => room.id === roomId);
  if (direct) return direct.disabled === true;
  const group = (state.groupRooms || []).find(room => room.id === roomId);
  return group?.disabled === true;
}

export function findCharacter(state: SNSGodState, characterId?: string): SNSGodCharacter | undefined {
  if (!characterId) return undefined;
  return state.characters.find(character => character.id === characterId)
    || (state.randomChats || []).find(room => room.characterId === characterId || room.character.id === characterId)?.character;
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
  const randomChats = normalizeRandomChats({ ...state, messages }).randomChats || [];
  return { ...state, chatRooms, messages, randomChats, selectedRoomId };
}

export function createRoom(characterId: string, name = '기본 채팅'): SNSGodRoom {
  const now = Date.now();
  return { id: `${characterId}_${makeId('room')}`, characterId, name, createdAt: now, lastActivity: now };
}

export function appendMessage(state: SNSGodState, roomId: string, message: SNSGodMessage): SNSGodState {
  const replyAwareState = message.role === 'user'
    ? recordContactUserReply(state, [findRoom(state, roomId)?.characterId || ''].filter(Boolean), message.createdAt)
    : state;
  state = replyAwareState;
  const room = findRoom(state, roomId);
  const currentHistory = state.messages[roomId] || [];
  const receiptHistory = markUserMessagesReadBeforeReply(currentHistory, message);
  const messages = { ...state.messages, [roomId]: appendMessageToHistory(receiptHistory, message) };
  const chatRooms = { ...state.chatRooms };
  const randomChats = Array.isArray(state.randomChats)
    ? state.randomChats.map(item => item.id === roomId ? { ...item, lastActivity: message.createdAt } : item)
    : state.randomChats;
  if (room) {
    if (room.type === 'random') {
      return updateRoomMemoryAfterAppend({
        ...state,
        messages,
        randomChats: (state.randomChats || []).map(item => item.id === roomId ? { ...item, lastActivity: message.createdAt } : item)
      }, roomId);
    } else {
      const rooms = [...(chatRooms[room.characterId] || [])];
      const index = rooms.findIndex(item => item.id === roomId);
      if (index >= 0) rooms[index] = { ...rooms[index], lastActivity: message.createdAt };
      chatRooms[room.characterId] = rooms;
    }
  }
  const withMemory = updateRoomMemoryAfterAppend({ ...state, messages, chatRooms, randomChats }, roomId);
  return room?.characterId ? applyMessageToCharacterWorld(withMemory, room.characterId, roomId, message) : withMemory;
}

export function updateRoom(state: SNSGodState, roomId: string, patch: Partial<SNSGodRoom>): SNSGodState {
  const room = findRoom(state, roomId);
  if (!room) return state;
  const chatRooms = { ...state.chatRooms };
  chatRooms[room.characterId] = (chatRooms[room.characterId] || []).map(item => item.id === roomId ? { ...item, ...patch } : item);
  return { ...state, chatRooms };
}

export function deleteRoom(state: SNSGodState, roomId: string): SNSGodState {
  return deleteRoomCascade(state, roomId).state;
}

export function updateCharacter(state: SNSGodState, characterId: string, patch: Partial<SNSGodCharacter>): SNSGodState {
  return {
    ...state,
    characters: state.characters.map(character => character.id === characterId ? { ...character, ...patch } : character),
    randomChats: (state.randomChats || []).map(room => room.characterId === characterId || room.character.id === characterId ? {
      ...room,
      character: { ...room.character, ...patch }
    } : room)
  };
}

export function normalizeRandomChats(state: SNSGodState): SNSGodState {
  const messages = { ...state.messages };
  const legacyCharacters = Array.isArray(state.randomCharacters) ? state.randomCharacters as SNSGodCharacter[] : [];
  const legacyRooms: RandomChatRoom[] = legacyCharacters.map(character => {
    const roomId = `random_room_${character.id}`;
    return {
      id: roomId,
      type: 'random' as const,
      characterId: character.id,
      character,
      name: `${character.name || '랜덤'} 랜덤채팅`,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      promoted: false
    };
  });
  const randomChats = [...((state.randomChats || []) as RandomChatRoom[]), ...legacyRooms]
    .filter(room => room?.id && room?.character)
    .map(room => ({
      ...room,
      type: 'random' as const,
      promoted: room.promoted === true,
      createdAt: Number(room.createdAt || Date.now()),
      lastActivity: Number(room.lastActivity || room.createdAt || Date.now()),
      characterId: String(room.characterId || room.character.id),
      character: {
        ...room.character,
        id: String(room.character?.id || room.characterId || makeId('random')),
        enabled: room.character?.enabled !== false,
        proactiveEnabled: false
      }
    }));
  for (const room of randomChats) {
    if (!Array.isArray(messages[room.id])) {
      messages[room.id] = room.character.firstMessage
        ? [{ id: makeId('msg'), role: 'character', characterId: room.characterId, content: room.character.firstMessage, createdAt: room.createdAt, sourceMode: 'randomchat' }]
        : [];
    }
  }
  return { ...state, messages, randomChats, randomCharacters: undefined };
}

export function deleteCharacter(state: SNSGodState, characterId: string): SNSGodState {
  return deleteCharacterCascade(state, characterId).state;
}
