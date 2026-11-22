import { Stack } from "expo-router";

export default function ComprasLayout() {
  // Every screen draws its own title. With the header on here, it showed the
  // route name ("index") while a screen was still loading.
  return <Stack screenOptions={{ headerShown: false }} />;
}
