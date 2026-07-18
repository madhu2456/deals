import {
  CheckSquare,
  Cloud,
  Code2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Palette,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  cloud: Cloud,
  palette: Palette,
  "code-2": Code2,
  "check-square": CheckSquare,
  "graduation-cap": GraduationCap,
  "trending-up": TrendingUp,
  "shield-check": ShieldCheck,
  landmark: Landmark,
  "shopping-bag": ShoppingBag,
  plane: Plane,
  "heart-pulse": HeartPulse,
  tag: Tag,
};

export function getIcon(name: string): LucideIcon {
  return iconMap[name] || Tag;
}
