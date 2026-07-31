import { StudioShell } from "@/components/layout/studio-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
