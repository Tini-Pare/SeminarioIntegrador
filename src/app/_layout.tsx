import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const inAuthGroup = segments[0] === "(auth)";
      if (!session && !inAuthGroup) router.replace("/login");
      if (session && inAuthGroup) router.replace("/equipment");
      setChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const inAuthGroup = segments[0] === "(auth)";
      if (!session && !inAuthGroup) router.replace("/login");
      if (session && inAuthGroup) router.replace("/equipment");
    });
    return () => sub.subscription.unsubscribe();
  }, [segments]);

  if (!checked) return null;
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
