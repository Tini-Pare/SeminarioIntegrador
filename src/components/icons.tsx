import Svg, { Path, Circle } from "react-native-svg";

type IconProps = { size?: number; color?: string };

export function WarningIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 3l9 16H3l9-16z" />
      <Path d="M12 10v4" />
      <Path d="M12 17h.01" />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export function LocationIcon({ size = 14, color = "#9A9DA6" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z" />
      <Circle cx={12} cy={11} r={2.2} />
    </Svg>
  );
}

export function BackIcon({ size = 16, color = "#6c6f78" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export function UsersIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M21 19.9999C21 18.2583 19.3304 16.7767 17 16.2275M15 20C15 17.7909 12.3137 16 9 16C5.68629 16 3 17.7909 3 20M15 13C17.2091 13 19 11.2091 19 9C19 6.79086 17.2091 5 15 5M9 13C6.79086 13 5 11.2091 5 9C5 6.79086 6.79086 5 9 5C11.2091 5 13 6.79086 13 9C13 11.2091 11.2091 13 9 13Z" />
    </Svg>
  );
}

// Wrench — stands in for "equipment" generically (AC units, heladeras,
// motores, hornos…) instead of a specific vehicle/appliance shape that
// only fits some of them.
export function EquipmentIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill={color}
        d="M6.12 20.75C5.36 20.75 4.64 20.45 4.09 19.91C2.97 18.79 2.97 16.98 4.09 15.86L9.6 10.35C9.1 8.40997 9.64 6.31997 11.06 4.89997C12.49 3.46997 14.59 2.90997 16.54 3.43997C16.8 3.50997 17 3.70997 17.07 3.96997C17.14 4.22997 17.07 4.49997 16.88 4.68997L14.43 7.13997L14.95 9.04997L16.86 9.56997L19.31 7.11997C19.5 6.92997 19.78 6.85997 20.03 6.92997C20.29 6.99997 20.49 7.19997 20.56 7.45997C21.09 9.40997 20.54 11.51 19.1 12.94C17.68 14.36 15.59 14.9 13.65 14.4L8.14 19.91C7.6 20.45 6.88 20.75 6.12 20.75ZM14.68 4.76997C13.72 4.84997 12.81 5.26997 12.11 5.96997C10.97 7.10997 10.6 8.77997 11.15 10.32C11.25 10.59 11.18 10.9 10.97 11.1L5.14 16.93C4.61 17.46 4.61 18.33 5.14 18.86C5.4 19.12 5.74 19.26 6.11 19.26C6.47 19.26 6.82 19.12 7.07 18.86L12.9 13.03C13.11 12.82 13.41 12.76 13.68 12.85C15.22 13.39 16.89 13.03 18.03 11.89C18.73 11.19 19.14 10.28 19.23 9.31997L17.6 10.95C17.41 11.14 17.13 11.21 16.87 11.14L14.13 10.39C13.87 10.32 13.67 10.12 13.6 9.85997L12.85 7.11997C12.78 6.85997 12.85 6.57997 13.04 6.38997L14.67 4.75997L14.68 4.76997Z"
      />
    </Svg>
  );
}

// Stacked layers — "categories/types that equipment is grouped into".
export function EquipmentTypeIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 3l9 5-9 5-9-5 9-5z" />
      <Path d="M3 13l9 5 9-5" />
      <Path d="M3 17.5l9 5 9-5" />
    </Svg>
  );
}

// Clipboard with a checklist — the catalog of standard technical tasks.
export function GeneralTaskIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
      <Path d="M8 6H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2" />
      <Path d="M8.5 12.5l1.5 1.5 3-3.5" />
      <Path d="M15 16.5h-4" />
    </Svg>
  );
}

export function RequestsIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M7 9H17M7 13H12M21 20L17.6757 18.3378C17.4237 18.2118 17.2977 18.1488 17.1656 18.1044C17.0484 18.065 16.9277 18.0365 16.8052 18.0193C16.6672 18 16.5263 18 16.2446 18H6.2C5.07989 18 4.51984 18 4.09202 17.782C3.71569 17.5903 3.40973 17.2843 3.21799 16.908C3 16.4802 3 15.9201 3 14.8V7.2C3 6.07989 3 5.51984 3.21799 5.09202C3.40973 4.71569 3.71569 4.40973 4.09202 4.21799C4.51984 4 5.0799 4 6.2 4H17.8C18.9201 4 19.4802 4 19.908 4.21799C20.2843 4.40973 20.5903 4.71569 20.782 5.09202C21 5.51984 21 6.0799 21 7.2V20Z" />
    </Svg>
  );
}

export function HomeIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 10.5L12 3l9 7.5" />
      <Path d="M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" />
      <Path d="M9.5 21v-6h5v6" />
    </Svg>
  );
}

export function PencilIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

export function TrashIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 6h18" />
      <Path d="M8 6V4h8v2" />
      <Path d="M19 6l-1 14H6L5 6" />
      <Path d="M10 11v5M14 11v5" />
    </Svg>
  );
}

export function CalendarIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M19 4H5c-1.11 0-2 .89-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2z" />
      <Path d="M16 2v4" />
      <Path d="M8 2v4" />
      <Path d="M3 10h18" />
    </Svg>
  );
}

export function EyeIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  );
}
