import Link from "next/link";
import { FaAndroid, FaCheckCircle, FaShieldAlt, FaWindows } from "react-icons/fa";
import { formatReleaseSize, type AppRelease } from "@/lib/appReleases";

type Props = {
  release: AppRelease;
  title: string;
  description: string;
  updateDescription: string;
};

export default function AppDownloadCard({
  release,
  title,
  description,
  updateDescription,
}: Props) {
  const Icon = release.platform === "windows" ? FaWindows : FaAndroid;

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-5 py-14 text-[#101827] sm:px-8 sm:py-20">
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[32px] border border-[#d8e2ee] bg-white shadow-[0_28px_80px_rgba(15,23,42,.12)]">
        <div className="border-b border-[#e6edf5] bg-[linear-gradient(135deg,#07111f,#0d2138)] px-7 py-9 text-white sm:px-12">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#ffd000] text-3xl text-[#07111f] shadow-lg shadow-yellow-400/20">
              <Icon aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black tracking-[.24em] text-[#59e0ff]">OFFICIAL COMEPLAYERS APP</p>
              <h1 className="mt-2 text-3xl font-black sm:text-5xl">{title}</h1>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-[#b9cada] sm:text-base">{description}</p>
        </div>

        <div className="space-y-7 px-7 py-8 sm:px-12 sm:py-10">
          {release.available ? (
            <>
              <div className="grid gap-3 rounded-2xl border border-[#dce6f0] bg-[#f8fafc] p-5 text-sm sm:grid-cols-3">
                <div><span className="block text-[#64748b]">Version</span><strong className="mt-1 block">{release.version}</strong></div>
                <div><span className="block text-[#64748b]">Installer size</span><strong className="mt-1 block">{formatReleaseSize(release.sizeBytes)}</strong></div>
                <div><span className="block text-[#64748b]">Compatibility</span><strong className="mt-1 block">{release.label}</strong></div>
              </div>

              <a
                href={release.downloadPath}
                className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#ffd000] px-6 py-4 text-center text-lg font-black text-[#07111f] shadow-lg shadow-yellow-400/20 transition hover:-translate-y-0.5 hover:bg-[#ffdc3d]"
              >
                <Icon aria-hidden="true" /> Download ComePlayers {release.version}
              </a>

              <div className="grid gap-4 text-sm text-[#475569] sm:grid-cols-2">
                <div className="flex gap-3 rounded-2xl border border-[#dce6f0] p-4">
                  <FaShieldAlt className="mt-0.5 shrink-0 text-[#009e73]" aria-hidden="true" />
                  <p><strong className="block text-[#101827]">Verified release</strong>Installer is checked against its published size and SHA-256 manifest.</p>
                </div>
                <div className="flex gap-3 rounded-2xl border border-[#dce6f0] p-4">
                  <FaCheckCircle className="mt-0.5 shrink-0 text-[#009e73]" aria-hidden="true" />
                  <p><strong className="block text-[#101827]">Automatic updates</strong>{updateDescription}</p>
                </div>
              </div>

              <details className="rounded-2xl border border-[#dce6f0] bg-[#f8fafc] p-4 text-xs text-[#64748b]">
                <summary className="cursor-pointer font-bold text-[#334155]">SHA-256 checksum</summary>
                <code className="mt-3 block break-all font-mono">{release.sha256}</code>
              </details>
            </>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
              <strong className="text-lg">Signed release is being prepared.</strong>
              <p className="mt-2 text-sm leading-6">The download button will become available after the production artifact passes verification.</p>
            </div>
          )}

          <Link href="/" className="inline-flex font-bold text-[#0077b6] hover:underline">
            ← Back to ComePlayers
          </Link>
        </div>
      </section>
    </main>
  );
}
