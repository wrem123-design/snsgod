import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { colors } from '../theme';
import { SNSDmThread, SNSGodCharacter, SNSGodState, SNSPost } from '../types';
import { generateSNSCommentReply, generateSNSPost, generateSnsDmReply } from '../logic/sns';
import { makeId } from '../logic/ids';
import { pickImageDataUri } from '../logic/media';

export function SNSScreen({ state, platform, onOpenSettings, onOpenNotifications, onChange }: {
  state: SNSGodState;
  platform: SNSPost['platform'];
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onChange: (next: SNSGodState) => Promise<void> | void;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(state.characters[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [imageData, setImageData] = useState('');
  const [activeDmId, setActiveDmId] = useState('');
  const [dmText, setDmText] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDmList, setShowDmList] = useState(false);
  const selectedCharacter = state.characters.find(character => character.id === selectedCharacterId) || state.characters[0];
  const posts = (state.snsPosts || []).filter(post => post.platform === platform && (!selectedCharacter?.id || post.characterId === selectedCharacter.id));
  const dmThreads = (state.snsDmThreads || []).filter(thread => !selectedCharacter?.id || thread.characterId === selectedCharacter.id);
  const unreadNotifications = (state.notifications || []).filter(item => !item.read).length;
  const snsOptions = state.config.sns || {};

  async function generate() {
    if (!selectedCharacter || loading) return;
    setLoading(true);
    try {
      const generated = await generateSNSPost(state, selectedCharacter, platform);
      const next = imageData
        ? { ...generated, snsPosts: generated.snsPosts.map((post, index) => index === 0 ? { ...post, image: imageData } : post) }
        : generated;
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

  async function addAiComment(post: SNSPost, content: string) {
    const trimmed = content.trim() || '이 게시물에 어울리는 자연스러운 댓글';
    setLoading(true);
    try {
      const result = await generateSNSCommentReply(state, post, trimmed);
      const profile = state.config.apiProfiles[state.config.apiType] || {};
      await onChange({
        ...state,
        config: { ...state.config, apiProfiles: { ...state.config.apiProfiles, [state.config.apiType]: { ...profile, apiKeyIndex: result.keyIndex } } },
        snsPosts: (state.snsPosts || []).map(item => item.id === post.id ? { ...item, comments: [...(item.comments || []), result.comment], replies: (item.replies || item.comments?.length || 0) + 1 } : item)
      });
    } catch (error) {
      Alert.alert('AI 댓글 생성 실패', error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
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

  return (
    <View style={[styles.screen, platform === 'twitter' && styles.xScreen]}>
      {activeDmId ? (
        <DmModal
          thread={(state.snsDmThreads || []).find(item => item.id === activeDmId)}
          value={dmText}
          onChangeText={setDmText}
          onClose={() => setActiveDmId('')}
          onSend={() => sendDmReply(false)}
          onAiSend={() => sendDmReply(true)}
          loading={loading}
        />
      ) : null}
      <View style={[styles.header, platform === 'twitter' && styles.xHeader]}>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, platform === 'twitter' && styles.xTitle]}>{platform === 'instagram' ? 'Instagram' : 'X'}</Text>
          <Text style={[styles.subtitle, platform === 'twitter' && styles.xSubtitle]}>{selectedCharacter?.name || '전체'} · {posts.length} posts{snsOptions.nsfw ? ' · NSFW 뒷계' : ''}</Text>
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
          data={state.characters}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.characterRailContent}
          renderItem={({ item }) => <CharacterChip character={item} active={item.id === selectedCharacterId} platform={platform} onPress={() => setSelectedCharacterId(item.id)} />}
        />
      </View>

      {showGenerator ? <View style={[styles.generator, platform === 'twitter' && styles.xGenerator]}>
        <Text style={[styles.generatorTitle, platform === 'twitter' && styles.xPanelText]}>SNS 생성</Text>
        <Text style={[styles.generatorSub, platform === 'twitter' && styles.xSubtitle]}>{selectedCharacter?.name || '캐릭터'} · {platform === 'instagram' ? 'Instagram' : 'X'} · 댓글 {snsOptions.commentQty || '2-4'} · {snsOptions.autoComments === false ? 'AI 댓글 끔' : 'AI 댓글 자동'} · {snsOptions.anonymous ? '익명계' : '공개계'}{snsOptions.nsfw ? ' · NSFW 뒷계' : ''}</Text>
        <View style={styles.optionBadges}>
          <Text style={styles.optionBadge}>{snsOptions.textOnly ? '글만' : snsOptions.autoImage === false ? '이미지 끔' : '이미지 가능'}</Text>
          <Text style={styles.optionBadge}>{snsOptions.noDM ? 'DM 끔' : snsOptions.thirdPartyDM ? '제3자 DM 허용' : 'DM 가능'}</Text>
          {snsOptions.hybridNsfwSplit !== false ? <Text style={styles.optionBadge}>하이브리드 분리</Text> : null}
        </View>
        {imageData ? <Image source={{ uri: imageData }} style={styles.pendingImage} /> : null}
        <View style={styles.generatorActions}>
          <Pressable onPress={choosePostImage} style={styles.secondary}><Text style={styles.secondaryText}>{imageData ? '사진 변경' : '사진 첨부'}</Text></Pressable>
          {imageData ? <Pressable onPress={clearPostImage} style={styles.secondary}><Text style={styles.secondaryText}>첨부 해제</Text></Pressable> : null}
        </View>
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
            renderItem={({ item }) => <Pressable onPress={() => setActiveDmId(item.id)}><DmCard thread={item} /></Pressable>}
          />
        </View>
      ) : null}

      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.feed, platform === 'instagram' && styles.instagramFeed, platform === 'twitter' && styles.twitterFeed]}
        ListEmptyComponent={<Text style={styles.emptyText}>아직 {selectedCharacter?.name || '이 캐릭터'}의 {platform === 'instagram' ? 'Instagram' : 'Twitter/X'} 게시물이 없습니다.</Text>}
        renderItem={({ item }) => <PostCard platform={platform} post={item} character={state.characters.find(character => character.id === item.characterId)} onLike={() => likePost(item.id)} onDelete={() => deletePost(item.id)} onComment={content => addComment(item.id, content)} onAiComment={content => addAiComment(item, content)} />}
      />
    </View>
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

function DmCard({ thread }: { thread: SNSDmThread }) {
  const last = thread.messages[thread.messages.length - 1];
  return (
    <View style={styles.dmCard}>
      <Text style={styles.dmCardTitle} numberOfLines={1}>{thread.title}</Text>
      <Text style={styles.dmCardBody} numberOfLines={2}>{last?.body || '새 SNS DM'}</Text>
      {thread.unread ? <Text style={styles.dmBadge}>{thread.unread}</Text> : null}
    </View>
  );
}

function DmModal({ thread, value, onChangeText, onClose, onSend, onAiSend, loading }: {
  thread?: SNSDmThread;
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
      <View style={styles.dmPanel}>
        <View style={styles.dmPanelHeader}>
          <Text style={styles.dmPanelTitle}>{thread.title}</Text>
          <Pressable onPress={onClose} style={styles.dmPanelClose}><Text style={styles.dmPanelCloseText}>닫기</Text></Pressable>
        </View>
        <FlatList
          data={thread.messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.dmMessages}
          renderItem={({ item }) => (
            <View style={[styles.dmBubble, item.from === 'user' && styles.dmBubbleMine]}>
              <Text style={styles.dmSpeaker}>{item.author || item.from}</Text>
              <Text style={styles.dmBubbleText}>{item.body}</Text>
            </View>
          )}
        />
        <View style={styles.dmComposer}>
          <TextInput value={value} onChangeText={onChangeText} style={styles.dmInput} placeholder="SNS DM 입력" placeholderTextColor="#aaa" />
          <Pressable onPress={onSend} style={styles.dmSend}><Text style={styles.dmSendText}>보내기</Text></Pressable>
          <Pressable onPress={onAiSend} disabled={loading} style={[styles.dmSend, styles.dmAiSend, loading && styles.disabled]}><Text style={styles.dmAiText}>AI</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function PostCard({ platform, post, character, onLike, onDelete, onComment, onAiComment }: { platform: SNSPost['platform']; post: SNSPost; character?: SNSGodCharacter; onLike: () => void; onDelete: () => void; onComment: (content: string) => void; onAiComment: (content: string) => void }) {
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
        {post.platform === 'twitter' ? <Text style={styles.xFooterText}>↗</Text> : null}
      </View>
      {(post.comments || []).slice(-5).map(item => (
        <View key={item.id} style={styles.commentRow}>
          <Text style={styles.commentAuthor}>{item.author}{item.ai ? ' · AI' : ''}</Text>
          <Text style={styles.commentText}>{item.content}</Text>
        </View>
      ))}
      <View style={[styles.commentComposer, platform === 'twitter' && styles.xCommentComposer]}>
        <TextInput value={comment} onChangeText={setComment} style={styles.commentInput} placeholder="댓글 달기" placeholderTextColor="#aaa" />
        <Pressable onPress={submitComment} style={styles.commentButton}><Text style={styles.commentButtonText}>게시</Text></Pressable>
        <Pressable onPress={() => { onAiComment(comment); setComment(''); }} style={styles.commentButtonAlt}><Text style={styles.commentButtonAltText}>AI</Text></Pressable>
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
  characterName: { fontSize: 12, color: colors.text, fontWeight: '900' },
  generator: { margin: 12, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  xGenerator: { backgroundColor: '#080808', borderColor: '#2f3336' },
  generatorTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  generatorSub: { marginTop: 3, color: colors.sub, fontSize: 12 },
  optionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  optionBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef4ff', color: '#305170', fontSize: 11, fontWeight: '900', overflow: 'hidden' },
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
  dmCard: { width: 180, minHeight: 72, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', position: 'relative' },
  dmCardTitle: { color: colors.text, fontWeight: '900' },
  dmCardBody: { marginTop: 5, color: colors.sub, lineHeight: 18 },
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
  commentButtonAlt: { minWidth: 44, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  commentButtonText: { color: '#241a00', fontWeight: '900' },
  commentButtonAltText: { color: '#fff', fontWeight: '900' },
  modal: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  dmPanel: { maxHeight: '82%', backgroundColor: '#f7f2e9', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  dmPanelHeader: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dmPanelTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  dmPanelClose: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#fff' },
  dmPanelCloseText: { lineHeight: 36, color: colors.text, fontWeight: '900' },
  dmMessages: { padding: 12, gap: 8 },
  dmBubble: { alignSelf: 'flex-start', maxWidth: '84%', padding: 10, borderRadius: 14, backgroundColor: '#fff' },
  dmBubbleMine: { alignSelf: 'flex-end', backgroundColor: '#fee56a' },
  dmSpeaker: { color: colors.sub, fontSize: 11, fontWeight: '900', marginBottom: 3 },
  dmBubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  dmComposer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dmInput: { flex: 1, minHeight: 42, borderRadius: 18, backgroundColor: '#fff', paddingHorizontal: 12, color: colors.text },
  dmSend: { minWidth: 58, minHeight: 42, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  dmAiSend: { backgroundColor: '#111' },
  dmSendText: { color: '#241a00', fontWeight: '900' },
  dmAiText: { color: '#fff', fontWeight: '900' },
  disabled: { opacity: 0.55 }
});
