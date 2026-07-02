import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSDmMessage, SNSDmParticipant, SNSDmThread, SNSGodCharacter, SNSGodState, SNSPost } from '../types';
import { generateSNSPost, generateSnsDmReply, snsOptionsFor } from '../logic/sns';
import { makeId } from '../logic/ids';
import { isRenderableMediaUri, pickImageDataUri } from '../logic/media';

function finalImagePromptForRetry(post: SNSPost): string {
  let prompt = String(post.imagePrompt || '').trim();
  prompt = prompt.replace(/^\s*이미지\s*프롬프트\s*[:：]\s*/i, '').trim();
  const labels = [
    /\n\s*기존\s*본문\s*[:：]/i,
    /\n\s*실패\s*이유\s*[:：]/i,
    /\n\s*이미지\s*실패\s*이유\s*[:：]/i
  ];
  const firstLabelAt = labels
    .map(pattern => {
      const match = prompt.match(pattern);
      return match?.index ?? -1;
    })
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  if (firstLabelAt !== undefined) prompt = prompt.slice(0, firstLabelAt).trim();
  return prompt;
}

export function SNSScreen({ state, platform, onOpenSettings, onOpenNotifications, onChange }: {
  state: SNSGodState;
  platform: SNSPost['platform'];
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const availableCharacters = useMemo(() => state.characters.filter(character => character.randomTemporary !== true), [state.characters]);
  const sortedCharacters = useMemo(() => {
    const recentPostAtByCharacter = new Map<string, number>();
    (state.snsPosts || [])
      .filter(post => post.platform === platform)
      .forEach(post => {
        const previous = recentPostAtByCharacter.get(post.characterId) || 0;
        recentPostAtByCharacter.set(post.characterId, Math.max(previous, Number(post.createdAt || 0)));
      });
    return availableCharacters
      .map((character, index) => ({ character, index, recentAt: recentPostAtByCharacter.get(character.id) || 0, enabled: snsOptionsFor(state, platform, character).enabled !== false }))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || (b.recentAt - a.recentAt) || (a.index - b.index))
      .map(item => item.character);
  }, [availableCharacters, platform, state.config.sns, state.snsPosts]);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageData, setImageData] = useState('');
  const [activeDmId, setActiveDmId] = useState('');
  const [dmHub, setDmHub] = useState<{ postId: string; platformIndex: number } | null>(null);
  const [dmText, setDmText] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDmList, setShowDmList] = useState(false);
  const [retryDraft, setRetryDraft] = useState<{ postId: string; prompt: string } | null>(null);
  const [imageViewer, setImageViewer] = useState<{ uri: string; title?: string; caption?: string } | null>(null);
  const feedRef = useRef<FlatList<SNSPost>>(null);
  const selectedCharacter = selectedCharacterId ? availableCharacters.find(character => character.id === selectedCharacterId) : undefined;
  const activeSnsOptions = snsOptionsFor(state, platform, selectedCharacter);
  const [snsAutoEnabled, setSnsAutoEnabled] = useState(selectedCharacter?.snsAutoEnabled !== false);
  const [draftAnonymous, setDraftAnonymous] = useState(activeSnsOptions.anonymous === true);
  const [draftNsfw, setDraftNsfw] = useState(activeSnsOptions.nsfw === true);
  const [draftTextOnly, setDraftTextOnly] = useState(activeSnsOptions.textOnly === true);
  const [draftNoDM, setDraftNoDM] = useState(activeSnsOptions.noDM === true);
  const [draftThirdPartyDM, setDraftThirdPartyDM] = useState(activeSnsOptions.thirdPartyDM === true);
  const [draftAutoComments, setDraftAutoComments] = useState(activeSnsOptions.autoComments !== false);
  const [draftAutoImage, setDraftAutoImage] = useState(activeSnsOptions.autoImage !== false);
  const [draftCommentQty, setDraftCommentQty] = useState(String(activeSnsOptions.commentQty || '2-4'));
  const [draftSubject, setDraftSubject] = useState(String(activeSnsOptions.subject || ''));
  const [draftMood, setDraftMood] = useState(String(activeSnsOptions.mood || ''));
  const posts = useMemo(() => (state.snsPosts || [])
    .filter(post => post.platform === platform && (!selectedCharacterId || post.characterId === selectedCharacterId))
    .slice()
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)), [platform, selectedCharacterId, state.snsPosts]);
  const dmThreads = useMemo(() => (state.snsDmThreads || []).filter(thread => {
    if (selectedCharacterId && thread.characterId !== selectedCharacterId) return false;
    return dmThreadPlatform(thread, state.snsPosts || []) === platform;
  }), [platform, selectedCharacterId, state.snsDmThreads, state.snsPosts]);

  useEffect(() => {
    const existingIds = new Set((state.snsDmThreads || []).map(thread => thread.id));
    const missingThreads: SNSDmThread[] = [];
    for (const post of state.snsPosts || []) {
      (post.dms || []).forEach((dm, index) => {
        const id = `postdmthread:${post.id}:${dm.id || index}`;
        if (existingIds.has(id)) return;
        missingThreads.push({
          id,
          postId: post.id,
          platformIndex: 0,
          characterId: post.characterId,
          kind: 'thirdParty',
          title: String(dm.title || 'SNS DM'),
          context: `${post.platform === 'instagram' ? 'Instagram' : 'X'} post by ${post.displayName || 'Character'}: ${post.content}`,
          participants: dm.participants,
          messages: (dm.messages || []).map((message, messageIndex) => ({
            id: String(message.id || `postdmmsg_${messageIndex}`),
            from: message.from,
            fromName: message.fromName,
            body: message.body,
            createdAt: Number(message.createdAt || post.createdAt || Date.now())
          })),
          createdAt: Number(post.createdAt || Date.now()),
          updatedAt: Number(post.createdAt || Date.now()),
          unread: Math.max(1, (dm.messages || []).length)
        });
      });
    }
    const validThreads = missingThreads.filter(thread => thread.messages.length);
    if (validThreads.length) {
      void onChange({ ...state, snsDmThreads: [...validThreads, ...(state.snsDmThreads || [])].slice(0, 120) });
    }
  }, [state.snsPosts, state.snsDmThreads]);

  useEffect(() => {
    if (!activeDmId || activeDmId.startsWith('postdm:')) return;
    const thread = (state.snsDmThreads || []).find(item => item.id === activeDmId);
    if (!thread?.unread) return;
    void onChange({
      ...state,
      snsDmThreads: (state.snsDmThreads || []).map(item => item.id === activeDmId ? { ...item, unread: 0 } : item)
    });
  }, [activeDmId, state.snsDmThreads]);

  useEffect(() => {
    if (selectedCharacterId && !availableCharacters.some(character => character.id === selectedCharacterId)) {
      setSelectedCharacterId('');
    }
  }, [availableCharacters, selectedCharacterId]);

  useEffect(() => {
    const options = snsOptionsFor(state, platform, selectedCharacter);
    setSnsAutoEnabled(selectedCharacter?.snsAutoEnabled !== false);
    setDraftAnonymous(options.anonymous === true);
    setDraftNsfw(options.nsfw === true);
    setDraftTextOnly(options.textOnly === true);
    setDraftNoDM(options.noDM === true);
    setDraftThirdPartyDM(options.thirdPartyDM === true);
    setDraftAutoComments(options.autoComments !== false);
    setDraftAutoImage(options.autoImage !== false);
    setDraftCommentQty(String(options.commentQty || '2-4'));
    setDraftSubject(String(options.subject || ''));
    setDraftMood(String(options.mood || ''));
  }, [platform, selectedCharacter?.id, selectedCharacter?.snsOptions, selectedCharacter?.snsAutoEnabled, state.config.sns]);

  function stateWithDraftOptions(): SNSGodState {
    const nextOptions = {
      anonymous: draftAnonymous,
      nsfw: draftNsfw,
      textOnly: draftTextOnly,
      noDM: draftNoDM,
      thirdPartyDM: draftThirdPartyDM,
      enabled: activeSnsOptions.enabled !== false,
      autoComments: draftAutoComments,
      commentQty: draftCommentQty || '2-4',
      subject: draftSubject,
      mood: draftMood,
      autoImage: draftAutoImage
    };
    return {
      ...state,
      characters: selectedCharacter
        ? state.characters.map(character => character.id === selectedCharacter.id ? {
          ...character,
          snsAutoEnabled,
          snsOptions: {
            ...(character.snsOptions || {}),
            [platform]: nextOptions
          }
        } : character)
        : state.characters
    };
  }

  async function saveSnsOptions() {
    if (!selectedCharacter) {
      Alert.alert('SNS', 'SNS 설정을 저장할 캐릭터를 먼저 선택하세요.');
      return;
    }
    await onChange(stateWithDraftOptions());
    Alert.alert('저장 완료', `${selectedCharacter?.name || '선택 캐릭터'}의 ${platform === 'instagram' ? 'Instagram' : 'X'} SNS 옵션을 저장했습니다.`);
  }

  async function toggleCharacterPlatform(character: SNSGodCharacter) {
    const currentOptions = snsOptionsFor(state, platform, character);
    const nextEnabled = currentOptions.enabled === false;
    await onChange({
      ...state,
      characters: state.characters.map(item => item.id === character.id ? {
        ...item,
        snsOptions: {
          ...(item.snsOptions || {}),
          [platform]: {
            ...(item.snsOptions?.[platform] || {}),
            enabled: nextEnabled
          }
        }
      } : item)
    });
    if (!nextEnabled && selectedCharacterId === character.id) {
      setSelectedCharacterId('');
    }
  }

  async function generate() {
    if (!selectedCharacter || loading) return;
    if (activeSnsOptions.enabled === false) {
      Alert.alert('SNS 꺼짐', `${selectedCharacter.name}의 ${platform === 'instagram' ? 'Instagram' : 'X'} 활동이 꺼져 있습니다.`);
      return;
    }
    setLoading(true);
    try {
      const draftState = stateWithDraftOptions();
      const draftCharacter = draftState.characters.find(character => character.id === selectedCharacter.id) || selectedCharacter;
      const next = await generateSNSPost(draftState, draftCharacter, platform, { manual: true, image: imageData || undefined });
      await onChange(next);
      setImageData('');
      setShowGenerator(false);
    } catch (error) {
      Alert.alert('SNS 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function openRetryPost(post: SNSPost) {
    setRetryDraft({
      postId: post.id,
      prompt: finalImagePromptForRetry(post)
    });
  }

  async function retryFailedPost(post: SNSPost, retryPrompt: string) {
    if (loading) return;
    const character = state.characters.find(item => item.id === post.characterId);
    if (!character) {
      Alert.alert('SNS 재생성 실패', '재생성할 캐릭터를 찾지 못했습니다.');
      return;
    }
    setLoading(true);
    try {
      const retryState: SNSGodState = {
        ...state,
        snsPosts: (state.snsPosts || []).filter(item => item.id !== post.id)
      };
      const next = await generateSNSPost(retryState, character, post.platform, { manual: true, roomId: post.generationRoomId, retryPrompt });
      await onChange(next);
      setRetryDraft(null);
    } catch (error) {
      Alert.alert('SNS 재생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function choosePostImage() {
    try {
      const image = await pickImageDataUri();
      if (image) setImageData(image);
    } catch (error) {
      Alert.alert('사진 선택 실패', error instanceof Error ? error.message : String(error));
    }
  }

  function clearPostImage() {
    setImageData('');
  }

  function liftGeneratorField(offset: number) {
    if (!showGenerator) return;
    setTimeout(() => {
      feedRef.current?.scrollToOffset({ offset, animated: true });
    }, 80);
  }

  async function likePost(postId: string) {
    await onChange({ ...state, snsPosts: (state.snsPosts || []).map(post => post.id === postId ? { ...post, likes: (post.likes || 0) + 1 } : post) });
  }

  function deletePost(postId: string) {
    Alert.alert('게시물 삭제', '이 SNS 게시물을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await onChange({
            ...state,
            snsPosts: (state.snsPosts || []).filter(post => post.id !== postId),
            snsDmThreads: (state.snsDmThreads || []).filter(thread => thread.postId !== postId)
          });
        }
      }
    ]);
  }

  async function addComment(postId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    await onChange({
      ...state,
      snsPosts: (state.snsPosts || []).map(post => post.id === postId ? {
        ...post,
        replies: (post.replies || post.comments?.length || 0) + 1,
        comments: [...(post.comments || []), { id: makeId('comment'), author: state.config.userName || '나', content: trimmed, createdAt: Date.now() }]
      } : post)
    });
  }

  async function sendDmReply(ai: boolean) {
    const thread = (state.snsDmThreads || []).find(item => item.id === activeDmId);
    const trimmed = dmText.trim();
    if (!thread || !trimmed || loading) return;
    const userMessage = { id: makeId('snsdmmsg'), from: 'user' as const, author: state.config.userName || '나', body: trimmed, createdAt: Date.now() };
    const withUser: SNSGodState = {
      ...state,
      snsDmThreads: (state.snsDmThreads || []).map(item => item.id === thread.id ? { ...item, messages: [...item.messages, userMessage], updatedAt: Date.now(), unread: 0 } : item)
    };
    setDmText('');
    if (!ai) {
      await onChange(withUser);
      return;
    }
    setLoading(true);
    try {
      await onChange(await generateSnsDmReply(withUser, thread.id, trimmed));
    } catch (error) {
      Alert.alert('SNS DM 답장 실패', error instanceof Error ? error.message : String(error));
      await onChange(withUser);
    } finally {
      setLoading(false);
    }
  }

  function deleteDmThread(threadId: string) {
    const thread = (state.snsDmThreads || []).find(item => item.id === threadId);
    if (!thread) return;
    Alert.alert('DM 삭제', '이 DM 대화내역을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const nextPosts = (state.snsPosts || []).map(post => {
            if (post.id !== thread.postId || !post.dms?.length) return post;
            const dms = post.dms.filter((dm, index) => {
              const generatedId = `postdmthread:${post.id}:${dm.id || index}`;
              return generatedId !== thread.id;
            });
            return { ...post, dms };
          });
          await onChange({
            ...state,
            snsPosts: nextPosts,
            snsDmThreads: (state.snsDmThreads || []).filter(item => item.id !== threadId)
          });
          if (activeDmId === threadId) setActiveDmId('');
          if (dmHub?.postId === thread.postId) setDmHub(null);
        }
      }
    ]);
  }

  function postContext(post: SNSPost) {
    return `${post.platform === 'instagram' ? 'Instagram' : 'X'} post by ${post.displayName || selectedCharacter?.name || 'Character'}: ${post.content}`;
  }

  async function openSnsDm(post: SNSPost) {
    const character = state.characters.find(item => item.id === post.characterId);
    if (snsOptionsFor(state, post.platform, character).noDM) {
      Alert.alert('DM 꺼짐', `${character?.name || '이 캐릭터'}의 ${post.platform === 'instagram' ? 'Instagram' : 'X'} DM이 꺼져 있습니다.`);
      return;
    }
    const existing = (state.snsDmThreads || []).find(thread =>
      thread.postId === post.id
      && Number(thread.platformIndex || 0) === 0
      && thread.kind !== 'thirdParty'
      && !thread.id.startsWith('postdm:')
    );
    if (!existing && character) {
      const thread: SNSDmThread = {
        id: makeId('snsdm'),
        postId: post.id,
        platformIndex: 0,
        characterId: post.characterId,
        kind: 'user',
        title: `${post.platform === 'instagram' ? 'Instagram' : 'X'} DM`,
        context: postContext(post),
        participants: [
          { id: 'user', name: state.config.userName || '나', role: 'user' },
          { id: `character:${character.id}`, name: character.name, handle: character.handle, avatar: character.profileImage || character.avatar, role: 'character' }
        ],
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        unread: 0
      };
      await onChange({ ...state, snsDmThreads: [thread, ...(state.snsDmThreads || [])] });
    }
    setSelectedCharacterId(post.characterId);
    setDmHub({ postId: post.id, platformIndex: 0 });
    setActiveDmId('');
    setShowDmList(false);
  }

  const hubPost = dmHub ? (state.snsPosts || []).find(post => post.id === dmHub.postId) : undefined;
  const hubUserThread = hubPost ? (state.snsDmThreads || []).find(thread =>
    thread.postId === hubPost.id
    && Number(thread.platformIndex || 0) === Number(dmHub?.platformIndex || 0)
    && thread.kind !== 'thirdParty'
    && !thread.id.startsWith('postdm:')
  ) : undefined;
  const hubThirdPartyDms = hubPost ? [
    ...(hubPost.dms || []).map((dm, index) => ({ id: String(dm.id || `postdm_${index}`), title: dm.title, participants: dm.participants, messages: dm.messages })),
    ...(state.snsDmThreads || [])
      .filter(thread => thread.postId === hubPost.id && (thread.kind === 'thirdParty' || thread.messages.some(message => message.from === 'thirdParty')))
      .map(thread => ({
        id: thread.id,
        title: thread.title,
        messages: thread.messages.map(message => ({ id: message.id, from: message.author || message.from, body: message.body, createdAt: message.createdAt }))
      }))
  ] : [];
  const activePostDmParts = activeDmId.startsWith('postdm:') ? activeDmId.split(':') : [];
  const activePostDmPost = activePostDmParts.length >= 3 ? (state.snsPosts || []).find(post => post.id === activePostDmParts[1]) : undefined;
  const activePostDmList = activePostDmPost ? [
    ...(activePostDmPost.dms || []).map((dm, index) => ({ id: String(dm.id || `postdm_${index}`), title: dm.title, participants: dm.participants, messages: dm.messages })),
    ...(state.snsDmThreads || [])
      .filter(thread => thread.postId === activePostDmPost.id && (thread.kind === 'thirdParty' || thread.messages.some(message => message.from === 'thirdParty')))
      .map(thread => ({
        id: thread.id,
        title: thread.title,
        messages: thread.messages.map(message => ({ id: message.id, from: message.author || message.from, body: message.body, createdAt: message.createdAt }))
      }))
  ] : [];
  const activePostDm = activePostDmPost
    ? activePostDmList.find(dm => `postdm:${activePostDmPost.id}:${dm.id}` === activeDmId)
    : undefined;
  const activeUserThread = (state.snsDmThreads || []).find(item => item.id === activeDmId);
  const activeUserThreadPost = activeUserThread?.postId ? (state.snsPosts || []).find(post => post.id === activeUserThread.postId) : undefined;
  const retryPost = retryDraft ? (state.snsPosts || []).find(post => post.id === retryDraft.postId) : undefined;
  const activeReadOnlyThread = activePostDm && activePostDmPost
    ? postDmToThread(activePostDm, activePostDmPost, state.characters.find(character => character.id === activePostDmPost.characterId))
    : undefined;

  function renderGeneratorPanel() {
    if (!showGenerator) return null;
    return (
      <View style={[styles.generator, platform === 'twitter' && styles.xGenerator]}>
        <View style={styles.generatorTitleRow}>
          <Text style={[styles.generatorTitle, platform === 'twitter' && styles.xPanelText]}>{selectedCharacter?.name || '캐릭터'} SNS 설정</Text>
          {selectedCharacter ? (
            <Pressable onPress={() => toggleCharacterPlatform(selectedCharacter)} style={[styles.generatorPower, activeSnsOptions.enabled !== false ? styles.generatorPowerOn : styles.generatorPowerOff]}>
              <Text style={[styles.generatorPowerText, activeSnsOptions.enabled === false && styles.generatorPowerTextOff]}>{activeSnsOptions.enabled !== false ? 'ON' : 'OFF'}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.generatorSub, platform === 'twitter' && styles.xSubtitle]}>{platform === 'instagram' ? 'Instagram 전용' : 'X 전용'} · 댓글 {draftCommentQty || '2-4'} · {draftAutoComments ? 'AI 댓글 자동' : 'AI 댓글 끔'} · {draftAnonymous ? '익명계' : '공개계'}{draftNsfw ? ' · NSFW 뒷계' : ''}</Text>
        <View style={styles.settingGrid}>
          <TogglePill label="이 캐릭터 SNS 자동 생성 허용" value={snsAutoEnabled} onPress={() => setSnsAutoEnabled(value => !value)} />
          <TogglePill label="익명계" value={draftAnonymous} onPress={() => setDraftAnonymous(value => !value)} />
          <TogglePill label="NSFW 뒷계" value={draftNsfw} onPress={() => setDraftNsfw(value => !value)} />
          <TogglePill label="글만" value={draftTextOnly} onPress={() => setDraftTextOnly(value => !value)} />
          <TogglePill label="DM 끄기" value={draftNoDM} onPress={() => setDraftNoDM(value => !value)} />
          <TogglePill label="제3자 DM 허용" value={draftThirdPartyDM} onPress={() => setDraftThirdPartyDM(value => !value)} />
          <TogglePill label="AI 댓글 자동 생성" value={draftAutoComments} onPress={() => setDraftAutoComments(value => !value)} />
          <TogglePill label="자동 이미지" value={draftAutoImage} onPress={() => setDraftAutoImage(value => !value)} />
        </View>
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <Text style={[styles.fieldLabel, platform === 'twitter' && styles.xSubtitle]}>생성 댓글 수</Text>
            <TextInput value={draftCommentQty} onChangeText={setDraftCommentQty} onFocus={() => liftGeneratorField(64)} style={[styles.fieldInput, platform === 'twitter' && styles.xInput]} placeholder="2-4" placeholderTextColor="#8c8c8c" />
          </View>
          <View style={styles.col}>
            <Text style={[styles.fieldLabel, platform === 'twitter' && styles.xSubtitle]}>무드</Text>
            <TextInput value={draftMood} onChangeText={setDraftMood} onFocus={() => liftGeneratorField(64)} style={[styles.fieldInput, platform === 'twitter' && styles.xInput]} placeholder="그날 기분에 따라" placeholderTextColor="#8c8c8c" />
          </View>
        </View>
        <Text style={[styles.fieldLabel, platform === 'twitter' && styles.xSubtitle]}>소재</Text>
        <TextInput value={draftSubject} onChangeText={setDraftSubject} onFocus={() => liftGeneratorField(136)} style={[styles.fieldInput, styles.subjectInput, platform === 'twitter' && styles.xInput]} placeholder="일상 잡담, 짧은 트윗, 방금 대화 등 원하는 방향" placeholderTextColor="#8c8c8c" multiline />
        <View style={styles.optionBadges}>
          <Text style={[styles.optionBadge, platform === 'twitter' && styles.xOptionBadge]}>{draftTextOnly ? '글만' : draftAutoImage ? '이미지 가능' : '이미지 끔'}</Text>
          <Text style={[styles.optionBadge, platform === 'twitter' && styles.xOptionBadge]}>{draftNoDM ? 'DM 끔' : draftThirdPartyDM ? '제3자 DM 허용' : 'DM 가능'}</Text>
          <Text style={[styles.optionBadge, platform === 'twitter' && styles.xOptionBadge]}>{platform === 'instagram' ? 'Instagram 별도 설정' : 'X 별도 설정'}</Text>
        </View>
        {imageData ? <Image source={{ uri: imageData }} style={styles.pendingImage} /> : null}
        <View style={styles.generatorActions}>
          <Pressable onPress={choosePostImage} style={styles.secondary}><Text style={styles.secondaryText}>{imageData ? '사진 변경' : '사진 첨부'}</Text></Pressable>
          {imageData ? <Pressable onPress={clearPostImage} style={styles.secondary}><Text style={styles.secondaryText}>첨부 해제</Text></Pressable> : null}
        </View>
        <Pressable onPress={saveSnsOptions} style={styles.secondary}><Text style={styles.secondaryText}>옵션 저장</Text></Pressable>
        <Pressable onPress={generate} style={styles.primary} disabled={loading || !selectedCharacter}>
          {loading ? <ActivityIndicator color="#241a00" /> : <Text style={styles.primaryText}>SNS 생성</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, platform === 'twitter' && styles.xScreen]}>
      {activeDmId ? (
        activePostDm ? (
          <DmModal
            thread={activeReadOnlyThread}
            post={activePostDmPost}
            character={state.characters.find(character => character.id === activePostDmPost?.characterId)}
            platform={platform}
            userName={state.config.userName || '나'}
            value={dmText}
            onChangeText={setDmText}
            onClose={() => setActiveDmId('')}
            onSend={() => sendDmReply(true)}
            onDelete={activeReadOnlyThread?.id && (state.snsDmThreads || []).some(thread => thread.id === activeReadOnlyThread.id) ? () => deleteDmThread(activeReadOnlyThread.id) : undefined}
            loading={loading}
          />
        ) : (
          <DmModal
            thread={activeUserThread}
            post={activeUserThreadPost}
            character={state.characters.find(character => character.id === activeUserThread?.characterId)}
            platform={platform}
            userName={state.config.userName || '나'}
            value={dmText}
            onChangeText={setDmText}
            onClose={() => setActiveDmId('')}
            onSend={() => sendDmReply(true)}
            onDelete={activeUserThread?.id ? () => deleteDmThread(activeUserThread.id) : undefined}
            loading={loading}
          />
        )
      ) : null}
      {retryDraft && retryPost ? (
        <SnsRetryPromptEditor
          post={retryPost}
          prompt={retryDraft.prompt}
          loading={loading}
          onChangePrompt={prompt => setRetryDraft(current => current ? { ...current, prompt } : current)}
          onCancel={() => setRetryDraft(null)}
          onSubmit={() => retryFailedPost(retryPost, retryDraft.prompt)}
        />
      ) : null}
      {dmHub && hubPost ? (
        <SnsDmHubModal
          post={hubPost}
          character={state.characters.find(character => character.id === hubPost.characterId)}
          userThread={hubUserThread}
          thirdPartyDms={hubThirdPartyDms}
          onClose={() => setDmHub(null)}
          onOpenUserThread={threadId => {
            setActiveDmId(threadId);
            setDmHub(null);
          }}
          onOpenThirdParty={dmId => {
            setActiveDmId(`postdm:${hubPost.id}:${dmId}`);
            setDmHub(null);
          }}
        />
      ) : null}
      <View style={[styles.header, platform === 'twitter' && styles.xHeader]}>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, platform === 'twitter' && styles.xTitle]}>{platform === 'instagram' ? 'Instagram' : 'X'}</Text>
          <Text style={[styles.subtitle, platform === 'twitter' && styles.xSubtitle]}>{selectedCharacter?.name || '전체'} · {posts.length} posts{activeSnsOptions.nsfw ? ' · NSFW 뒷계' : ''}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="SNS" onPress={() => setShowGenerator(value => !value)} style={[styles.actionPill, platform === 'twitter' && styles.xActionPill, showGenerator && styles.actionPillActive, platform === 'twitter' && showGenerator && styles.xActionPillActive]}>
            <Text style={[styles.actionPillText, platform === 'twitter' && styles.xActionPillText, showGenerator && styles.actionPillTextActive, platform === 'twitter' && showGenerator && styles.xActionPillTextActive]}>SNS</Text>
          </Pressable>
          <Pressable accessibilityLabel="SNS DM" onPress={() => setShowDmList(value => !value)} style={[styles.roundIcon, platform === 'twitter' && styles.xRoundIcon, showDmList && styles.roundIconActive]}>
            <Text style={[styles.roundIconText, platform === 'twitter' && styles.xRoundIconText, showDmList && styles.roundIconTextActive]}>DM</Text>
            {dmThreads.some(thread => thread.unread) ? <Text style={styles.alertBadge}>{dmThreads.reduce((sum, thread) => sum + (thread.unread || 0), 0)}</Text> : null}
          </Pressable>
          <Pressable accessibilityLabel="설정" onPress={onOpenSettings} style={[styles.roundIcon, platform === 'twitter' && styles.xRoundIcon]}>
            <Text style={[styles.roundIconText, platform === 'twitter' && styles.xRoundIconText]}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.characterRail, platform === 'twitter' && styles.xCharacterRail]}>
        <FlatList
          horizontal
          data={sortedCharacters}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.characterRailContent}
          ListHeaderComponent={<AllCharacterChip active={!selectedCharacterId} platform={platform} onPress={() => setSelectedCharacterId('')} />}
          renderItem={({ item }) => {
            const enabled = snsOptionsFor(state, platform, item).enabled !== false;
            return <CharacterChip character={item} active={item.id === selectedCharacterId} enabled={enabled} platform={platform} onPress={() => setSelectedCharacterId(item.id === selectedCharacterId ? '' : item.id)} />;
          }}
        />
      </View>

      {showDmList ? (
        <DmInboxModal
          platform={platform}
          selectedCharacter={selectedCharacter}
          threads={dmThreads}
          posts={state.snsPosts || []}
          characters={state.characters}
          userName={state.config.userName || '나'}
          onClose={() => setShowDmList(false)}
          onOpen={threadId => {
            setActiveDmId(threadId);
            setShowDmList(false);
          }}
        />
      ) : null}
      {imageViewer ? (
        <SnsImageViewer image={imageViewer} onClose={() => setImageViewer(null)} />
      ) : null}

      <FlatList
        ref={feedRef}
        data={posts}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={renderGeneratorPanel()}
        contentContainerStyle={[styles.feed, showGenerator && styles.feedWithGenerator, platform === 'instagram' && styles.instagramFeed, platform === 'twitter' && styles.twitterFeed]}
        ListEmptyComponent={<Text style={styles.emptyText}>아직 {selectedCharacter?.name || '이 캐릭터'}의 {platform === 'instagram' ? 'Instagram' : 'Twitter/X'} 게시물이 없습니다.</Text>}
        renderItem={({ item }) => {
          const itemCharacter = state.characters.find(character => character.id === item.characterId);
          return <PostCard platform={platform} post={item} character={itemCharacter} dmEnabled={!snsOptionsFor(state, item.platform, itemCharacter).noDM} onLike={() => likePost(item.id)} onDelete={() => deletePost(item.id)} onComment={content => addComment(item.id, content)} onOpenDm={() => openSnsDm(item)} onRetryFailed={() => openRetryPost(item)} onOpenImage={() => item.image && setImageViewer({ uri: item.image, title: visiblePostTitle(item), caption: item.content })} />;
        }}
      />
    </View>
  );
}

