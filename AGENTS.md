# Expo SDK

This project targets Expo SDK 58 (React Native 0.88, React 19.3), upgraded
from 54 on 2026-11-08 on the `mobile` branch. Read the exact versioned docs at
https://docs.expo.dev/versions/v58.0.0/ before writing any code.

- RN 0.88 ships the Strict TypeScript API: refs are typed with the exported
  instance types (`useRef<ViewInstance>`, `TextInputInstance`,
  `ScrollViewInstance`), not the component (`useRef<View>`), and deep imports
  from `react-native/Libraries/*` don't type-check.
- Expo Go for SDK 58 may not be on the stores yet; until it is, run the app
  with a development build (`expo-dev-client` + EAS Build).
- `.npmrc` sets `legacy-peer-deps=true` because
  `@react-native-community/datetimepicker` declares an optional
  `react-native-windows` peer that pins an older React Native.

# JSX formatting

Put a blank line between sibling JSX elements/blocks inside a component's
return (not between every single line — between distinct elements/groups,
e.g. after a `View` that closes before the next sibling `View` opens).
Prettier preserves blank lines that already exist but never adds them, so
this has to be done by hand whenever writing or editing JSX. Example:

```tsx
<View style={styles.timelineRail}>
  <View style={[styles.timelineDot, { backgroundColor: c.dot }]} />

  {i < history.length - 1 && <View style={styles.timelineLine} />}
</View>

<View style={styles.timelineCard}>
  ...
</View>
```

# Comment language

Code comments are always in English, no exceptions — matches the codebase's
existing convention (tables/columns/functions/variables/types in English).
The only things that are Spanish: what actually renders in the UI (labels,
placeholders, messages) and `README.md`. A comment can still _quote_ a
Spanish UI string when explaining it (e.g. `// equipment showed "En
reparación"`), that's fine — the prose around it stays English.
