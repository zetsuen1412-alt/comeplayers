import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, Platform, StyleSheet, View, type FlatList, type KeyboardEvent, type KeyboardMetrics, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";

/** Keep the complete conversation, including the composer, above the IME. */
export function ChatKeyboardLayout({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const container = useRef<View>(null);
  const measureVersion = useRef(0);
  const [frame, setFrame] = useState({ y: 0, height: 0 });
  const [keyboard, setKeyboard] = useState<KeyboardMetrics | undefined>(() => Keyboard.metrics());
  const measure = useCallback(() => {
    const version = ++measureVersion.current;
    container.current?.measureInWindow((_x, y, _width, height) => {
      if (version === measureVersion.current) setFrame(current => current.y === y && current.height === height ? current : { y, height });
    });
  }, []);
  useEffect(() => {
    const show = (event: KeyboardEvent) => {
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      setKeyboard(event.endCoordinates);
      measure();
    };
    const hide = (event: KeyboardEvent) => {
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      setKeyboard(undefined);
      measure();
    };
    const shown = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", show);
    const frameChanged = Platform.OS === "ios" ? Keyboard.addListener("keyboardWillChangeFrame", show) : undefined;
    const hidden = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", hide);
    // Opening a conversation from a focused search must also handle an IME
    // which was visible before this component subscribed to keyboard events.
    setKeyboard(Keyboard.metrics());
    return () => { measureVersion.current++; shown.remove(); hidden.remove(); frameChanged?.remove(); };
  }, [measure]);
  const overlap = keyboard ? Math.max(0, Math.min(frame.height, frame.y + frame.height - keyboard.screenY)) : 0;

  return <View ref={container} collapsable={false} style={[styles.fill, style]} onLayout={measure}>
    {/* Measure in window coordinates, including the real safe-area origin.
        Only cover the remaining overlap: adjustResize may have already reduced
        the parent height, while edge-to-edge layouts keep their full height.
        Measuring the outer view avoids a padding/layout feedback loop. */}
    <View style={[styles.fill, { paddingBottom: overlap }]}>
      {children}
    </View>
  </View>;
}

const LATEST_THRESHOLD = 80;
const maintainPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: LATEST_THRESHOLD };

/** Both message lists are inverted: offset zero is the newest message. */
export function useChatScrollAnchor<Message>(conversationId: string, unfiltered: boolean) {
  const listRef = useRef<FlatList<Message>>(null);
  const nearLatest = useRef(true);
  const frame = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const followLatest = useCallback(() => {
    if (!nearLatest.current || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (nearLatest.current) listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, []);
  const scrollToLatest = useCallback(() => {
    nearLatest.current = true;
    followLatest();
  }, [followLatest]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    nearLatest.current = event.nativeEvent.contentOffset.y <= LATEST_THRESHOLD;
  }, []);
  const onScrollBeginDrag = useCallback(() => {
    cancel();
    nearLatest.current = false;
  }, [cancel]);

  useEffect(() => {
    nearLatest.current = true;
    cancel();
    return cancel;
  }, [conversationId, unfiltered, cancel]);

  const listProps = useMemo(() => ({
    ref: listRef,
    style: styles.list,
    onScroll,
    onScrollBeginDrag,
    scrollEventThrottle: 16,
    onLayout: followLatest,
    onContentSizeChange: followLatest,
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: Platform.OS === "ios" ? "interactive" as const : "on-drag" as const,
    maintainVisibleContentPosition: unfiltered ? maintainPosition : undefined,
  }), [onScroll, onScrollBeginDrag, followLatest, unfiltered]);

  return { listProps, scrollToLatest };
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 }, list: { flex: 1, minHeight: 0 } });
