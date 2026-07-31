# Expo SDK

This project targets Expo SDK 54 (downgraded from 57 on 2026-07-17 so the app
runs in the publicly released Expo Go client — SDK 57's Expo Go build isn't
on the App Store for all iOS versions yet). Read the exact versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing any code.

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
placeholders, messages) and `README.md`. A comment can still *quote* a
Spanish UI string when explaining it (e.g. `// equipment showed "En
reparación"`), that's fine — the prose around it stays English.