function TogglePill({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.togglePill, value && styles.togglePillOn]}>
      <Text style={[styles.toggleText, value && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

function SnsRetryPromptEditor({ post, prompt, loading, onChangePrompt, onCancel, onSubmit }: {
  post: SNSPost;
  prompt: string;
  loading: boolean;
  onChangePrompt: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.modal}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.retryPanel}>
        <Text style={styles.retryTitle}>SNS 재생성</Text>
        <Text style={styles.retryHelp}>최종 이미지 프롬프트만 수정해서 다시 생성합니다. 이미지 검열/빈 게시물이라면 원하는 장면을 더 구체적으로 적어주세요.</Text>
        <Text style={styles.retryPostPreview} numberOfLines={3}>{post.content || post.imageCaption || post.generationError || '표시할 내용이 없는 게시물입니다.'}</Text>
        <TextInput
          value={prompt}
          onChangeText={onChangePrompt}
          editable={!loading}
          multiline
          textAlignVertical="top"
          placeholder="최종 이미지 프롬프트"
          placeholderTextColor="#9a9183"
          style={styles.retryInput}
        />
        <View style={styles.retryActions}>
          <Pressable onPress={onCancel} disabled={loading} style={[styles.retrySecondary, loading && styles.disabled]}>
            <Text style={styles.retrySecondaryText}>취소</Text>
          </Pressable>
          <Pressable onPress={onSubmit} disabled={loading || !prompt.trim()} style={[styles.retryPrimary, (loading || !prompt.trim()) && styles.disabled]}>
            {loading ? <ActivityIndicator color="#241a00" /> : <Text style={styles.retryPrimaryText}>재생성</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function visiblePostTitle(post: SNSPost): string {
  const title = String(post.title || '').trim();
  if (title) return title;
  const imageCaption = String(post.imageCaption || '').trim();
  const body = String(post.content || '').trim();
  if (imageCaption && imageCaption !== body && !/이미지\s*생성\s*실패/i.test(imageCaption)) return imageCaption;
  return '';
}

function SnsImageViewer({ image, onClose }: { image: { uri: string; title?: string; caption?: string }; onClose: () => void }) {
  return (
    <View style={styles.imageViewerOverlay}>
      <Pressable accessibilityLabel="이미지 닫기" onPress={onClose} style={styles.imageViewerBackdrop} />
      <View style={styles.imageViewerTop}>
        <View style={styles.imageViewerText}>
          {image.title ? <Text style={styles.imageViewerTitle} numberOfLines={1}>{image.title}</Text> : null}
          {image.caption ? <Text style={styles.imageViewerCaption} numberOfLines={1}>{image.caption}</Text> : null}
        </View>
        <Pressable accessibilityLabel="이미지 닫기" onPress={onClose} style={styles.imageViewerClose}>
          <Text style={styles.imageViewerCloseText}>×</Text>
        </Pressable>
      </View>
      <Image source={{ uri: image.uri }} style={styles.imageViewerImage} resizeMode="contain" />
    </View>
  );
}

function AllCharacterChip({ active, platform, onPress }: { active: boolean; platform: SNSPost['platform']; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.characterChip, active && styles.characterChipActive, platform === 'twitter' && styles.xCharacterChip, platform === 'twitter' && active && styles.xCharacterChipActive]}>
      <View style={[styles.allCharacterAvatar, platform === 'twitter' && styles.xAllCharacterAvatar]}>
        <Text style={[styles.allCharacterAvatarText, platform === 'twitter' && styles.xPanelText]}>ALL</Text>
      </View>
      <Text style={[styles.characterName, platform === 'twitter' && styles.xPanelText]} numberOfLines={1}>전체</Text>
    </Pressable>
  );
}

function CharacterChip({ character, active, enabled, platform, onPress }: { character: SNSGodCharacter; active: boolean; enabled: boolean; platform: SNSPost['platform']; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.characterChip, !enabled && styles.characterChipOff, active && styles.characterChipActive, platform === 'twitter' && styles.xCharacterChip, platform === 'twitter' && active && styles.xCharacterChipActive]}>
      <View style={!enabled && styles.characterAvatarOff}>
        <Avatar character={character} size={52} />
      </View>
      <Text style={[styles.characterName, !enabled && styles.characterNameOff, platform === 'twitter' && styles.xPanelText]} numberOfLines={1}>{character.name}</Text>
    </Pressable>
  );
}

