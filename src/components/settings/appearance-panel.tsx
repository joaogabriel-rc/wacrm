"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2, Moon, Palette, SunMoon, Sun } from "lucide-react";

import { setLocale } from "@/app/actions/locale";
import { useTheme } from "@/hooks/use-theme";
import { LOCALES, type Locale, type LocaleMeta } from "@/lib/locales";
import { MODES, THEMES, type Mode, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Appearance panel — interface language + light/dark mode + accent-color
 * picker.
 *
 * Three independent controls. Each applies + persists immediately; no
 * save button, since every change is reversible with one more click.
 *
 * Persistence differs by control: mode and accent live in localStorage
 * (device-scoped, replayed by the boot script in layout.tsx before
 * first paint), while the language lives in a cookie — the dictionary
 * is picked server-side in `src/i18n/request.ts`, so the choice has to
 * travel with the request.
 */
export function AppearancePanel() {
  const { theme, setTheme, mode, setMode } = useTheme();
  const t = useTranslations("Settings.appearance");
  const activeLocale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pickLocale = (next: Locale) => {
    if (next === activeLocale) return;
    startTransition(async () => {
      await setLocale(next);
      // The cookie is only read on the next server render, so pull a
      // fresh tree — otherwise the page keeps the old dictionary until
      // a hard reload.
      router.refresh();
    });
  };

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Languages className="size-4 text-muted-foreground" />
          {t("language")}
          {pending && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
        </h3>
        <p className="-mt-2 text-xs leading-relaxed text-muted-foreground">
          {t("languageDescription")}
        </p>

        <div
          role="radiogroup"
          aria-label={t("language")}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {LOCALES.map((l) => (
            <LocaleCard
              key={l.id}
              locale={l}
              isActive={l.id === activeLocale}
              disabled={pending}
              onPick={() => pickLocale(l.id)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          {t("mode")}
        </h3>

        <div
          role="radiogroup"
          aria-label="Color mode"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-muted-foreground" />
          {t("accentColor")}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((tObj) => (
            <ThemeCard
              key={tObj.id}
              id={tObj.id}
              name={tObj.name}
              tagline={tObj.tagline}
              swatch={tObj.swatch}
              isActive={tObj.id === theme}
              onPick={() => setTheme(tObj.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LocaleCard({
  locale,
  isActive,
  disabled,
  onPick,
}: {
  locale: LocaleMeta;
  isActive: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("Settings.appearance");
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      disabled={disabled}
      aria-checked={isActive}
      aria-label={t("useLanguage", { name: locale.name })}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg leading-none"
      >
        {locale.flag}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {locale.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {locale.region}
        </span>
      </span>
      {isActive && (
        <Check className="size-4 shrink-0 text-primary" aria-hidden />
      )}
    </button>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("Settings.appearance");
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={t("useMode", { mode })}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold capitalize text-foreground">
        {mode}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          {t("active")}
        </span>
      )}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("Settings.appearance");
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={t("useTheme", { name })}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            {t("active")}
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted-foreground/60" />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-card" />
      </div>
      <span className="sr-only">Theme id: {id}</span>
    </button>
  );
}
