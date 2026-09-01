import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getProfile, signOut } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { ThemeProvider } from "../lib/ThemeContext";

async function homeRoute() {
  const profile = await getProfile();
  if (!profile || !profile.active) {
    await signOut();
    return null;
  }
  return profile.role === "admin" ? "/dashboard" : "/equipment";
}

export default function RootLayout() {
  const [checked, setChecked] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const inAuthGroup = segments[0] === "(auth)";
      if (!session && !inAuthGroup) router.replace("/login");
      if (session && inAuthGroup) {
        const dest = await homeRoute();
        if (dest) router.replace(dest as never);
      }
      setChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const inAuthGroup = segments[0] === "(auth)";
      if (!session && !inAuthGroup) router.replace("/login");
      if (session && inAuthGroup) {
        const dest = await homeRoute();
        if (dest) router.replace(dest as never);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [segments]);

  if (!checked) return null;
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