type DmLikeMessage = { id?: string; from: string; fromName?: string; author?: string; body: string; createdAt?: number };
type NormalizedSnsDmThread = SNSDmThread & { kind: 'user' | 'thirdParty'; participants: SNSDmParticipant[]; messages: SNSDmMessage[] };

function platformName(platform: SNSPost['platform']) {
  return platform === 'instagram' ? 'Instagram' : 'X';
}

function dmThreadPlatform(thread: SNSDmThread, posts: SNSPost[]): SNSPost['platform'] | undefined {
  const post = thread.postId ? posts.find(item => item.id === thread.postId) : undefined;
  if (post?.platform) return post.platform;
  const source = `${thread.context || ''}\n${thread.title || ''}`.toLowerCase();
  if (/\binstagram\b|인스타/.test(source)) return 'instagram';
  if (/\btwitter\b|\bx\b|트위터/.test(source)) return 'twitter';
  return undefined;
}

function dmAvatarUri(character?: SNSGodCharacter): string {
  const uri = character?.profileImage || character?.avatar;
  return isRenderableMediaUri(uri) ? String(uri) : '';
}

function cleanParticipantName(value: string | undefined) {
  return String(value || '').replace(/^@/, '').trim();
}

function participantKey(value: string | undefined) {
  return cleanParticipantName(value).toLowerCase();
}

