"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ensureSeedData } from "@/lib/storage/db";
import { useEffect } from "react";
import { Toaster } from "sonner";

export function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    void ensureSeedData();
  }, []);

  return (
    <TooltipProvider>
      {children}
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}
