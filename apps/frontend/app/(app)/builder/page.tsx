import { Suspense } from "react";
import BuilderClient from "./builder-client";

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center font-mono text-xs tracking-wider text-sub uppercase">
          Loading builder…
        </div>
      }
    >
      <BuilderClient />
    </Suspense>
  );
}