function participantId(role: SNSDmParticipant['role'], name: string) {
  return `${role}:${participantKey(name).replace(/[^a-z0-9가-힣_-]/gi, '_') || 'unknown'}`;
}

function userParticipant(userName: string): SNSDmParticipant {
  return { id: 'user', name: userName || '나', role: 'user' };
}

function characterParticipant(character?: SNSGodCharacter): SNSDmParticipant {
  return {
    id: character ? `character:${character.id}` : 'character',
    name: character?.name || '캐릭터',
    handle: character?.handle,
    avatar: character ? dmAvatarUri(character) : undefined,
    role: 'character'
  };
}

function thirdPartyParticipant(name: string): SNSDmParticipant {
  const finalName = cleanParticipantName(name) || 'DM 상대';
  return { id: participantId('thirdParty', finalName), name: finalName, role: 'thirdParty' };
}

function titleParticipants(title: string) {
  const cleaned = String(title || '').replace(/\s+DM$/i, '').trim();
  const arrow = cleaned.match(/^(.+?)\s*(?:↔|→|->|to)\s*(.+)$/i);
  if (arrow) return [cleanParticipantName(arrow[1]), cleanParticipantName(arrow[2])].filter(Boolean).slice(0, 2);
  const dm = cleaned.match(/^(.+?)\s+DM$/i);
  return dm ? [cleanParticipantName(dm[1])] : [];
}

function isCharacterName(value: string | undefined, character?: SNSGodCharacter) {
  const raw = participantKey(value);
  if (!raw) return false;
  return ['character', 'bot', participantKey(character?.id), participantKey(character?.name), participantKey(character?.handle)].filter(Boolean).includes(raw);
}

function isUserName(value: string | undefined, userName: string) {
  const raw = participantKey(value);
  return raw === 'user' || raw === 'me' || raw === participantKey(userName);
}

function findParticipant(participants: SNSDmParticipant[], raw: string | undefined) {
  const key = participantKey(raw);
  return participants.find(participant =>
    participantKey(participant.id) === key
    || participantKey(participant.name) === key
    || participantKey(participant.handle) === key
  );
}

function inferDmParticipants(thread: SNSDmThread, character: SNSGodCharacter | undefined, userName: string): SNSDmParticipant[] {
  const result: SNSDmParticipant[] = [];
  const add = (participant: SNSDmParticipant) => {
    if (!result.some(item => item.id === participant.id || participantKey(item.name) === participantKey(participant.name))) result.push(participant);
  };
  if (thread.kind === 'user') add(userParticipant(userName));
  (thread.participants || []).forEach(participant => add({
    ...participant,
    id: participant.id || participantId(participant.role || 'thirdParty', participant.name),
    role: participant.role || 'thirdParty'
  }));
  const characterPart = characterParticipant(character);
  add(characterPart);
  titleParticipants(thread.title).forEach(name => {
    if (isCharacterName(name, character)) add(characterPart);
    else if (isUserName(name, userName)) add(userParticipant(userName));
    else add(thirdPartyParticipant(name));
  });
  thread.messages.forEach(message => {
    const raw = message.fromName || message.author || message.from;
    if (isUserName(raw, userName)) add(userParticipant(userName));
    else if (isCharacterName(raw, character)) add(characterPart);
    else if (raw && raw !== 'thirdParty') add(thirdPartyParticipant(raw));
  });
  if (thread.kind !== 'user' && !result.some(item => item.role === 'thirdParty')) add(thirdPartyParticipant('DM 상대'));
  return result;
}

function resolveSnsDmSender(message: DmLikeMessage, thread: NormalizedSnsDmThread, character: SNSGodCharacter | undefined, userName: string) {
  const raw = message.fromName || message.author || message.from;
  if (isUserName(raw, userName)) return thread.participants.find(item => item.role === 'user') || userParticipant(userName);
  if (isCharacterName(raw, character)) return thread.participants.find(item => item.role === 'character') || characterParticipant(character);
  return findParticipant(thread.participants, raw) || thirdPartyParticipant(raw || 'DM 상대');
}

function normalizeSnsDmThread(thread: SNSDmThread, post: SNSPost | undefined, character: SNSGodCharacter | undefined, userName: string): NormalizedSnsDmThread {
  const kind = thread.kind === 'thirdParty' || thread.id.startsWith('postdm:') ? 'thirdParty' : 'user';
  const participants = inferDmParticipants({ ...thread, kind }, character, userName);
  const charPart = participants.find(item => item.role === 'character') || characterParticipant(character);
  const thirdPart = participants.find(item => item.role === 'thirdParty');
  const allCharacter = kind === 'thirdParty' && thread.messages.length > 1 && thread.messages.every(message => isCharacterName(message.fromName || message.author || message.from, character));
  const messages = thread.messages.map((message, index) => {
    const fallbackSender = allCharacter && thirdPart && index % 2 === 0 ? thirdPart : undefined;
    return {
      id: String(message.id || `${thread.id}_${index}`),
      from: fallbackSender?.id || message.from || charPart.id,
      fromName: fallbackSender?.name || message.fromName || message.author,
      author: message.author,
      body: message.body,
      createdAt: Number(message.createdAt || Date.now())
    };
  });
  return { ...thread, kind, participants, messages, context: thread.context || (post ? `${platformName(post.platform)} post by ${post.displayName || character?.name || 'Character'}: ${post.content}` : thread.context) };
}

function postDmToThread(dm: { id: string; title: string; participants?: SNSDmParticipant[]; messages: DmLikeMessage[] }, post: SNSPost, character?: SNSGodCharacter): SNSDmThread {
  return {
    id: `postdm:${post.id}:${dm.id}`,
    postId: post.id,
    platformIndex: 0,
    characterId: post.characterId,
    kind: 'thirdParty',
    title: dm.title,
    context: `${platformName(post.platform)} post by ${post.displayName || character?.name || 'Character'}: ${post.content}`,
    participants: dm.participants,
    messages: dm.messages.map((message, index) => ({
      id: String(message.id || `postdmmsg_${index}`),
      from: message.from,
      fromName: message.fromName,
      author: message.author,
      body: message.body,
      createdAt: Number(message.createdAt || Date.now())
    })),
    createdAt: Number(post.createdAt || Date.now()),
    updatedAt: Number(post.createdAt || Date.now())
  };
}

function dmThreadTitle(thread: NormalizedSnsDmThread, character?: SNSGodCharacter) {
  if (thread.kind === 'user') return `나와 ${character?.name || '캐릭터'}의 DM`;
  const visible = thread.participants.filter(item => item.role !== 'user').slice(0, 2);
  if (visible.length >= 2) return `${visible[0].name} ↔ ${visible[1].name}`;
  return `${character?.name || '캐릭터'}의 SNS DM`;
}

function snsIdentityName(value?: { name?: string; handle?: string }) {
  const name = cleanParticipantName(value?.name) || '상대';
  const handle = cleanParticipantName(value?.handle);
  if (handle && participantKey(handle) !== participantKey(name)) return `${handle}(${name})`;
  return name;
}

