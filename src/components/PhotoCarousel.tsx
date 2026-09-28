import { useRef, useState } from "react";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

// One large photo at a time, side-scrollable (paged) with clickable arrows
// and dot indicators — used anywhere a solicitud's photos are shown in
// full (the admin detail modal, the OT full-screen page).
export function PhotoCarousel({
  photoUrls,
  height = 240,
}: {
  photoUrls: string[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const ref = useRef<ScrollView>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (photoUrls.length === 0) return null;

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    setActive(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function goTo(index: number) {
    ref.current?.scrollTo({ x: index * width, animated: true });
    setActive(index);
  }

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {photoUrls.map((url) => (
              <Image
                key={url}
                source={{ uri: url }}
                resizeMode="contain"
                style={[styles.photo, { width, height }]}
              />
            ))}
          </ScrollView>

          {photoUrls.length > 1 && active > 0 && (
            <Pressable
              style={[styles.arrow, styles.arrowLeft]}
              onPress={() => goTo(active - 1)}
              hitSlop={8}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
          )}

          {photoUrls.length > 1 && active < photoUrls.length - 1 && (
            <Pressable
              style={[styles.arrow, styles.arrowRight]}
              onPress={() => goTo(active + 1)}
              hitSlop={8}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          )}
        </>
      )}

      {photoUrls.length > 1 && (
        <View style={styles.dots}>
          {photoUrls.map((url, i) => (
            <View key={url} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginTop: 12, position: "relative" },
    photo: { borderRadius: 12, backgroundColor: c.bgNested },
    arrow: {
      position: "absolute",
      top: "50%",
      marginTop: -18,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    arrowLeft: { left: 10 },
    arrowRight: { right: 10 },
    arrowText: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 22 },
    dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderInput },
    dotActive: { width: 16, backgroundColor: c.accent },
  });
}
