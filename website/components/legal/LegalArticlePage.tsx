import Link from "next/link";
import {
  FaArrowLeft,
  FaArrowRight,
  FaCalendarCheck,
  FaCircleCheck,
  FaHeadset,
} from "react-icons/fa6";
import type { LegalPage } from "@/lib/legalContent";
import { legalPages, legalSectionId } from "@/lib/legalContent";

type Props = { page: LegalPage };

export default function LegalArticlePage({ page }: Props) {
  const currentIndex = legalPages.findIndex((item) => item.slug === page.slug);
  const previousPage = currentIndex > 0 ? legalPages[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < legalPages.length - 1
      ? legalPages[currentIndex + 1]
      : null;

  return (
    <main className="min-h-screen bg-[#f4f4f2] text-[#171717]">
      <section className="relative overflow-hidden bg-[#0b0c0f] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(250,204,21,0.17),transparent_27%),radial-gradient(circle_at_5%_100%,rgba(255,255,255,0.06),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-20 lg:pt-12">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/50"
          >
            <Link href="/" className="transition hover:text-yellow-300">
              ComePlayers
            </Link>
            <span aria-hidden="true">/</span>
            <Link href="/legal" className="transition hover:text-yellow-300">
              Legal
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-white">{page.title}</span>
          </nav>

          <div className="mt-12 grid gap-9 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div>
              <p className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
                <span className="h-px w-8 bg-yellow-300" />
                {page.eyebrow}
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                {page.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-white/62 sm:text-lg">
                {page.summary}
              </p>
            </div>

            <div className="rounded-xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-300 text-black">
                  <FaCircleCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    Policy status
                  </p>
                  <p className="mt-1 text-sm font-black text-white">
                    {page.status || "Current policy"}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs font-semibold text-white/45">
                <div className="flex items-center gap-2">
                  <FaCalendarCheck className="h-3.5 w-3.5 text-yellow-300" />
                  Last updated {page.updatedAt}
                </div>
                {page.effectiveAt ? (
                  <p className="pl-[22px] text-white/35">
                    Effective {page.effectiveAt}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[245px_minmax(0,1fr)_245px] lg:px-8 lg:py-14">
        <aside className="h-fit lg:sticky lg:top-28">
          <Link
            href="/legal"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-black/45 transition hover:text-black"
          >
            <FaArrowLeft className="h-3 w-3" />
            All legal documents
          </Link>

          <div className="mt-6 rounded-xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(10,10,10,0.04)]">
            <p className="px-3 pb-3 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-black/30">
              Legal menu
            </p>
            <nav className="grid gap-1" aria-label="Legal documents">
              {legalPages.map((item) => (
                <Link
                  key={item.slug}
                  href={`/legal/${item.slug}`}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold leading-5 transition ${
                    item.slug === page.slug
                      ? "bg-[#171717] text-white"
                      : "text-black/55 hover:bg-black/5 hover:text-black"
                  }`}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <article className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_12px_45px_rgba(10,10,10,0.06)] sm:p-9 lg:p-11">
          <div className="border-b border-black/10 pb-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-700">
              ComePlayers legal document
            </p>
            <p className="mt-3 text-sm leading-6 text-black/48">
              {page.slug === "terms-of-service"
                ? "Please read these Terms carefully. They govern your access to ComePlayers and work together with the policies referenced throughout this document."
                : "Please read this document carefully. It forms part of the rules governing your use of ComePlayers and should be read together with the Terms of Service and other policies that apply to your activity."}
            </p>
          </div>

          {page.notice ? (
            <aside className="mt-7 rounded-xl border border-yellow-400/60 bg-yellow-50 p-5 sm:p-6">
              <div className="flex gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-300 text-sm font-black text-black">
                  !
                </span>
                <div>
                  <h2 className="text-base font-black text-black">
                    {page.notice.title}
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-black/65">
                    {page.notice.body}
                  </p>
                </div>
              </div>
            </aside>
          ) : null}

          <div className="divide-y divide-black/10">
            {page.sections.map((section, index) => (
              <section
                key={section.title}
                id={legalSectionId(section.title)}
                className="scroll-mt-28 py-9 first:pt-9 last:pb-0"
              >
                <div className="grid gap-4 sm:grid-cols-[44px_minmax(0,1fr)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-300 text-xs font-black text-black">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2 className="text-2xl font-black leading-tight tracking-[-0.025em] text-black sm:text-[1.7rem]">
                      {section.title}
                    </h2>

                    <div className="mt-5 space-y-4">
                      {section.body.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="text-[15px] leading-8 text-black/62"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>

                    {section.details ? (
                      <dl className="mt-6 grid overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-2">
                        {section.details.map((item) => (
                          <div
                            key={item.label}
                            className="border-b border-black/10 bg-[#f7f7f4] px-4 py-4 last:border-b-0 sm:border-r sm:px-5 sm:py-5 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(even)]:border-r-0"
                          >
                            <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-black/38">
                              {item.label}
                            </dt>
                            <dd className="mt-2 text-sm font-extrabold leading-6 text-black/75">
                              {item.href ? (
                                <a
                                  href={item.href}
                                  className="underline decoration-yellow-500 decoration-2 underline-offset-4 transition hover:text-yellow-700"
                                >
                                  {item.value}
                                </a>
                              ) : (
                                item.value
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {section.bullets ? (
                      <ul className="mt-5 grid gap-3">
                        {section.bullets.map((item) => (
                          <li
                            key={item}
                            className="flex gap-3 rounded-lg bg-[#f7f7f4] px-4 py-3.5 text-sm leading-6 text-black/62"
                          >
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-yellow-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-xl bg-[#171717] p-6 text-white sm:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-yellow-300 text-black">
                  <FaHeadset className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-black">Questions about this policy?</p>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-white/55">
                    Contact ComePlayers Support for account, order, payment,
                    seller, payout, or dispute assistance.
                  </p>
                </div>
              </div>
              <Link
                href="/support"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-yellow-300 px-5 text-sm font-black text-black transition hover:bg-yellow-200"
              >
                Get support
                <FaArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <nav
            aria-label="Previous and next legal documents"
            className="mt-8 grid gap-4 border-t border-black/10 pt-8 sm:grid-cols-2"
          >
            {previousPage ? (
              <Link
                href={`/legal/${previousPage.slug}`}
                className="group rounded-xl border border-black/10 p-4 transition hover:border-yellow-500 hover:bg-yellow-50/50"
              >
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-black/35">
                  <FaArrowLeft className="h-3 w-3" />
                  Previous
                </span>
                <span className="mt-2 block text-sm font-black group-hover:text-yellow-700">
                  {previousPage.title}
                </span>
              </Link>
            ) : (
              <span />
            )}

            {nextPage ? (
              <Link
                href={`/legal/${nextPage.slug}`}
                className="group rounded-xl border border-black/10 p-4 text-right transition hover:border-yellow-500 hover:bg-yellow-50/50"
              >
                <span className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-black/35">
                  Next
                  <FaArrowRight className="h-3 w-3" />
                </span>
                <span className="mt-2 block text-sm font-black group-hover:text-yellow-700">
                  {nextPage.title}
                </span>
              </Link>
            ) : null}
          </nav>
        </article>

        <aside className="h-fit lg:sticky lg:top-28">
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-black/10 bg-white p-4 shadow-[0_8px_30px_rgba(10,10,10,0.04)]">
            <p className="px-2 pb-3 text-[10px] font-black uppercase tracking-[0.2em] text-black/30">
              On this page
            </p>
            <nav className="grid gap-1" aria-label="Document sections">
              {page.sections.map((section, index) => (
                <a
                  key={section.title}
                  href={`#${legalSectionId(section.title)}`}
                  className="group flex gap-3 rounded-lg px-2 py-2.5 text-xs font-bold leading-5 text-black/48 transition hover:bg-black/5 hover:text-black"
                >
                  <span className="text-black/25 group-hover:text-yellow-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{section.title}</span>
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </section>
    </main>
  );
}
