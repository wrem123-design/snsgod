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
  const randomChats = Array.isArray(state.randomChats)
    ? state.randomChats.map(item => item.id === roomId ? { ...item, lastActivity: message.createdAt } : item)
    : state.randomChats;
  if (room) {
    const rooms = [...(chatRooms[room.characterId] || [])];
    const index = rooms.findIndex(item => item.id === roomId);
    if (index >= 0) rooms[index] = { ...rooms[index], lastActivity: message.createdAt };
    chatRooms[room.characterId] = rooms;
  }
  return { ...state, messages, chatRooms, randomChats, selectedRoomId: roomId };
}

export function updateRoom(state: SNSGodState, roomId: string, patch: Partial<SNSGodRoom>): SNSGodState {
  const room = findRoom(state, roomId);
  if (!room) return state;
  const chatRooms = { ...state.chatRooms };
  chatRooms[room.characterId] = (chatRooms[room.characterId] || []).map(item => item.id === roomId ? { ...item, ...patch } : item);
  return { ...state, chatRooms };
}

export function deleteRoom(state: SNSGodState, roomId: string): SNSGodState {
  const room = findRoom(state, roomId);
  if (!room) return state;
  const chatRooms = { ...state.chatRooms };
  const messages = { ...state.messages };
  const unreadCounts = { ...state.unreadCounts };
  chatRooms[room.characterId] = (chatRooms[room.characterId] || []).filter(item => item.id !== roomId);
  delete messages[roomId];
  delete unreadCounts[roomId];
  return {
    ...state,
    chatRooms,
    messages,
    unreadCounts,
    selectedRoomId: state.selectedRoomId === roomId ? undefined : state.selectedRoomId
  };
}

export function updateCharacter(state: SNSGodState, characterId: string, patch: Partial<SNSGodCharacter>): SNSGodState {
  return { ...state, characters: state.characters.map(character => character.id === characterId ? { ...character, ...patch } : character) };
}

export function deleteCharacter(state: SNSGodState, characterId: string): SNSGodState {
  const removedRooms = state.chatRooms[characterId] || [];
  const removedRoomIds = new Set(removedRooms.map(room => room.id));
  const removedPostIds = new Set((state.snsPosts || []).filter(post => post.characterId === characterId).map(post => post.id));
  const chatRooms = { ...state.chatRooms };
  const messages = { ...state.messages };
  const unreadCounts = { ...state.unreadCounts };
  delete chatRooms[characterId];
  for (const roomId of removedRoomIds) {
    delete messages[roomId];
    delete unreadCounts[roomId];
  }

  const groupRooms = (state.groupRooms || []).flatMap(room => {
    const participantIds = (room.participantIds || []).filter(id => id !== characterId);
    if (participantIds.length < 2) {
      delete messages[room.id];
      delete unreadCounts[room.id];
      removedRoomIds.add(room.id);
      return [];
    }
    return [{ ...room, participantIds }];
  });

  return {
    ...state,
    characters: state.characters.filter(character => character.id !== characterId),
    chatRooms,
    messages,
    unreadCounts,
    groupRooms,
    loreEntries: (state.loreEntries || []).filter(entry => entry.characterId !== characterId),
    snsPosts: (state.snsPosts || []).filter(post => post.characterId !== characterId),
    snsDmThreads: (state.snsDmThreads || []).filter(thread => thread.characterId !== characterId && !removedPostIds.has(String(thread.postId || ''))),
    notifications: (state.notifications || []).filter(item => item.characterId !== characterId && !removedRoomIds.has(String(item.roomId || ''))),
    selectedRoomId: state.selectedRoomId && removedRoomIds.has(state.selectedRoomId) ? undefined : state.selectedRoomId
  };
}
