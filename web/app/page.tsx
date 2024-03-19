import Home from "@/components/home";
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
