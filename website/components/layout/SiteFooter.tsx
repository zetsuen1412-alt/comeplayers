"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FaDiscord,
  FaEnvelope,
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaMapMarkerAlt,
  FaTiktok,
  FaWhatsapp,
  FaYoutube,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useCurrency } from "@/components/CurrencyProvider";
import type { TranslationKey } from "@/lib/localization";

const footerLinks: Array<{ href: string; label: TranslationKey }> = [
  { href: "/legal", label: "footer.legalCenter" },
  { href: "/legal/terms-of-service", label: "footer.terms" },
  { href: "/legal/privacy-policy", label: "footer.privacy" },
  { href: "/legal/refund-cancellation-policy", label: "footer.refunds" },
  { href: "/legal/seller-rules", label: "footer.sellerRules" },
  { href: "/legal/payment-fee-schedule", label: "footer.feesPayouts" },
  { href: "/help-center", label: "footer.helpCenter" },
  { href: "/support", label: "footer.submitTicket" },
  { href: "/support", label: "footer.myTickets" },
];

const socialLinks = [
  { href: "https://discord.gg/comeplayers", label: "Discord", icon: FaDiscord },
  {
    href: "https://www.instagram.com/comeplayers",
    label: "Instagram",
    icon: FaInstagram,
  },
  {
    href: "https://www.facebook.com/comeplayers",
    label: "Facebook",
    icon: FaFacebookF,
  },
  { href: "https://x.com/comeplayers", label: "X", icon: FaXTwitter },
  {
    href: "https://www.youtube.com/@comeplayers",
    label: "YouTube",
    icon: FaYoutube,
  },
  {
    href: "https://www.tiktok.com/@comeplayers",
    label: "TikTok",
    icon: FaTiktok,
  },
  {
    href: "https://www.linkedin.com/company/comeplayers",
    label: "LinkedIn",
    icon: FaLinkedinIn,
  },
];

export default function SiteFooter() {
  const { t } = useCurrency();

  return (
    <footer className="relative overflow-hidden bg-[linear-gradient(135deg,#090d14_0%,#05070b_48%,#090c12_100%)] text-[#a9b4c7]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,196,0,0.035),transparent_31rem),radial-gradient(circle_at_76%_34%,rgba(111,137,177,0.045),transparent_34rem)]"
      />

      <div className="relative mx-auto w-full max-w-[1640px] px-5 sm:px-7 lg:px-10">
        <div className="h-px bg-[linear-gradient(90deg,transparent_0%,#ffd000_4%,#8a6800_58%,transparent_100%)] shadow-[0_0_14px_rgba(255,196,0,0.2)]" />

        <div className="grid gap-9 py-10 md:py-11 lg:grid-cols-[1.08fr_1.12fr_0.9fr] lg:gap-0 lg:py-12">
          <section
            aria-label={t("footer.aboutAria")}
            className="lg:pr-10 xl:pr-12"
          >
            <Link
              href="/"
              className="inline-flex items-center"
              aria-label={t("footer.homeAria")}
            >
              <Image
                src="/logo.png"
                alt="ComePlayers"
                width={300}
                height={92}
                className="h-[52px] w-auto object-contain sm:h-[58px]"
                priority={false}
              />
            </Link>

            <p className="mt-5 max-w-[500px] text-sm leading-7 text-[#9da9bc] sm:text-[15px]">
              {t("footer.description")}
            </p>
          </section>

          <section
            aria-labelledby="footer-address-title"
            className="border-white/10 lg:border-l lg:px-10 xl:px-12"
          >
            <div className="flex items-start gap-4">
              <FaMapMarkerAlt className="mt-0.5 h-5 w-5 shrink-0 text-[#ffc400]" />
              <div>
                <h2
                  id="footer-address-title"
                  className="text-base font-black uppercase tracking-[0.1em] text-[#f7f7f5] sm:text-[18px]"
                >
                  {t("footer.addressTitle")}
                </h2>

                <address className="mt-4 max-w-[560px] not-italic text-sm leading-7 text-[#9da9bc] sm:text-[15px] sm:leading-7">
                  Perumahan Graha Indah Lestari, Blok C2 No. 5, RT 04/RW 03,
                  Mangunjaya, Arjasari, Kabupaten Bandung, Jawa Barat 40379,
                  Indonesia.
                </address>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="footer-contact-title"
            className="border-white/10 lg:border-l lg:pl-10 xl:pl-12"
          >
            <div className="flex items-start gap-4">
              <FaEnvelope className="mt-0.5 h-5 w-5 shrink-0 text-[#ffc400]" />
              <div className="min-w-0">
                <h2
                  id="footer-contact-title"
                  className="text-base font-black uppercase tracking-[0.1em] text-[#f7f7f5] sm:text-[18px]"
                >
                  {t("footer.contactTitle")}
                </h2>

                <div className="mt-4 space-y-4 text-sm sm:text-[15px]">
                  <a
                    href="mailto:admin@comeplayers.com"
                    className="flex items-center gap-4 text-[#9da9bc] transition hover:text-[#ffd34d]"
                  >
                    <FaEnvelope className="h-5 w-5 shrink-0 text-[#ffc400]" />
                    <span className="break-all sm:break-normal">
                      admin@comeplayers.com
                    </span>
                  </a>

                  <a
                    href="https://wa.me/6285124347844"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-4 text-[#9da9bc] transition hover:text-[#ffd34d]"
                  >
                    <FaWhatsapp className="h-5 w-5 shrink-0 text-[#ffc400]" />
                    <span>+62 851-2434-7844</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="relative border-t border-[#8a6800]/70 bg-[#080b10]/96">
        <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-5 px-5 py-4 sm:px-7 lg:px-10 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex shrink-0 items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b88b00] bg-[#05070a] text-base font-medium text-white shadow-[0_0_18px_rgba(255,196,0,0.08)]">
                N
              </span>
              <span className="whitespace-nowrap text-sm text-[#d8dbe1] sm:text-[15px]">
                © <strong className="font-semibold text-[#ffc400]">2026</strong>{" "}
                ComePlayers
              </span>
            </div>

            <nav
              aria-label={t("footer.navigationAria")}
              className="grid w-full grid-cols-2 gap-x-4 gap-y-3 text-[13px] font-medium text-[#e4e6ea] sm:flex sm:flex-wrap sm:items-center sm:gap-x-0 sm:gap-y-2 sm:text-sm"
            >
              {footerLinks.map((item, index) => (
                <span key={`${item.href}-${item.label}`} className="inline-flex min-w-0 items-center">
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="mx-2.5 hidden text-[9px] text-[#ffc400] sm:mx-3 sm:inline"
                    >
                      •
                    </span>
                  ) : null}
                  <Link
                    href={item.href}
                    className="min-w-0 transition hover:text-[#ffc400] sm:whitespace-nowrap"
                  >
                    {t(item.label)}
                  </Link>
                </span>
              ))}
            </nav>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 border-white/10 sm:justify-start xl:border-l xl:pl-6"
            aria-label={t("footer.socialAria")}
          >
            {socialLinks.map((item) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  title={item.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#8d6c00] bg-[#080b10] text-[#f2f3f5] transition hover:-translate-y-0.5 hover:border-[#ffc400] hover:bg-[#ffc400] hover:text-[#090a0b] hover:shadow-[0_0_22px_rgba(255,196,0,0.2)]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
