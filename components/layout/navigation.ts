import { ChartNoAxesCombined, Cog, FolderUp, Rows3, type LucideIcon } from "lucide-react";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

export const workspaceNavItems: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: ChartNoAxesCombined },
  { href: "/upload", label: "Upload", shortLabel: "Upload", icon: FolderUp },
  { href: "/transactions", label: "Transactions", shortLabel: "Ledger", icon: Rows3 },
  { href: "/settings", label: "Settings", shortLabel: "Settings", icon: Cog },
];
