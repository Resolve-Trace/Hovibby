/**
 * Landing layout — minimal wrapper, no sidebar.
 * The landing page (/) lives here and is served to unauthenticated visitors.
 */
import type { ReactNode } from "react";

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
