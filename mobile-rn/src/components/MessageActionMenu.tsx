import React from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export type MessageActionAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Copy/delete popup rendered in a transparent Modal so it always sits above
 * FlatList bubbles (row zIndex cannot beat later list cells reliably).
 */
export function MessageActionMenu({
  visible,
  onCopy,
  onInfo,
  onDelete,
  onClose,
  anchor,
  align = 'center'
}: {
  visible: boolean;
  onCopy: () => void;
  onInfo?: () => void;
  onDelete: () => void;
  onClose: () => void;
  anchor?: MessageActionAnchor | null;
  align?: 'center' | 'left' | 'right';
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  if (!visible) return null;

  const menuWidth = onInfo ? 190 : 120;
  const menuHeight = 38;
  const gap = 8;
  let left = 16;
  let top = 80;
  if (anchor) {
    if (align === 'right') left = anchor.x + anchor.width - menuWidth;
    else if (align === 'left') left = anchor.x;
    else left = anchor.x + anchor.width / 2 - menuWidth / 2;
    // Prefer above the bubble; if clipped, place below.
    top = anchor.y - menuHeight - gap;
    if (top < 12) top = anchor.y + anchor.height + gap;
  }
  left = Math.max(10, Math.min(left, windowWidth - menuWidth - 10));
  top = Math.max(10, Math.min(top, windowHeight - menuHeight - 10));

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable accessibilityLabel="메시지 메뉴 닫기" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.menu, { top, left, width: menuWidth }]}>
          <Pressable
            accessibilityLabel="메시지 복사"
            onPress={() => {
              onClose();
              onCopy();
            }}
            style={styles.button}
          >
            <Text style={styles.text}>복사</Text>
          </Pressable>
          {onInfo ? (
            <>
              <View style={styles.divider} />
              <Pressable
                accessibilityLabel="메시지 생성 정보"
                onPress={() => {
                  onClose();
                  onInfo();
                }}
                style={styles.button}
              >
                <Text style={styles.text}>정보</Text>
              </Pressable>
            </>
          ) : null}
          <View style={styles.divider} />
          <Pressable
            accessibilityLabel="메시지 삭제"
            onPress={() => {
              onClose();
              onDelete();
            }}
            style={styles.button}
          >
            <Text style={[styles.text, styles.danger]}>삭제</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent'
  },
  menu: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 40,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.98)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  button: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.16)'
  },
  text: {
    color: '#f5f5f5',
    fontSize: 13,
    fontWeight: '800'
  },
  danger: {
    color: '#ff8a8a'
  }
});