function dmInboxCounterpart(thread: NormalizedSnsDmThread, character?: SNSGodCharacter, userName = '나') {
  if (thread.kind === 'user') return characterParticipant(character);
  const last = [...thread.messages].reverse().find(message => {
    const sender = resolveSnsDmSender(message, thread, character, userName);
    return sender.role !== 'user';
  });
  if (last) return resolveSnsDmSender(last, thread, character, userName);
  return thread.participants.find(item => item.role !== 'user') || characterParticipant(character);
}

function dmInboxSender(thread: NormalizedSnsDmThread, character?: SNSGodCharacter, userName = '나') {
  const last = thread.messages[thread.messages.length - 1];
  return last ? resolveSnsDmSender(last, thread, character, userName) : dmInboxCounterpart(thread, character, userName);
}

function dmDisplayTitle(thread: NormalizedSnsDmThread, character?: SNSGodCharacter, userName = '나') {
  if (thread.kind === 'user') return snsIdentityName(character);
  const visible = thread.participants.filter(item => item.role !== 'user').slice(0, 2);
  if (visible.length >= 2) return visible.map(item => snsIdentityName(item)).join(', ');
  return snsIdentityName(dmInboxCounterpart(thread, character, userName));
}

function relativeDmTime(value?: number) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (elapsed < hour) return `${Math.max(1, Math.floor(elapsed / minute))}분`;
  if (elapsed < day) return `${Math.max(1, Math.floor(elapsed / hour))}시간`;
  if (elapsed < week) return `${Math.max(1, Math.floor(elapsed / day))}일`;
  return `${Math.max(1, Math.floor(elapsed / week))}주`;
}

function dmSenderName(message: DmLikeMessage, character?: SNSGodCharacter, userName = '나', thread?: NormalizedSnsDmThread) {
  if (thread) return resolveSnsDmSender(message, thread, character, userName).name;
  if (message.from === 'user') return userName;
  if (message.from === 'character') return character?.name || message.author || 'Character';
  if (message.from === 'thirdParty') return message.author || '제3자';
  return message.author || message.fromName || message.from || '상대';
}

function AvatarToken({ participant, character, size = 30 }: { participant: SNSDmParticipant; character?: SNSGodCharacter; size?: number }) {
  const uri = participant.role === 'character' ? dmAvatarUri(character) || participant.avatar : participant.avatar;
  return uri ? (
    <Image source={{ uri }} style={[styles.dmAvatarPhoto, { width: size, height: size, borderRadius: size / 2 }]} />
  ) : (
    <View style={[styles.dmInitialAvatar, participant.role === 'thirdParty' && styles.dmThirdAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.dmInitialText}>{participant.name.slice(0, 1)}</Text>
    </View>
  );
}

function DmAvatarStack({ participants, character }: { participants: SNSDmParticipant[]; character?: SNSGodCharacter }) {
  return (
    <View style={styles.dmAvatarStack}>
      {participants.slice(0, 2).map((participant, index) => (
        <View key={participant.id} style={[styles.dmAvatarStackItem, index > 0 && styles.dmAvatarStackOverlap]}>
          <AvatarToken participant={participant} character={character} size={38} />
        </View>
      ))}
    </View>
  );
}

function dmPostPreview(post?: SNSPost) {
  const text = String(post?.content || post?.imageCaption || '').trim();
  if (text) return text;
  if (post?.image) return '이미지가 포함된 SNS 게시물';
  return '연결된 SNS 게시물';
}

function DmInboxModal({ platform, selectedCharacter, threads, posts, characters, userName, onClose, onOpen }: {
  platform: SNSPost['platform'];
  selectedCharacter?: SNSGodCharacter;
  threads: SNSDmThread[];
  posts: SNSPost[];
  characters: SNSGodCharacter[];
  userName: string;
  onClose: () => void;
  onOpen: (threadId: string) => void;
}) {
  const sortedThreads = [...threads].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  const title = selectedCharacter ? snsIdentityName(selectedCharacter) : '전체 DM';
  return (
    <View style={styles.modal}>
      <View style={[styles.dmInboxPanel, platform === 'twitter' && styles.xDmPanel]}>
        <View style={[styles.dmPanelHeader, platform === 'twitter' && styles.xDmPanelHeader]}>
          <View style={styles.dmHubHeaderLeft}>
            {selectedCharacter ? <Avatar character={selectedCharacter} size={34} /> : <View style={styles.dmInboxAllAvatar}><Text style={styles.dmInboxAllText}>ALL</Text></View>}
            <View>
              <Text style={[styles.dmPanelTitle, platform === 'twitter' && styles.xDmPanelTitle]}>{title}</Text>
              <Text style={[styles.dmHubSub, platform === 'twitter' && styles.xDmPanelSub]}>{platformName(platform)} · {sortedThreads.length}개</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <FlatList
          data={sortedThreads}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.dmInboxList}
          ListEmptyComponent={<Text style={[styles.dmHubEmpty, platform === 'twitter' && styles.xSubtitle]}>아직 이 캐릭터의 DM이 없습니다.</Text>}
          renderItem={({ item }) => {
            const character = characters.find(candidate => candidate.id === item.characterId);
            const post = item.postId ? posts.find(candidate => candidate.id === item.postId) : undefined;
            return (
              <DmInboxRow
                thread={item}
                post={post}
                character={character}
                platform={platform}
                userName={userName}
                onOpen={() => onOpen(item.id)}
              />
            );
          }}
        />
      </View>
    </View>
  );
}

