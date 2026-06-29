import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSDmThread, SNSGodCharacter, SNSGodState, SNSPost } from '../types';
import { generateSNSPost, generateSnsDmReply, snsOptionsFor } from '../logic/sns';
import { makeId } from '../logic/ids';
import { pickImageDataUri } from '../logic/media';

export function SNSScreen({ state, platform, onOpenSettings, onOpenNotifications, onChange }: {
  state: SNSGodState;
  platform: SNSPost['platform'];
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const availableCharacters = state.characters.filter(character => character.randomTemporary !== true);
  const recentPostAtByCharacter = new Map<string, number>();
  (state.snsPosts || [])
    .filter(post => post.platform === platform)
    .forEach(post => {
      const previous = recentPostAtByCharacter.get(post.characterId) || 0;
      recentPostAtByCharacter.set(post.characterId, Math.max(previous, Number(post.createdAt || 0)));
    });
  const sortedCharacters = availableCharacters
    .map((character, index) => ({ character, index, recentAt: recentPostAtByCharacter.get(character.id) || 0 }))
    .sort((a, b) => (b.recentAt - a.recentAt) || (a.index - b.index))
    .map(item => item.character);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageData, setImageData] = useState('');
  const [activeDmId, setActiveDmId] = useState('');
  const [dmHub, setDmHub] = useState<{ postId: string; platformIndex: number } | null>(null);
  const [dmText, setDmText] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDmList, setShowDmList] = useState(false);
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
  const posts = (state.snsPosts || [])
    .filter(post => post.platform === platform && (!selectedCharacterId || post.characterId === selectedCharacterId))
    .slice()
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const dmThreads = (state.snsDmThreads || []).filter(thread => !selectedCharacterId || thread.characterId === selectedCharacterId);
  const unreadNotifications = (state.notifications || []).filter(item => !item.read).length;

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

  async function generate() {
    if (!selectedCharacter || loading) return;
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

  function postContext(post: SNSPost) {
    return `${platform === 'instagram' ? 'Instagram' : 'X'} post by ${post.displayName || selectedCharacter?.name || 'Character'}: ${post.content}`;
  }

  async function openSnsDm(post: SNSPost) {
    const character = state.characters.find(item => item.id === post.characterId);
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
        title: `${platform === 'instagram' ? 'Instagram' : 'X'} DM`,
        context: postContext(post),
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
    ...(hubPost.dms || []).map((dm, index) => ({ id: String(dm.id || `postdm_${index}`), title: dm.title, messages: dm.messages })),
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
    ...(activePostDmPost.dms || []).map((dm, index) => ({ id: String(dm.id || `postdm_${index}`), title: dm.title, messages: dm.messages })),
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

  return (
    <View style={[styles.screen, platform === 'twitter' && styles.xScreen]}>
      {activeDmId ? (
        activePostDm ? (
          <ReadOnlyDmModal
            platform={platform}
            title={activePostDm.title}
            messages={activePostDm.messages}
            onClose={() => setActiveDmId('')}
          />
        ) : (
          <DmModal
            thread={(state.snsDmThreads || []).find(item => item.id === activeDmId)}
            character={state.characters.find(character => character.id === (state.snsDmThreads || []).find(item => item.id === activeDmId)?.characterId)}
            platform={platform}
            userName={state.config.userName || '나'}
            value={dmText}
            onChangeText={setDmText}
            onClose={() => setActiveDmId('')}
            onSend={() => sendDmReply(true)}
            onAiSend={() => sendDmReply(false)}
            loading={loading}
          />
        )
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
          <Pressable accessibilityLabel="SNS 생성" onPress={() => setShowGenerator(value => !value)} style={[styles.actionPill, showGenerator && styles.actionPillActive]}>
            <Text style={[styles.actionPillText, showGenerator && styles.actionPillTextActive]}>SNS 생성</Text>
          </Pressable>
          <Pressable accessibilityLabel="SNS DM" onPress={() => setShowDmList(value => !value)} style={[styles.roundIcon, platform === 'twitter' && styles.xRoundIcon, showDmList && styles.roundIconActive]}>
            <Text style={[styles.roundIconText, showDmList && styles.roundIconTextActive]}>DM</Text>
            {dmThreads.some(thread => thread.unread) ? <Text style={styles.alertBadge}>{dmThreads.reduce((sum, thread) => sum + (thread.unread || 0), 0)}</Text> : null}
          </Pressable>
          <Pressable accessibilityLabel="알림" onPress={onOpenNotifications} style={[styles.roundIcon, platform === 'twitter' && styles.xRoundIcon]}>
            <Text style={styles.roundIconText}>!</Text>
            {unreadNotifications > 0 ? <Text style={styles.alertBadge}>{unreadNotifications}</Text> : null}
          </Pressable>
          <Pressable accessibilityLabel="설정" onPress={onOpenSettings} style={[styles.roundIcon, platform === 'twitter' && styles.xRoundIcon]}>
            <Text style={styles.roundIconText}>⚙</Text>
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
          renderItem={({ item }) => <CharacterChip character={item} active={item.id === selectedCharacterId} platform={platform} onPress={() => setSelectedCharacterId(item.id === selectedCharacterId ? '' : item.id)} />}
        />
      </View>

      {showGenerator ? <View style={[styles.generator, platform === 'twitter' && styles.xGenerator]}>
        <Text style={[styles.generatorTitle, platform === 'twitter' && styles.xPanelText]}>{selectedCharacter?.name || '캐릭터'} SNS 설정</Text>
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
            <TextInput value={draftCommentQty} onChangeText={setDraftCommentQty} style={[styles.fieldInput, platform === 'twitter' && styles.xInput]} placeholder="2-4" placeholderTextColor="#8c8c8c" />
          </View>
          <View style={styles.col}>
            <Text style={[styles.fieldLabel, platform === 'twitter' && styles.xSubtitle]}>무드</Text>
            <TextInput value={draftMood} onChangeText={setDraftMood} style={[styles.fieldInput, platform === 'twitter' && styles.xInput]} placeholder="그날 기분에 따라" placeholderTextColor="#8c8c8c" />
          </View>
        </View>
        <Text style={[styles.fieldLabel, platform === 'twitter' && styles.xSubtitle]}>소재</Text>
        <TextInput value={draftSubject} onChangeText={setDraftSubject} style={[styles.fieldInput, styles.subjectInput, platform === 'twitter' && styles.xInput]} placeholder="일상 잡담, 짧은 트윗, 방금 대화 등 원하는 방향" placeholderTextColor="#8c8c8c" multiline />
        <View style={styles.optionBadges}>
          <Text style={styles.optionBadge}>{draftTextOnly ? '글만' : draftAutoImage ? '이미지 가능' : '이미지 끔'}</Text>
          <Text style={styles.optionBadge}>{draftNoDM ? 'DM 끔' : draftThirdPartyDM ? '제3자 DM 허용' : 'DM 가능'}</Text>
          <Text style={styles.optionBadge}>{platform === 'instagram' ? 'Instagram 별도 설정' : 'X 별도 설정'}</Text>
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
      </View> : null}

      {showDmList && dmThreads.length ? (
        <View style={styles.dmStrip}>
          <Text style={styles.dmTitle}>SNS DM</Text>
          <FlatList
            horizontal
            data={dmThreads.slice(0, 8)}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.dmList}
            renderItem={({ item }) => (
              <Pressable onPress={() => setActiveDmId(item.id)}>
                <DmCard thread={item} platform={platform} character={state.characters.find(character => character.id === item.characterId)} userName={state.config.userName || '나'} />
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.feed, platform === 'instagram' && styles.instagramFeed, platform === 'twitter' && styles.twitterFeed]}
        ListEmptyComponent={<Text style={styles.emptyText}>아직 {selectedCharacter?.name || '이 캐릭터'}의 {platform === 'instagram' ? 'Instagram' : 'Twitter/X'} 게시물이 없습니다.</Text>}
        renderItem={({ item }) => <PostCard platform={platform} post={item} character={state.characters.find(character => character.id === item.characterId)} onLike={() => likePost(item.id)} onDelete={() => deletePost(item.id)} onComment={content => addComment(item.id, content)} onOpenDm={() => openSnsDm(item)} />}
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

function CharacterChip({ character, active, platform, onPress }: { character: SNSGodCharacter; active: boolean; platform: SNSPost['platform']; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.characterChip, active && styles.characterChipActive, platform === 'twitter' && styles.xCharacterChip, platform === 'twitter' && active && styles.xCharacterChipActive]}>
      <Avatar character={character} size={52} />
      <Text style={[styles.characterName, platform === 'twitter' && styles.xPanelText]} numberOfLines={1}>{character.name}</Text>
    </Pressable>
  );
}

type DmLikeMessage = { id?: string; from: string; author?: string; body: string; createdAt?: number };

function platformName(platform: SNSPost['platform']) {
  return platform === 'instagram' ? 'Instagram' : 'X';
}

function dmSenderName(message: DmLikeMessage, character?: SNSGodCharacter, userName = '나') {
  if (message.from === 'user') return userName;
  if (message.from === 'character') return character?.name || message.author || 'Character';
  if (message.from === 'thirdParty') return message.author || '제3자';
  return message.author || message.from || '상대';
}

function isUserDmMessage(message: DmLikeMessage, userName = '나') {
  return message.from === 'user' || message.from === userName || message.author === userName;
}

function DmCard({ thread, platform, character, userName }: { thread: SNSDmThread; platform: SNSPost['platform']; character?: SNSGodCharacter; userName: string }) {
  const last = thread.messages[thread.messages.length - 1];
  const sender = last ? dmSenderName(last, character, userName) : '새 대화';
  const target = character?.name || thread.title;
  return (
    <View style={styles.dmCard}>
      <View style={styles.dmCardTop}>
        <Text style={styles.dmPlatformPill}>{platformName(platform)}</Text>
        {thread.unread ? <Text style={styles.dmBadge}>{thread.unread}</Text> : null}
      </View>
      <Text style={styles.dmCardTitle} numberOfLines={1}>{target}</Text>
      <Text style={styles.dmCardMeta} numberOfLines={1}>대상: {thread.title}</Text>
      <Text style={styles.dmCardBody} numberOfLines={2}>{sender}: {last?.body || '새 SNS DM'}</Text>
    </View>
  );
}

function DmModal({ thread, character, platform, userName, value, onChangeText, onClose, onSend, onAiSend, loading }: {
  thread?: SNSDmThread;
  character?: SNSGodCharacter;
  platform: SNSPost['platform'];
  userName: string;
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  onAiSend: () => void;
  loading: boolean;
}) {
  if (!thread) return null;
  return (
    <View style={styles.modal}>
      <View style={[styles.dmPanel, platform === 'twitter' && styles.xDmPanel]}>
        <View style={[styles.dmPanelHeader, platform === 'twitter' && styles.xDmPanelHeader]}>
          <View style={styles.dmHeaderIdentity}>
            <Avatar character={character} size={38} />
            <View style={styles.dmHeaderText}>
              <Text style={[styles.dmPanelTitle, platform === 'twitter' && styles.xDmPanelTitle]}>{character?.name || thread.title}</Text>
              <Text style={[styles.dmPanelSub, platform === 'twitter' && styles.xDmPanelSub]}>{platformName(platform)} DM · 받는 사람 {character?.name || '상대'} · 보낸 사람 {userName}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <FlatList
          data={thread.messages}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.dmMessages, platform === 'twitter' && styles.xDmMessages]}
          renderItem={({ item }) => (
            <DmMessageBubble message={item} character={character} userName={userName} platform={platform} />
          )}
        />
        <View style={[styles.dmComposer, platform === 'twitter' && styles.xDmComposer]}>
          <TextInput value={value} onChangeText={onChangeText} style={[styles.dmInput, platform === 'twitter' && styles.xDmInput]} placeholder={`${character?.name || '상대'}에게 DM`} placeholderTextColor="#aaa" />
          <Pressable onPress={onSend} style={styles.dmSend}><Text style={styles.dmSendText}>보내기</Text></Pressable>
          <Pressable onPress={onAiSend} disabled={loading} style={[styles.dmSend, styles.dmAiSend, loading && styles.disabled]}><Text style={styles.dmAiText}>저장만</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function DmMessageBubble({ message, character, userName, platform }: { message: DmLikeMessage; character?: SNSGodCharacter; userName: string; platform: SNSPost['platform'] }) {
  const mine = isUserDmMessage(message, userName);
  return (
    <View style={[styles.dmMessageRow, mine && styles.dmMessageRowMine]}>
      {!mine ? <View style={styles.dmAvatarMini}><Text style={styles.dmAvatarMiniText}>{dmSenderName(message, character, userName).slice(0, 1)}</Text></View> : null}
      <View style={[styles.dmBubble, mine ? styles.dmBubbleMine : styles.dmBubbleOther, platform === 'twitter' && !mine && styles.xDmBubbleOther, platform === 'twitter' && mine && styles.xDmBubbleMine]}>
        <Text style={[styles.dmSpeaker, mine && styles.dmSpeakerMine, platform === 'twitter' && !mine && styles.xDmSpeaker]}>{mine ? `${userName} · 보낸 메시지` : `${dmSenderName(message, character, userName)} · 받은 메시지`}</Text>
        <Text style={[styles.dmBubbleText, platform === 'twitter' && !mine && styles.xDmBubbleText, platform === 'twitter' && mine && styles.xDmBubbleTextMine]}>{message.body}</Text>
      </View>
    </View>
  );
}

function ReadOnlyDmModal({ platform, title, messages, onClose }: {
  platform: SNSPost['platform'];
  title: string;
  messages: { id?: string; from: string; body: string; createdAt?: number }[];
  onClose: () => void;
}) {
  return (
    <View style={styles.modal}>
      <View style={[styles.dmPanel, platform === 'twitter' && styles.xDmPanel]}>
        <View style={[styles.dmPanelHeader, platform === 'twitter' && styles.xDmPanelHeader]}>
          <View style={styles.dmHeaderText}>
            <Text style={[styles.dmPanelTitle, platform === 'twitter' && styles.xDmPanelTitle]}>{title}</Text>
            <Text style={[styles.dmPanelSub, platform === 'twitter' && styles.xDmPanelSub]}>{platformName(platform)} 읽기 전용 DM</Text>
          </View>
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <FlatList
          data={messages}
          keyExtractor={(item, index) => String(item.id || `${item.createdAt || 0}_${index}`)}
          contentContainerStyle={[styles.dmMessages, platform === 'twitter' && styles.xDmMessages]}
          renderItem={({ item }) => (
            <DmMessageBubble message={item} userName="나" platform={platform} />
          )}
        />
      </View>
    </View>
  );
}

function SnsDmHubModal({ post, character, userThread, thirdPartyDms, onClose, onOpenUserThread, onOpenThirdParty }: {
  post: SNSPost;
  character?: SNSGodCharacter;
  userThread?: SNSDmThread;
  thirdPartyDms: { id: string; title: string; messages: { id?: string; from: string; body: string; createdAt?: number }[] }[];
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
              <Text style={styles.dmPanelTitle}>{character?.name || 'Character'} DM</Text>
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
              <Text style={styles.dmHubCardTitle}>나와 {character?.name || '캐릭터'}의 DM</Text>
              <Text style={styles.dmHubCardBody} numberOfLines={2}>{lastUserDm ? `${dmSenderName(lastUserDm, character, '나')}: ${lastUserDm.body}` : '아직 메시지가 없습니다.'}</Text>
            </Pressable>
          ) : null}
          {thirdPartyDms.map(dm => (
            <Pressable key={dm.id} onPress={() => onOpenThirdParty(dm.id)} style={styles.dmHubCard}>
              <Text style={styles.dmHubCardKicker}>제3자 DM</Text>
              <Text style={styles.dmHubCardTitle}>{dm.title}</Text>
              <Text style={styles.dmHubCardBody} numberOfLines={2}>{dm.messages[dm.messages.length - 1] ? `${dm.messages[dm.messages.length - 1]?.from}: ${dm.messages[dm.messages.length - 1]?.body}` : '읽기 전용 DM'}</Text>
            </Pressable>
          ))}
          {!thirdPartyDms.length ? <Text style={styles.dmHubEmpty}>다른 DM은 아직 없습니다.</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

function PostCard({ platform, post, character, onLike, onDelete, onComment, onOpenDm }: { platform: SNSPost['platform']; post: SNSPost; character?: SNSGodCharacter; onLike: () => void; onDelete: () => void; onComment: (content: string) => void; onOpenDm: () => void }) {
  const [comment, setComment] = useState('');
  function submitComment() {
    onComment(comment);
    setComment('');
  }
  return (
    <View style={[styles.postCard, platform === 'instagram' && styles.instagramCard, platform === 'twitter' && styles.tweetCard]}>
      <View style={[styles.postHeader, platform === 'instagram' && styles.instagramHeader, platform === 'twitter' && styles.xPostHeader]}>
        <Avatar character={character} size={42} />
        <View style={styles.postMeta}>
          <Text style={[styles.postName, platform === 'twitter' && styles.xPostName]}>{post.displayName || character?.name || 'Character'}</Text>
          <Text style={[styles.postTime, platform === 'twitter' && styles.xPostTime]}>@{post.handle || character?.handle || character?.id} · {compactTime(post.createdAt)}</Text>
        </View>
        <Pressable accessibilityLabel="게시물 삭제" onPress={onDelete} style={[styles.moreButton, platform === 'twitter' && styles.xMoreButton]}>
          <Text style={[styles.more, platform === 'twitter' && styles.xMore]}>...</Text>
        </Pressable>
      </View>
      {platform === 'instagram' ? (
        <>
          {post.image ? <Image source={{ uri: post.image }} style={styles.postImage} /> : <View style={styles.instagramTextOnly}><Text style={styles.instagramTextOnlyText}>{post.content}</Text></View>}
          <View style={styles.instagramActions}>
            <Pressable onPress={onLike}><Text style={styles.instagramAction}>♡</Text></Pressable>
            <Text style={styles.instagramAction}>◌</Text>
            <Text style={styles.instagramAction}>↗</Text>
            <View style={styles.actionSpacer} />
            <Text style={styles.instagramAction}>▢</Text>
          </View>
          <Text style={styles.instagramLikes}>좋아요 {post.likes || 0}개</Text>
          <Text style={styles.instagramCaption}><Text style={styles.instagramCaptionName}>{post.handle || character?.handle || character?.id}</Text> {post.content}</Text>
        </>
      ) : (
        <>
          <Text style={styles.tweetContent}>{post.content}</Text>
          {post.image ? <Image source={{ uri: post.image }} style={styles.tweetImage} /> : null}
        </>
      )}
      {post.hashtags?.length ? <Text style={[styles.tags, platform === 'twitter' && styles.xTags]}>{post.hashtags.map(tag => `#${tag}`).join(' ')}</Text> : null}
      {platform === 'twitter' ? <View style={styles.xStats}><Text style={styles.xStatText}>{post.reposts || 0} reposts</Text><Text style={styles.xStatText}>{post.likes || 0} likes</Text><Text style={styles.xStatText}>{post.views || 0} views</Text></View> : null}
      <View style={[styles.postFooter, platform === 'twitter' && styles.xFooter]}>
        <Pressable onPress={onLike}><Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText]}>{platform === 'twitter' ? `♡ ${post.likes || 0}` : `좋아요 ${post.likes || 0}개`}</Text></Pressable>
        <Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText]}>{platform === 'twitter' ? `💬 ${post.replies || post.comments?.length || 0}` : `댓글 ${post.replies || post.comments?.length || 0}개`}</Text>
        <Pressable onPress={onOpenDm}><Text style={[styles.footerText, platform === 'twitter' && styles.xFooterText]}>DM</Text></Pressable>
        {post.platform === 'twitter' ? <Text style={styles.xFooterText}>↗</Text> : null}
      </View>
      {(post.comments || []).slice(-5).map(item => (
        <View key={item.id} style={styles.commentRow}>
          <Text style={styles.commentAuthor}>{item.author}</Text>
          <Text style={styles.commentText}>{item.content}</Text>
        </View>
      ))}
      <View style={[styles.commentComposer, platform === 'twitter' && styles.xCommentComposer]}>
        <TextInput value={comment} onChangeText={setComment} style={styles.commentInput} placeholder="댓글 달기" placeholderTextColor="#aaa" />
        <Pressable onPress={submitComment} style={styles.commentButton}><Text style={styles.commentButtonText}>게시</Text></Pressable>
      </View>
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
  xTitle: { color: '#e7e9ea', fontSize: 21 },
  xPanelText: { color: '#e7e9ea' },
  subtitle: { color: colors.sub, fontSize: 12, fontWeight: '700' },
  xSubtitle: { color: '#71767b' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionPill: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionPillActive: { backgroundColor: colors.accent, borderColor: '#c4a842' },
  actionPillText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  actionPillTextActive: { color: '#241a00' },
  roundIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee8dc', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  xRoundIcon: { backgroundColor: '#000000', borderColor: '#2f3336' },
  roundIconActive: { backgroundColor: '#111', borderColor: '#111' },
  roundIconText: { color: colors.text, fontWeight: '900', fontSize: 13, lineHeight: 18 },
  roundIconTextActive: { color: '#fff' },
  alertBadge: { position: 'absolute', top: -3, right: -4, minWidth: 19, height: 19, borderRadius: 10, overflow: 'hidden', lineHeight: 19, textAlign: 'center', backgroundColor: colors.danger, color: '#fff', fontWeight: '900', fontSize: 11 },
  characterRail: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  xCharacterRail: { borderBottomColor: '#2f3336', backgroundColor: '#000000' },
  characterRailContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  characterChip: { width: 78, alignItems: 'center', gap: 6, padding: 8, borderRadius: 12 },
  characterChipActive: { backgroundColor: '#fff1b8' },
  xCharacterChip: { borderRadius: 0 },
  xCharacterChipActive: { backgroundColor: '#101214' },
  allCharacterAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  xAllCharacterAvatar: { borderColor: '#2f3336', backgroundColor: '#000000' },
  allCharacterAvatarText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  characterName: { fontSize: 12, color: colors.text, fontWeight: '900' },
  generator: { margin: 12, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  xGenerator: { backgroundColor: '#080808', borderColor: '#2f3336' },
  generatorTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  generatorSub: { marginTop: 3, color: colors.sub, fontSize: 12 },
  optionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  optionBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef4ff', color: '#305170', fontSize: 11, fontWeight: '900', overflow: 'hidden' },
  settingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  togglePill: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', alignItems: 'center', justifyContent: 'center' },
  togglePillOn: { backgroundColor: colors.accent, borderColor: '#c4a842' },
  toggleText: { color: colors.sub, fontWeight: '900', fontSize: 12 },
  toggleTextOn: { color: '#241a00' },
  twoCols: { flexDirection: 'row', gap: 10, marginTop: 10 },
  col: { flex: 1 },
  fieldLabel: { marginTop: 10, marginBottom: 5, color: colors.sub, fontSize: 12, fontWeight: '900' },
  fieldInput: { minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fffefa', paddingHorizontal: 10, color: colors.text },
  subjectInput: { minHeight: 64, paddingVertical: 9 },
  xInput: { backgroundColor: '#000', borderColor: '#2f3336', color: '#e7e9ea' },
  generatorActions: { flexDirection: 'row', gap: 8 },
  primary: { marginTop: 12, minHeight: 42, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241a00', fontWeight: '900' },
  secondary: { marginTop: 10, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffefa' },
  secondaryText: { color: colors.text, fontWeight: '900' },
  pendingImage: { marginTop: 12, width: '100%', height: 180, borderRadius: 8, backgroundColor: '#eee' },
  feed: { padding: 12, gap: 14, paddingBottom: 28 },
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
  tweetContent: { paddingTop: 8, fontSize: 16, lineHeight: 23 },
  instagramTextOnly: { width: '100%', aspectRatio: 1, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center', padding: 28 },
  instagramTextOnlyText: { color: '#262626', fontSize: 20, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  instagramActions: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  instagramAction: { color: '#262626', fontSize: 24, fontWeight: '800' },
  actionSpacer: { flex: 1 },
  instagramLikes: { paddingHorizontal: 12, color: '#262626', fontWeight: '900' },
  instagramCaption: { paddingHorizontal: 12, paddingTop: 7, color: '#262626', lineHeight: 20 },
  instagramCaptionName: { fontWeight: '900' },
  tags: { paddingHorizontal: 16, paddingBottom: 14, color: '#77b8ff', fontWeight: '800' },
  xTags: { color: '#1d9bf0' },
  xStats: { minHeight: 36, paddingHorizontal: 16, flexDirection: 'row', gap: 14, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2f3336' },
  xStatText: { color: '#71767b', fontWeight: '800' },
  postFooter: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  xFooter: { borderTopColor: '#2f3336', justifyContent: 'space-between' },
  footerText: { color: colors.sub, fontWeight: '800' },
  xFooterText: { color: '#71767b', fontWeight: '800' },
  commentRow: { paddingHorizontal: 16, paddingVertical: 4, flexDirection: 'row', gap: 8 },
  commentAuthor: { color: colors.text, fontWeight: '900' },
  commentText: { flex: 1, color: colors.text },
  commentComposer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  xCommentComposer: { borderTopColor: '#2f3336', backgroundColor: '#000000' },
  commentInput: { flex: 1, minHeight: 38, borderRadius: 19, paddingHorizontal: 12, backgroundColor: '#f7f5ef', color: colors.text },
  commentButton: { minWidth: 52, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  commentButtonText: { color: '#241a00', fontWeight: '900' },
  modal: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  dmPanel: { maxHeight: '88%', backgroundColor: '#ffffff', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  xDmPanel: { backgroundColor: '#000000' },
  dmPanelHeader: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbdbdb' },
  xDmPanelHeader: { borderBottomColor: '#2f3336' },
  dmHeaderIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dmHeaderText: { flex: 1, minWidth: 0 },
  dmHubHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dmHubSub: { marginTop: 2, color: colors.sub, fontSize: 11, fontWeight: '800' },
  dmPanelTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  xDmPanelTitle: { color: '#e7e9ea' },
  dmPanelSub: { marginTop: 2, color: '#737373', fontSize: 11, fontWeight: '800' },
  xDmPanelSub: { color: '#71767b' },
  dmPanelClose: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#fff' },
  dmPanelCloseText: { lineHeight: 36, color: colors.text, fontWeight: '900' },
  dmMessages: { padding: 12, gap: 9, backgroundColor: '#ffffff' },
  xDmMessages: { backgroundColor: '#000000' },
  dmMessageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  dmMessageRowMine: { justifyContent: 'flex-end' },
  dmAvatarMini: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e9edf5', alignItems: 'center', justifyContent: 'center' },
  dmAvatarMiniText: { color: '#334155', fontSize: 11, fontWeight: '900' },
  dmBubble: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 9 },
  dmBubbleOther: { alignSelf: 'flex-start', borderRadius: 18, borderBottomLeftRadius: 5, backgroundColor: '#efefef' },
  dmBubbleMine: { alignSelf: 'flex-end', borderRadius: 18, borderBottomRightRadius: 5, backgroundColor: '#3797f0' },
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
