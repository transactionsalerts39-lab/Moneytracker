"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db, setSettingValue } from "@/lib/storage/db";

export type ViewportMode = "mobile" | "desktop";
export type ViewportModePreference = "auto" | ViewportMode;

export const VIEWPORT_MODE_SETTING_KEY = "viewportModePreference";
const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

function isViewportModePreference(value: unknown): value is ViewportModePreference {
  return value === "auto" || value === "mobile" || value === "desktop";
}

export function useViewportMode() {
  const setting = useLiveQuery(() => db.settings.get(VIEWPORT_MODE_SETTING_KEY), []);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateViewport = (event?: MediaQueryListEvent) => {
      setIsMobileViewport(event ? event.matches : mediaQuery.matches);
    };

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  const preference = useMemo<ViewportModePreference>(() => {
    const value = setting?.value;
    return isViewportModePreference(value) ? value : "auto";
  }, [setting?.value]);

  const resolvedMode = useMemo<ViewportMode>(() => {
    if (preference === "auto") {
      return isMobileViewport ? "mobile" : "desktop";
    }

    return preference;
  }, [isMobileViewport, preference]);

  return {
    resolvedMode,
    preference,
    isAuto: preference === "auto",
    async setPreference(nextPreference: ViewportModePreference) {
      await setSettingValue(VIEWPORT_MODE_SETTING_KEY, nextPreference);
    },
  };
}
