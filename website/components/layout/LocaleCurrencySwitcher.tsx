"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FaCheck,
  FaChevronDown,
  FaCoins,
  FaGlobeAsia,
  FaLanguage,
  FaMapMarkerAlt,
  FaTimes,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  countryFlagImageUrl,
  formatCountryName,
  formatCurrencyName,
  normalizeCountry,
  normalizeCurrency,
  normalizeLocale,
  translate,
  type TranslationKey,
} from "@/lib/localization";

function RegionBadge({
  country,
  large = false,
}: {
  country: string;
  large?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] ${
        large ? "h-11 w-11" : "h-7 w-7"
      }`}
      aria-hidden="true"
    >
      <img
        src={countryFlagImageUrl(country)}
        alt=""
        width={large ? 56 : 40}
        height={large ? 42 : 30}
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
    </span>
  );
}

function SettingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#ffc400]/20 bg-[#ffc400]/10 text-[#ffd54a] shadow-[0_0_22px_rgba(255,196,0,0.06)]">
      {children}
    </span>
  );
}

export default function LocaleCurrencySwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const router = useRouter();
  const {
    country,
    locale,
    currency,
    rateSource,
    ratesLoading,
    setPreferences,
    t,
  } = useCurrency();
  const [open, setOpen] = useState(false);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [draftCountry, setDraftCountry] = useState(country);
  const [draftLocale, setDraftLocale] = useState(locale);
  const [draftCurrency, setDraftCurrency] = useState(currency);

  const selectedCountry =
    COUNTRY_OPTIONS.find((option) => option.country === draftCountry) ||
    COUNTRY_OPTIONS[0];
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.locale === draftLocale) ||
    LANGUAGE_OPTIONS[0];
  const selectedCurrency =
    CURRENCY_OPTIONS.find((option) => option.currency === draftCurrency) ||
    CURRENCY_OPTIONS[0];
  const selectedCountryName = formatCountryName(
    selectedCountry.country,
    draftLocale
  );
  const selectedCurrencyName = formatCurrencyName(
    selectedCurrency.currency,
    draftLocale
  );
  const modalText = (
    key: TranslationKey,
    values?: Record<string, string | number>
  ) => translate(draftLocale, key, values);

  function openSettings() {
    setDraftCountry(country);
    setDraftLocale(locale);
    setDraftCurrency(currency);
    setCountryMenuOpen(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setCountryMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function selectCountry(value: string) {
    const nextCountry = normalizeCountry(value);
    const option =
      COUNTRY_OPTIONS.find((item) => item.country === nextCountry) ||
      COUNTRY_OPTIONS[0];

    setDraftCountry(option.country);
    setDraftCurrency(option.currency);
    setCountryMenuOpen(false);
  }

  function savePreferences() {
    setPreferences({
      country: draftCountry,
      locale: draftLocale,
      currency: draftCurrency,
    });
    setOpen(false);
    setCountryMenuOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openSettings}
        className={`group inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 bg-[linear-gradient(180deg,#111827_0%,#0b1220_100%)] font-black text-slate-100 shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition hover:border-[#ffc400]/70 hover:text-[#ffd54a] ${
          compact ? "h-10 px-3 text-xs" : "h-11 px-4 text-sm"
        }`}
        title={t("locale.buttonLabel")}
        aria-label={t("locale.buttonLabel")}
      >
        <RegionBadge country={country} />
        <span className="hidden sm:inline">{country}</span>
        <span>{currency}</span>
        <FaChevronDown className="text-[10px] text-slate-400 transition group-hover:text-[#ffd54a]" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={modalText("locale.title")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
              setCountryMenuOpen(false);
            }
          }}
        >
          <div className="relative flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[linear-gradient(180deg,#0b1018_0%,#06090f_100%)] text-white shadow-[0_36px_120px_rgba(0,0,0,0.72)] sm:max-h-[calc(100vh-2rem)] sm:rounded-[28px]">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#ffc400_24%,#62e7ff_72%,transparent)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,196,0,0.08),transparent_22rem),radial-gradient(circle_at_top_right,rgba(20,216,255,0.07),transparent_25rem)]"
            />

            <header className="relative flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#ffc400]/25 bg-[#ffc400]/10 text-xl text-[#ffd54a] shadow-[0_0_24px_rgba(255,196,0,0.08)]">
                  <FaGlobeAsia />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#62e7ff]">
                    {modalText("locale.eyebrow")}
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">
                    {modalText("locale.title")}
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
                    {modalText("locale.subtitle")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-[#ffc400]/40 hover:bg-[#ffc400]/10 hover:text-[#ffd54a]"
                aria-label={modalText("locale.close")}
              >
                <FaTimes />
              </button>
            </header>

            <div className="relative flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <section className="mb-5 rounded-2xl border border-[#14d8ff]/16 bg-[linear-gradient(135deg,rgba(20,216,255,0.09),rgba(255,196,0,0.06))] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <RegionBadge country={selectedCountry.country} large />
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">
                        {selectedCountryName}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-400">
                        {selectedLanguage.nativeLabel} · {selectedCurrencyName}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-300">
                    <FaCheck /> {modalText("locale.currentSetup")}
                  </span>
                </div>
              </section>

              <div className="space-y-4">
                <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <SettingIcon>
                      <FaMapMarkerAlt />
                    </SettingIcon>
                    <div>
                      <label
                        className="block font-black text-white"
                        htmlFor="cp-country"
                      >
                        {modalText("locale.country")}
                      </label>
                      <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                        {modalText("locale.countryHelp")}
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      id="cp-country"
                      type="button"
                      onClick={() => setCountryMenuOpen((value) => !value)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 text-left font-bold text-white outline-none transition hover:border-[#ffc400]/45 focus:border-[#ffc400] focus:ring-2 focus:ring-[#ffc400]/10"
                      aria-haspopup="listbox"
                      aria-expanded={countryMenuOpen}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <RegionBadge country={selectedCountry.country} />
                        <span className="truncate">{selectedCountryName}</span>
                      </span>
                      <FaChevronDown
                        className={`shrink-0 text-xs text-slate-500 transition ${
                          countryMenuOpen ? "rotate-180 text-[#ffd54a]" : ""
                        }`}
                      />
                    </button>

                    {countryMenuOpen ? (
                      <div
                        className="absolute left-0 right-0 top-full z-[100010] mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[#ffc400]/18 bg-[#090d14] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.62)]"
                        role="listbox"
                        aria-label={modalText("locale.country")}
                      >
                        {COUNTRY_OPTIONS.map((option) => {
                          const optionName = formatCountryName(
                            option.country,
                            draftLocale
                          );
                          const active = option.country === draftCountry;

                          return (
                            <button
                              key={option.country}
                              type="button"
                              onClick={() => selectCountry(option.country)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                active
                                  ? "bg-[linear-gradient(90deg,rgba(255,196,0,0.14),rgba(20,216,255,0.08))] text-white ring-1 ring-[#ffc400]/35"
                                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                              }`}
                              role="option"
                              aria-selected={active}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <RegionBadge country={option.country} />
                                <span className="truncate font-bold">
                                  {optionName}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-black text-slate-500">
                                {option.currency}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </section>

                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <SettingIcon>
                        <FaLanguage />
                      </SettingIcon>
                      <div>
                        <label
                          className="block font-black text-white"
                          htmlFor="cp-language"
                        >
                          {modalText("locale.language")}
                        </label>
                        <p className="mt-1 text-xs text-slate-500">
                          {modalText("locale.languageHelp")}
                        </p>
                      </div>
                    </div>
                    <select
                      id="cp-language"
                      value={draftLocale}
                      onChange={(event) =>
                        setDraftLocale(normalizeLocale(event.target.value))
                      }
                      className="h-14 w-full rounded-xl border border-white/10 bg-[#080b11] px-4 font-bold text-white outline-none transition focus:border-[#ffc400] focus:ring-2 focus:ring-[#ffc400]/10"
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.locale} value={option.locale}>
                          {option.nativeLabel}
                        </option>
                      ))}
                    </select>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <SettingIcon>
                        <FaCoins />
                      </SettingIcon>
                      <div>
                        <label
                          className="block font-black text-white"
                          htmlFor="cp-currency"
                        >
                          {modalText("locale.currency")}
                        </label>
                        <p className="mt-1 text-xs text-slate-500">
                          {modalText("locale.currencyHelp")}
                        </p>
                      </div>
                    </div>
                    <select
                      id="cp-currency"
                      value={draftCurrency}
                      onChange={(event) =>
                        setDraftCurrency(
                          normalizeCurrency(event.target.value)
                        )
                      }
                      className="h-14 w-full rounded-xl border border-white/10 bg-[#080b11] px-4 font-bold text-white outline-none transition focus:border-[#ffc400] focus:ring-2 focus:ring-[#ffc400]/10"
                    >
                      {CURRENCY_OPTIONS.map((option) => (
                        <option key={option.currency} value={option.currency}>
                          {formatCurrencyName(option.currency, draftLocale)} (
                          {option.currency})
                        </option>
                      ))}
                    </select>
                  </section>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#14d8ff]/14 bg-[#14d8ff]/[0.055] p-4 text-sm leading-6 text-slate-400">
                <FaGlobeAsia className="mt-1 shrink-0 text-[#62e7ff]" />
                <div>
                  <p>{modalText("locale.autoNote")}</p>
                  <p className="mt-1 text-slate-300">
                    {ratesLoading
                      ? modalText("locale.rateLoading")
                      : modalText(
                          rateSource === "live"
                            ? "locale.rateLive"
                            : "locale.rateFallback"
                        )}
                  </p>
                </div>
              </div>
            </div>

            <footer className="relative flex flex-col-reverse gap-3 border-t border-white/10 bg-[#070a10]/95 px-5 py-4 sm:flex-row sm:justify-end sm:px-7 sm:py-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-12 rounded-xl border border-white/12 bg-white/[0.035] px-7 font-black text-slate-300 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
              >
                {modalText("common.cancel")}
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#ffd54a] bg-[linear-gradient(180deg,#ffd54a_0%,#ffc400_100%)] px-8 font-black text-black shadow-[0_14px_34px_rgba(255,196,0,0.17)] transition hover:brightness-105 hover:shadow-[0_16px_38px_rgba(255,196,0,0.24)]"
              >
                <FaCheck />
                {modalText("common.save")}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