function DmInboxRow({ thread, post, character, platform, userName, onOpen }: {
  thread: SNSDmThread;
  post?: SNSPost;
  character?: SNSGodCharacter;
  platform: SNSPost['platform'];
  userName: string;
  onOpen: () => void;
}) {
  const normalized = normalizeSnsDmThread(thread, post, character, userName);
  const last = normalized.messages[normalized.messages.length - 1];
  const sender = dmInboxSender(normalized, character, userName);
  const time = relativeDmTime(Number(last?.createdAt || normalized.updatedAt || normalized.createdAt || 0));
  const body = last?.body || '아직 메시지가 없습니다.';
  return (
    <Pressable onPress={onOpen} style={[styles.dmInboxRow, platform === 'twitter' && styles.xDmInboxRow]}>
      <AvatarToken participant={sender} character={character} size={54} />
      <View style={styles.dmInboxMain}>
        <View style={styles.dmInboxText}>
          <View style={styles.dmInboxTopLine}>
            <Text style={[styles.dmInboxSender, platform === 'twitter' && styles.xPanelText]} numberOfLines={1}>{snsIdentityName(sender)}</Text>
            {thread.unread ? <Text style={styles.dmInboxUnread}>{thread.unread}</Text> : null}
          </View>
          <Text style={[styles.dmInboxBody, platform === 'twitter' && styles.xSubtitle]} numberOfLines={1}>{body}{time ? ` · ${time}` : ''}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function DmCard({ thread, platform, character, userName }: { thread: SNSDmThread; platform: SNSPost['platform']; character?: SNSGodCharacter; userName: string }) {
  const normalized = normalizeSnsDmThread(thread, undefined, character, userName);
  const last = normalized.messages[normalized.messages.length - 1];
  const sender = last ? dmSenderName(last, character, userName, normalized) : '새 대화';
  return (
    <View style={styles.dmCard}>
      <View style={styles.dmCardTop}>
        <Text style={styles.dmPlatformPill}>{normalized.kind === 'thirdParty' ? 'SNS DM' : '내 DM'}</Text>
        {thread.unread ? <Text style={styles.dmBadge}>{thread.unread}</Text> : null}
      </View>
      <DmAvatarStack participants={normalized.participants.filter(item => item.role !== 'user')} character={character} />
      <Text style={styles.dmCardTitle} numberOfLines={1}>{dmThreadTitle(normalized, character)}</Text>
      <Text style={styles.dmCardMeta} numberOfLines={1}>{platformName(platform)} · {normalized.kind === 'thirdParty' ? 'SNS-side DM' : '게시물에서 이어진 대화'}</Text>
      <Text style={styles.dmCardBody} numberOfLines={2}>{sender}: {last?.body || '새 SNS DM'}</Text>
    </View>
  );
}

function DmModal({ thread, post, character, platform, userName, value, onChangeText, onClose, onSend, onDelete, loading }: {
  thread?: SNSDmThread;
  post?: SNSPost;
  character?: SNSGodCharacter;
  platform: SNSPost['platform'];
  userName: string;
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  onDelete?: () => void;
  loading: boolean;
}) {
  if (!thread) return null;
  const normalized = normalizeSnsDmThread(thread, post, character, userName);
  const title = dmDisplayTitle(normalized, character, userName);
  const visibleParticipants = normalized.kind === 'user'
    ? [userParticipant(userName), characterParticipant(character)]
    : normalized.participants.filter(item => item.role !== 'user').slice(0, 2);
  const postAuthor = post?.displayName || character?.name || '캐릭터';
  return (
    <View style={styles.modal}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.dmPanel, platform === 'twitter' && styles.xDmPanel]}>
        <View style={[styles.dmPanelHeader, platform === 'twitter' && styles.xDmPanelHeader]}>
          <View style={styles.dmHeaderIdentity}>
            <DmAvatarStack participants={visibleParticipants} character={character} />
            <View style={styles.dmHeaderText}>
              <Text style={[styles.dmPanelTitle, platform === 'twitter' && styles.xDmPanelTitle]}>{title}</Text>
              <Text style={[styles.dmPanelSub, platform === 'twitter' && styles.xDmPanelSub]}>{platformName(platform)} · {normalized.kind === 'thirdParty' ? 'SNS-side DM' : '게시물에서 이어진 대화'}</Text>
            </View>
          </View>
          {onDelete ? <Pressable onPress={onDelete} style={styles.dmDeleteButton}><Text style={styles.dmDeleteButtonText}>삭제</Text></Pressable> : null}
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <FlatList
          data={normalized.messages}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={(
            <View style={[styles.dmPostContextCard, platform === 'twitter' && styles.xDmPostContextCard]}>
              <View style={styles.dmPostContextTop}>
                <Text style={styles.dmPlatformPill}>{platformName(platform)}</Text>
                <Text style={styles.dmContextBadge}>{normalized.kind === 'thirdParty' ? 'SNS-side DM' : '내 DM'}</Text>
              </View>
              <Text style={[styles.dmPostAuthor, platform === 'twitter' && styles.xPanelText]}>{postAuthor}</Text>
              <Text style={[styles.dmPostPreview, platform === 'twitter' && styles.xSubtitle]} numberOfLines={2}>{post?.content || normalized.context || 'SNS 게시물에서 이어진 DM'}</Text>
              {post?.image ? <Image source={{ uri: post.image }} style={styles.dmPostThumb} /> : null}
            </View>
          )}
          ListFooterComponent={loading && normalized.kind === 'user' ? <TypingIndicator /> : null}
          contentContainerStyle={[styles.dmMessages, platform === 'twitter' && styles.xDmMessages]}
          renderItem={({ item, index }) => (
            <DmMessageBubble message={normalized.messages[index]} thread={normalized} character={character} userName={userName} platform={platform} previous={normalized.messages[index - 1]} />
          )}
        />
        {normalized.kind === 'user' ? (
          <View style={[styles.dmComposer, platform === 'twitter' && styles.xDmComposer]}>
            <TextInput value={value} onChangeText={onChangeText} editable={!loading} style={[styles.dmInput, platform === 'twitter' && styles.xDmInput]} placeholder={`${character?.name || '상대'}에게 DM 보내기`} placeholderTextColor="#aaa" />
            <Pressable onPress={onSend} disabled={loading || !value.trim()} style={[styles.dmSend, (loading || !value.trim()) && styles.disabled]}><Text style={styles.dmSendText}>{loading ? '답장 중...' : '보내기'}</Text></Pressable>
          </View>
        ) : (
          <View style={[styles.dmReadOnlyFooter, platform === 'twitter' && styles.xDmComposer]}>
            <Text style={[styles.dmReadOnlyText, platform === 'twitter' && styles.xSubtitle]}>SNS 게시물에 딸린 제3자 대화입니다.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function DmMessageBubble({ message, thread, character, userName, platform, previous }: { message: SNSDmMessage; thread: NormalizedSnsDmThread; character?: SNSGodCharacter; userName: string; platform: SNSPost['platform']; previous?: SNSDmMessage }) {
  const sender = resolveSnsDmSender(message, thread, character, userName);
  const previousSender = previous ? resolveSnsDmSender(previous, thread, character, userName) : undefined;
  const mine = sender.role === 'user' || (thread.kind === 'thirdParty' && sender.role === 'character');
  const showAvatar = !mine && previousSender?.id !== sender.id;
  const showLabel = thread.kind === 'thirdParty' || previousSender?.id !== sender.id;
  return (
    <View style={[styles.dmMessageRow, mine && styles.dmMessageRowMine]}>
      {!mine ? <View style={styles.dmBubbleAvatarSlot}>{showAvatar ? <AvatarToken participant={sender} character={character} size={28} /> : null}</View> : null}
      <View style={[styles.dmBubble, sender.role === 'thirdParty' ? styles.dmBubbleThirdParty : mine ? styles.dmBubbleMine : styles.dmBubbleOther, platform === 'twitter' && sender.role !== 'user' && styles.xDmBubbleOther, platform === 'twitter' && mine && styles.xDmBubbleMine]}>
        {showLabel ? <Text style={[styles.dmSpeaker, mine && styles.dmSpeakerMine, platform === 'twitter' && !mine && styles.xDmSpeaker]}>{sender.name}</Text> : null}
        <Text style={[styles.dmBubbleText, platform === 'twitter' && !mine && styles.xDmBubbleText, platform === 'twitter' && mine && styles.xDmBubbleTextMine]}>{message.body}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.dmTypingPill}>
      <ActivityIndicator size="small" color={colors.sub} />
      <Text style={styles.dmTypingText}>답장 중...</Text>
    </View>
  );
}

function SnsDmHubModal({ post, character, userThread, thirdPartyDms, onClose, onOpenUserThread, onOpenThirdParty }: {
  post: SNSPost;
  character?: SNSGodCharacter;
  userThread?: SNSDmThread;
  thirdPartyDms: { id: string; title: string; participants?: SNSDmParticipant[]; messages: DmLikeMessage[] }[];
  onClose: () => void;
  onOpenUserThread: (threadId: string) => void;
  onOpenThirdParty: (dmId: string) => void;
}) {
  const lastUserDm = userThread?.messages[userThread.messages.length - 1];
  return (
    <View style={styles.modal}>
      <View style={styles.dmPanel}>
        <View style={styles.dmPanelHeader}>
          <View style={styles.dmHubHeaderLeft}>
            <Avatar character={character} size={34} />
            <View>
              <Text style={styles.dmPanelTitle}>{snsIdentityName(character)}</Text>
              <Text style={styles.dmHubSub}>SNS 게시물에서 이어진 대화 목록</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <View style={styles.dmHubPostPreview}>
          <Text style={styles.dmHubPostLabel}>{post.platform === 'instagram' ? 'Instagram' : 'X'} 게시물</Text>
          <Text style={styles.dmHubPostText} numberOfLines={3}>{post.content}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.dmHubList}>
          {userThread ? (
            <Pressable onPress={() => onOpenUserThread(userThread.id)} style={styles.dmHubCard}>
              <Text style={styles.dmHubCardKicker}>내 DM</Text>
              <Text style={styles.dmHubCardTitle}>{snsIdentityName(character)}</Text>
              <Text style={styles.dmHubCardBody} numberOfLines={2}>{lastUserDm ? `${dmSenderName(lastUserDm, character, '나')}: ${lastUserDm.body}` : '아직 메시지가 없습니다.'}</Text>
            </Pressable>
          ) : null}
          {thirdPartyDms.map(dm => (
            <Pressable key={dm.id} onPress={() => onOpenThirdParty(dm.id)} style={styles.dmHubCard}>
              <Text style={styles.dmHubCardKicker}>SNS DM</Text>
              <Text style={styles.dmHubCardTitle}>{dmThreadTitle(normalizeSnsDmThread(postDmToThread(dm, post, character), post, character, '나'), character)}</Text>
              <Text style={styles.dmHubCardBody} numberOfLines={2}>{dm.messages[dm.messages.length - 1] ? `${dm.messages[dm.messages.length - 1]?.from}: ${dm.messages[dm.messages.length - 1]?.body}` : 'SNS DM'}</Text>
            </Pressable>
          ))}
          {!thirdPartyDms.length ? <Text style={styles.dmHubEmpty}>다른 DM은 아직 없습니다.</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

function PostAuthorAvatar({ post, character }: { post: SNSPost; character?: SNSGodCharacter }) {
  const postName = cleanParticipantName(post.displayName || '');
  const postHandle = cleanParticipantName(post.handle || '');
  const characterName = cleanParticipantName(character?.name || '');
  const characterHandle = cleanParticipantName(character?.handle || character?.id || '');
  const usesCharacterIdentity = Boolean(character) && (
    participantKey(postName) === participantKey(characterName)
    || participantKey(postHandle) === participantKey(characterHandle)
  );
  if (usesCharacterIdentity) return <Avatar character={character} size={42} />;
  const label = postName || postHandle || characterName || 'SNS';
  return (
    <View style={styles.postAuthorAvatar}>
      <Text style={styles.postAuthorAvatarText}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function PostCard({ platform, post, character, dmEnabled, onLike, onDelete, onComment, onOpenDm, onRetryFailed, onOpenImage }: { platform: SNSPost['platform']; post: SNSPost; character?: SNSGodCharacter; dmEnabled: boolean; onLike: () => void; onDelete: () => void; onComment: (content: string) => Promise<void> | void; onOpenDm: () => void; onRetryFailed?: () => void; onOpenImage?: () => void }) {
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const failed = post.generationFailed === true;
  const imageFailed = !failed && (post.imageGenerationFailed === true || (Boolean(post.imagePrompt) && !post.image));
  const blankPost = !failed && !post.image && !String(post.content || '').trim();
  const recoverable = failed || imageFailed || blankPost;
  const postTitle = visiblePostTitle(post);
  async function submitComment() {
    const trimmed = comment.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    try {
      await onComment(trimmed);
      setComment('');
    } catch (error) {
      Alert.alert('댓글 작성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingComment(false);
    }
  }
  return (
    <View style={[styles.postCard, platform === 'instagram' && styles.instagramCard, platform === 'twitter' && styles.tweetCard]}>
      <View style={[styles.postHeader, platform === 'instagram' && styles.instagramHeader, platform === 'twitter' && styles.xPostHeader]}>
        <PostAuthorAvatar post={post} character={character} />
        <View style={styles.postMeta}>
          <Text style={[styles.postName, platform === 'twitter' && styles.xPostName]}>{post.displayName || character?.name || 'Character'}</Text>
          <Text style={[styles.postTime, platform === 'twitter' && styles.xPostTime]}>@{post.handle || character?.handle || character?.id} · {compactTime(post.createdAt)}</Text>
        </View>
        <Pressable accessibilityLabel="게시물 삭제" onPress={onDelete} style={[styles.moreButton, platform === 'twitter' && styles.xMoreButton]}>
          <Text style={[styles.more, platform === 'twitter' && styles.xMore]}>...</Text>
        </Pressable>
      </View>
      {recoverable ? (
        <Pressable accessibilityLabel="SNS 재생성" onPress={onRetryFailed} style={[styles.snsFailureBody, platform === 'twitter' && styles.xSnsFailureBody]}>
          <Text style={[styles.snsFailureText, platform === 'twitter' && styles.xSnsFailureText]} numberOfLines={2}>{failed ? 'SNS 생성 실패' : imageFailed ? '이미지 생성 실패' : '빈 게시물'}</Text>
          <View style={styles.snsRetryButton}>
            <Text style={styles.snsRetryButtonText}>!</Text>
          </View>
          <Text style={[styles.snsFailureHint, platform === 'twitter' && styles.xSnsFailureText]}>눌러서 재생성</Text>
        </Pressable>
      ) : null}
      {!failed && !blankPost && (platform === 'instagram' ? (
        <>
          {post.image ? (
            <Pressable accessibilityLabel="SNS 이미지 크게 보기" onPress={onOpenImage}>
              <Image source={{ uri: post.image }} style={styles.postImage} />
            </Pressable>
          ) : imageFailed ? null : <View style={styles.instagramTextOnly}><Text style={styles.instagramTextOnlyText}>{post.content}</Text></View>}
          <View style={styles.instagramActions}>
            <Pressable onPress={onLike}><Text style={styles.instagramAction}>♡</Text></Pressable>
            <Text style={styles.instagramAction}>◌</Text>
            <Text style={styles.instagramAction}>↗</Text>
            <View style={styles.actionSpacer} />
            <Text style={styles.instagramAction}>▢</Text>
          </View>
          <Text style={styles.instagramLikes}>좋아요 {post.likes || 0}개</Text>
          {postTitle ? <Text style={styles.instagramPostTitle}>{postTitle}</Text> : null}
          <Text style={styles.instagramCaption}><Text style={styles.instagramCaptionName}>{post.handle || character?.handle || character?.id}</Text> {post.content}</Text>
        </>
      ) : (
        <>
          {postTitle ? <Text style={styles.tweetTitle}>{postTitle}</Text> : null}
          {post.content ? <Text style={styles.tweetContent}>{post.content}</Text> : null}
          {post.image ? (
            <Pressable accessibilityLabel="SNS 이미지 크게 보기" onPress={onOpenImage}>
              <Image source={{ uri: post.image }} style={styles.tweetImage} />
            </Pressable>
          ) : null}
        </>
      ))}
      {!failed && post.hashtags?.length ? <Text style={[styles.tags, platform === 'twitter' && styles.xTags]}>{post.hashtags.map(tag => `#${tag}`).join(' ')}</Text> : null}
      {!failed && platform === 'twitter' ? <View style={styles.xStats}><Text style={styles.xStatText}>{post.reposts || 0} reposts</Text><Text style={styles.xStatText}>{post.likes || 0} likes</Text><Text style={styles.xStatText}>{post.views || 0} views</Text></View> : null}
      {!failed ? <View style={[styles.postFooter, platform === 'twitter' && styles.xFooter]}>
        <Pressable onPress={onLike}><Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText]}>{platform === 'twitter' ? `♡ ${post.likes || 0}` : `좋아요 ${post.likes || 0}개`}</Text></Pressable>
        <Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText]}>{platform === 'twitter' ? `💬 ${post.replies || post.comments?.length || 0}` : `댓글 ${post.replies || post.comments?.length || 0}개`}</Text>
        <Pressable onPress={onOpenDm} disabled={!dmEnabled}><Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText, !dmEnabled && styles.footerTextDisabled]}>DM</Text></Pressable>
        {post.platform === 'twitter' ? <Text style={styles.xFooterText}>↗</Text> : null}
      </View> : null}
      {!failed && (post.comments || []).slice(-5).map(item => (
        <View key={item.id} style={styles.commentRow}>
          <Text style={[styles.commentAuthor, platform === 'twitter' && styles.xCommentAuthor]}>{item.author}</Text>
          <Text style={[styles.commentText, platform === 'twitter' && styles.xCommentText]}>{item.content}</Text>
        </View>
      ))}
      {!failed ? <View style={[styles.commentComposer, platform === 'twitter' && styles.xCommentComposer]}>
        <TextInput value={comment} onChangeText={setComment} onSubmitEditing={submitComment} returnKeyType="send" style={[styles.commentInput, platform === 'twitter' && styles.xCommentInput]} placeholder="댓글 달기" placeholderTextColor={platform === 'twitter' ? '#9aa0a6' : '#aaa'} />
        <Pressable onPress={submitComment} disabled={!comment.trim() || submittingComment} style={[styles.commentButton, platform === 'twitter' && styles.xCommentButton, (!comment.trim() || submittingComment) && styles.commentButtonDisabled]}><Text style={[styles.commentButtonText, platform === 'twitter' && styles.xCommentButtonText]}>{submittingComment ? '...' : '게시'}</Text></Pressable>
      </View> : null}
    </View>
  );
}

function compactTime(createdAt: number) {
  const diff = Date.now() - Number(createdAt || Date.now());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return new Date(createdAt).toLocaleDateString();
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fbfaf7' },
  xScreen: { backgroundColor: '#000000' },
  header: { minHeight: 72, paddingTop: 10, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f6fbff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  xHeader: { backgroundColor: '#000000', borderBottomColor: '#2f3336' },
  headerTitle: { flex: 1 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  xTitle: { color: '#ffffff', fontSize: 24 },
  xPanelText: { color: '#e7e9ea' },
  subtitle: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  xSubtitle: { color: '#9aa0a6' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionPill: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  xActionPill: { backgroundColor: '#000000', borderColor: '#3a3f44' },
  actionPillActive: { backgroundColor: colors.accent, borderColor: '#c4a842' },
  xActionPillActive: { backgroundColor: '#f5f0e6', borderColor: '#f5f0e6' },
  actionPillText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  xActionPillText: { color: '#c9d1d9' },
  actionPillTextActive: { color: '#241a00' },
  xActionPillTextActive: { color: '#111111' },
  roundIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  xRoundIcon: { backgroundColor: '#000000', borderColor: '#3a3f44' },
  roundIconActive: { backgroundColor: '#111', borderColor: '#111' },
  roundIconText: { color: colors.text, fontWeight: '900', fontSize: 13, lineHeight: 18 },
  xRoundIconText: { color: '#c9d1d9' },
  roundIconTextActive: { color: '#fff' },
  alertBadge: { position: 'absolute', top: -3, right: -4, minWidth: 19, height: 19, borderRadius: 10, overflow: 'hidden', lineHeight: 19, textAlign: 'center', backgroundColor: colors.danger, color: '#fff', fontWeight: '900', fontSize: 11 },
  characterRail: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  xCharacterRail: { borderBottomColor: '#2f3336', backgroundColor: '#000000' },
  characterRailContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  characterChip: { width: 76, alignItems: 'center', gap: 5, padding: 7, borderRadius: 12, position: 'relative' },
  characterChipOff: { opacity: 0.48 },
  characterChipActive: { backgroundColor: '#fff1b8' },
  xCharacterChip: { borderRadius: 0 },
  xCharacterChipActive: { backgroundColor: '#101214' },
  characterAvatarOff: { opacity: 0.6 },
  allCharacterAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  xAllCharacterAvatar: { borderColor: '#2f3336', backgroundColor: '#000000' },
  allCharacterAvatarText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  characterName: { fontSize: 12, color: colors.text, fontWeight: '900' },
  characterNameOff: { color: colors.sub },
  generator: { margin: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  xGenerator: { backgroundColor: '#080808', borderColor: '#2f3336' },
  generatorTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  generatorTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  generatorPower: { minWidth: 44, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  generatorPowerOn: { backgroundColor: '#ecfdf5', borderColor: '#9bd8b7' },
  generatorPowerOff: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  generatorPowerText: { color: '#047857', fontSize: 11, fontWeight: '900' },
  generatorPowerTextOff: { color: '#6b7280' },
  generatorSub: { marginTop: 3, color: colors.sub, fontSize: 11, lineHeight: 16 },
  optionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  optionBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef4ff', color: '#305170', fontSize: 11, fontWeight: '900', overflow: 'hidden' },
  xOptionBadge: { backgroundColor: '#14202a', color: '#b9d7ff' },
  settingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  togglePill: { minHeight: 30, paddingHorizontal: 8, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  togglePillOn: { backgroundColor: colors.accent, borderColor: '#c4a842' },
  toggleText: { color: colors.sub, fontWeight: '900', fontSize: 11 },
  toggleTextOn: { color: '#241a00' },
  twoCols: { flexDirection: 'row', gap: 8, marginTop: 8 },
  col: { flex: 1 },
  fieldLabel: { marginTop: 8, marginBottom: 4, color: colors.sub, fontSize: 11, fontWeight: '900' },
  fieldInput: { minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', paddingHorizontal: 9, color: colors.text, fontSize: 13 },
  subjectInput: { minHeight: 54, paddingVertical: 8 },
  xInput: { backgroundColor: '#000', borderColor: '#2f3336', color: '#e7e9ea' },
  generatorActions: { flexDirection: 'row', gap: 7 },
  primary: { marginTop: 10, minHeight: 40, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' },
  secondary: { marginTop: 8, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa', paddingHorizontal: 8 },
  secondaryText: { color: colors.text, fontWeight: '900', fontSize: 13 },
  pendingImage: { marginTop: 12, width: '100%', height: 180, borderRadius: 8, backgroundColor: '#eee' },
  feed: { padding: 12, gap: 14, paddingBottom: 28 },
  feedWithGenerator: { paddingBottom: 112 },
  imageViewerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  imageViewerBackdrop: { ...StyleSheet.absoluteFillObject },
  imageViewerTop: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 86, paddingTop: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 },
  imageViewerText: { flex: 1, minWidth: 0 },
  imageViewerTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  imageViewerCaption: { marginTop: 3, color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
  imageViewerClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  imageViewerCloseText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '700' },
  imageViewerImage: { width: '100%', height: '100%' },
  instagramFeed: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  twitterFeed: { paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  emptyText: { marginTop: 72, paddingHorizontal: 24, textAlign: 'center', color: colors.sub, fontWeight: '800', lineHeight: 20 },
  dmStrip: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: '#fffefa' },
  dmTitle: { paddingHorizontal: 12, color: colors.text, fontWeight: '900', marginBottom: 8 },
  dmList: { paddingHorizontal: 12, gap: 8 },
  dmCard: { width: 224, minHeight: 104, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#dedede', backgroundColor: '#fff', position: 'relative' },
  dmCardTop: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dmPlatformPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: '#f1f5ff', color: '#31577d', fontSize: 10, fontWeight: '900' },
  dmCardTitle: { marginTop: 7, color: colors.text, fontSize: 15, fontWeight: '900' },
  dmCardMeta: { marginTop: 2, color: '#7b8190', fontSize: 11, fontWeight: '800' },
  dmCardBody: { marginTop: 7, color: colors.sub, lineHeight: 18, fontWeight: '700' },
  dmBadge: { position: 'absolute', top: 8, right: 8, minWidth: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center', lineHeight: 20, backgroundColor: colors.danger, color: '#fff', fontWeight: '900' },
  postCard: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  instagramCard: { borderRadius: 0, borderColor: '#dbdbdb', backgroundColor: '#ffffff' },
  tweetCard: { borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderColor: '#2f3336', backgroundColor: '#000000' },
  postAuthorAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#edf2f7', alignItems: 'center', justifyContent: 'center' },
  postAuthorAvatarText: { color: '#334155', fontSize: 16, fontWeight: '900' },
  postHeader: { minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  instagramHeader: { borderBottomColor: '#efefef', minHeight: 58 },
  xPostHeader: { borderBottomWidth: 0, alignItems: 'flex-start', paddingTop: 12, minHeight: 54 },
  postMeta: { flex: 1 },
  postName: { fontSize: 15, fontWeight: '900', color: colors.text },
  xPostName: { color: '#e7e9ea' },
  postTime: { marginTop: 2, color: colors.sub, fontSize: 12 },
  xPostTime: { color: '#71767b' },
  moreButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  xMoreButton: { marginTop: -4 },
  more: { color: colors.sub, fontWeight: '900' },
  xMore: { color: '#71767b' },
  postImage: { width: '100%', aspectRatio: 1, backgroundColor: '#eee' },
  tweetImage: { marginHorizontal: 16, width: undefined, borderRadius: 16, aspectRatio: 1.6 },
  postContent: { padding: 16, color: colors.text, fontSize: 17, lineHeight: 25 },
  tweetContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, color: '#e7e9ea', fontSize: 16, lineHeight: 23 },
  tweetTitle: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2, color: '#e7e9ea', fontSize: 16, lineHeight: 23, fontWeight: '900' },
  snsFailureBody: { minHeight: 96, margin: 12, borderRadius: 8, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 16 },
  xSnsFailureBody: { backgroundColor: '#111111', borderColor: '#2f3336' },
  snsFailureText: { color: '#9a3412', fontSize: 13, fontWeight: '900' },
  snsFailureHint: { marginTop: 8, color: '#9a3412', fontSize: 11, fontWeight: '800' },
  xSnsFailureText: { color: '#c9d1d9' },
  snsRetryButton: { position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#dcfce7' },
  snsRetryButtonText: { color: '#073d24', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  instagramTextOnly: { width: '100%', aspectRatio: 1, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', padding: 28 },
  instagramTextOnlyText: { color: '#262626', fontSize: 20, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  instagramActions: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  instagramAction: { color: '#262626', fontSize: 24, fontWeight: '800' },
  actionSpacer: { flex: 1 },
  instagramLikes: { paddingHorizontal: 12, color: '#262626', fontWeight: '900' },
  instagramPostTitle: { paddingHorizontal: 12, marginTop: 8, color: '#111', fontSize: 15, lineHeight: 21, fontWeight: '900' },
  instagramCaption: { paddingHorizontal: 12, paddingTop: 7, color: '#262626', lineHeight: 20 },
  instagramCaptionName: { fontWeight: '900' },
  tags: { paddingHorizontal: 16, paddingBottom: 14, color: '#77b8ff', fontWeight: '800' },
  xTags: { color: '#1d9bf0' },
  xStats: { minHeight: 36, paddingHorizontal: 16, flexDirection: 'row', gap: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2f3336' },
  xStatText: { color: '#9aa0a6', fontWeight: '800' },
  postFooter: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  xFooter: { borderTopColor: '#2f3336', justifyContent: 'space-between' },
  footerText: { color: colors.sub, fontWeight: '800' },
  xFooterText: { color: '#b8bec5', fontWeight: '900' },
  footerTextDisabled: { opacity: 0.34 },
  commentRow: { paddingHorizontal: 16, paddingVertical: 4, flexDirection: 'row', gap: 8 },
  commentAuthor: { color: colors.text, fontWeight: '900' },
  xCommentAuthor: { color: '#e7e9ea' },
  commentText: { flex: 1, color: colors.text },
  xCommentText: { color: '#d0d7de' },
  commentComposer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  xCommentComposer: { borderTopColor: '#2f3336', backgroundColor: '#000000' },
  commentInput: { flex: 1, minHeight: 38, borderRadius: 19, paddingHorizontal: 12, backgroundColor: '#f7f5ef', color: colors.text },
  xCommentInput: { backgroundColor: '#15181c', color: '#e7e9ea' },
  commentButton: { minWidth: 52, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  xCommentButton: { backgroundColor: '#1d9bf0' },
  commentButtonDisabled: { opacity: 0.45 },
  commentButtonText: { color: '#241a00', fontWeight: '900' },
  xCommentButtonText: { color: '#ffffff' },
  modal: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  retryPanel: { maxHeight: '86%', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#ffffff' },
  retryTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  retryHelp: { marginTop: 6, color: colors.sub, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  retryPostPreview: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', color: colors.text, lineHeight: 19, fontWeight: '700' },
  retryInput: { marginTop: 12, minHeight: 150, maxHeight: 260, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fbfaf7', color: colors.text, fontSize: 14, lineHeight: 20 },
  retryActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  retrySecondary: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  retrySecondaryText: { color: colors.text, fontWeight: '900' },
  retryPrimary: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  retryPrimaryText: { color: '#241a00', fontWeight: '900' },
  dmPanel: { maxHeight: '88%', backgroundColor: '#ffffff', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  dmInboxPanel: { height: '88%', backgroundColor: '#ffffff', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  xDmPanel: { backgroundColor: '#000000' },
  dmPanelHeader: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbdbdb' },
  xDmPanelHeader: { borderBottomColor: '#2f3336' },
  dmHeaderIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dmHeaderPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e9edf5' },
  dmAvatarStack: { width: 56, minHeight: 42, flexDirection: 'row', alignItems: 'center' },
  dmAvatarStackItem: { borderWidth: 2, borderColor: '#ffffff', borderRadius: 999, backgroundColor: '#ffffff' },
  dmAvatarStackOverlap: { marginLeft: -18 },
  dmInitialAvatar: { backgroundColor: '#edf2f7', alignItems: 'center', justifyContent: 'center' },
  dmThirdAvatar: { backgroundColor: '#fff7ed' },
  dmInitialText: { color: '#334155', fontSize: 13, fontWeight: '900' },
  dmHeaderText: { flex: 1, minWidth: 0 },
  dmInboxAllAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  dmInboxAllText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  dmInboxList: { paddingTop: 8, paddingBottom: 22 },
  dmInboxRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff' },
  xDmInboxRow: { backgroundColor: '#000000' },
  dmInboxMain: { flex: 1, minWidth: 0, justifyContent: 'center' },
  dmInboxText: { flex: 1, minWidth: 0 },
  dmInboxTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dmInboxSender: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '900' },
  dmInboxUnread: { minWidth: 19, height: 19, borderRadius: 10, overflow: 'hidden', lineHeight: 19, textAlign: 'center', backgroundColor: colors.danger, color: '#fff', fontSize: 11, fontWeight: '900' },
  dmInboxTitle: { marginTop: 3, color: colors.text, fontSize: 15, fontWeight: '900' },
  dmInboxPost: { marginTop: 3, color: '#7b8190', fontSize: 11, fontWeight: '800' },
  dmInboxBody: { marginTop: 3, color: '#9aa0a6', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  dmInboxDelete: { width: 52, borderRadius: 8, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', alignItems: 'center', justifyContent: 'center' },
  dmInboxDeleteText: { color: colors.danger, fontWeight: '900', fontSize: 12 },
  dmHubHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dmHubSub: { marginTop: 2, color: colors.sub, fontSize: 11, fontWeight: '800' },
  dmPanelTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  xDmPanelTitle: { color: '#e7e9ea' },
  dmPanelSub: { marginTop: 2, color: '#737373', fontSize: 11, fontWeight: '800' },
  xDmPanelSub: { color: '#71767b' },
  dmDeleteButton: { marginRight: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#f0b7b7', backgroundColor: '#fff1f1', justifyContent: 'center' },
  dmDeleteButtonText: { color: colors.danger, fontWeight: '900' },
  dmPanelClose: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#fff' },
  dmPanelCloseText: { lineHeight: 36, color: colors.text, fontWeight: '900' },
  dmMessages: { padding: 12, gap: 10, backgroundColor: '#ffffff' },
  xDmMessages: { backgroundColor: '#000000' },
  dmPostContextCard: { marginBottom: 10, padding: 11, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fbfaf7' },
  xDmPostContextCard: { borderColor: '#2f3336', backgroundColor: '#080808' },
  dmPostContextTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  dmContextBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: '#ecfdf5', color: '#047857', fontSize: 10, fontWeight: '900' },
  dmPostAuthor: { marginTop: 8, color: colors.text, fontWeight: '900' },
  dmPostPreview: { marginTop: 3, color: colors.sub, lineHeight: 19, fontWeight: '700' },
  dmPostThumb: { marginTop: 8, width: 74, height: 74, borderRadius: 8, backgroundColor: '#e5e7eb' },
  dmMessageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, width: '100%' },
  dmMessageRowMine: { justifyContent: 'flex-end' },
  dmBubbleAvatarSlot: { width: 30, alignItems: 'center' },
  dmAvatarPhoto: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e9edf5' },
  dmAvatarMini: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e9edf5', alignItems: 'center', justifyContent: 'center' },
  dmAvatarMiniText: { color: '#334155', fontSize: 11, fontWeight: '900' },
  dmBubble: { maxWidth: '78%', paddingHorizontal: 13, paddingVertical: 9 },
  dmBubbleOther: { alignSelf: 'flex-start', borderRadius: 18, borderBottomLeftRadius: 5, backgroundColor: '#f0f2f5' },
  dmBubbleMine: { alignSelf: 'flex-end', borderRadius: 18, borderBottomRightRadius: 5, backgroundColor: '#377dff' },
  dmBubbleThirdParty: { alignSelf: 'flex-start', borderRadius: 18, borderBottomLeftRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', backgroundColor: '#ffffff' },
  xDmBubbleOther: { backgroundColor: '#202327' },
  xDmBubbleMine: { backgroundColor: '#1d9bf0' },
  dmSpeaker: { color: '#737373', fontSize: 10, fontWeight: '900', marginBottom: 3 },
  dmSpeakerMine: { color: 'rgba(255,255,255,0.82)' },
  xDmSpeaker: { color: '#9aa0a6' },
  dmBubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  xDmBubbleText: { color: '#e7e9ea' },
  xDmBubbleTextMine: { color: '#ffffff' },
  dmComposer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbdbdb', backgroundColor: '#ffffff' },
  xDmComposer: { backgroundColor: '#000000', borderTopColor: '#2f3336' },
  dmInput: { flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: '#f1f1f1', paddingHorizontal: 12, color: colors.text },
  xDmInput: { backgroundColor: '#202327', color: '#e7e9ea' },
  dmSend: { minWidth: 58, minHeight: 42, borderRadius: 21, backgroundColor: '#3797f0', alignItems: 'center', justifyContent: 'center' },
  dmAiSend: { backgroundColor: '#111' },
  dmSendText: { color: '#ffffff', fontWeight: '900' },
  dmAiText: { color: '#fff', fontWeight: '900' },
  dmReadOnlyFooter: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbdbdb', backgroundColor: '#ffffff' },
  dmReadOnlyText: { color: colors.sub, textAlign: 'center', lineHeight: 19, fontWeight: '800' },
  dmTypingPill: { alignSelf: 'center', marginTop: 6, marginBottom: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9' },
  dmTypingText: { color: colors.sub, fontSize: 12, fontWeight: '900' },
  dmHubPostPreview: { margin: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa' },
  dmHubPostLabel: { color: colors.sub, fontSize: 11, fontWeight: '900' },
  dmHubPostText: { marginTop: 5, color: colors.text, lineHeight: 20, fontWeight: '700' },
  dmHubList: { paddingHorizontal: 12, paddingBottom: 18, gap: 8 },
  dmHubCard: { minHeight: 72, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  dmHubCardKicker: { color: '#31577d', fontSize: 10, fontWeight: '900', marginBottom: 5 },
  dmHubCardTitle: { color: colors.text, fontWeight: '900' },
  dmHubCardBody: { marginTop: 5, color: colors.sub, lineHeight: 18 },
  dmHubEmpty: { padding: 12, color: colors.sub, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 }
});
