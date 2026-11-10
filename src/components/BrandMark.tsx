import { Image } from "react-native";

// The turtle-and-hammer mark without the "MANTIA" wordmark (that's rendered as
// text next to it). Generated from assets/images/mantia-logo.svg at 512px, so
// it stays sharp up to ~170pt on 3x screens.
const MARK = require("../../assets/images/logo-mark.png");

export function BrandMark({ size }: { size: number }) {
  return (
    <Image
      source={MARK}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Logo de Mantia"
    />
  );
}
