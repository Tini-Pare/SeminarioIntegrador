import { decode } from "base64-arraybuffer";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const MAX_DIMENSION = 1600;
const COMPRESSION_QUALITY = 0.6;

export async function pickFaultPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Se necesita permiso para acceder a las fotos.");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function takeFaultPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Se necesita permiso para usar la cámara.");

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function compressToWebp(uri: string): Promise<string> {
  const result = await manipulateAsync(uri, [{ resize: { width: MAX_DIMENSION } }], {
    compress: COMPRESSION_QUALITY,
    format: SaveFormat.WEBP,
    base64: true,
  });
  // A data URI (rather than the blob:/file: URI expo-image-manipulator returns)
  // survives round-tripping through <Image> and fetch() on every platform —
  // notably, fetching a blob: object URL silently yields a 0-byte blob on iOS Safari.
  return `data:image/webp;base64,${result.base64}`;
}

export async function uploadFaultPhoto(dataUri: string): Promise<string> {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

  const { error } = await supabase.storage.from("fault-photos").upload(fileName, decode(base64), {
    contentType: "image/webp",
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("fault-photos").getPublicUrl(fileName);
  return data.publicUrl;
}
