import Link from "next/link";

export default function DesktopDownloadPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#050505] px-6 py-20 text-white">
      <section className="w-full max-w-2xl border border-yellow-400/30 bg-[#111] p-8 text-center shadow-2xl shadow-yellow-400/10 sm:p-12">
        <p className="text-xs font-black tracking-[.24em] text-yellow-400">COMEPLAYERS DESKTOP</p>
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">Windows release is being prepared.</h1>
        <p className="mt-5 text-gray-400">The official installer will be available here after the signed production build is published.</p>
        <Link href="/" className="mt-8 inline-flex bg-yellow-400 px-6 py-3 font-black text-black hover:bg-yellow-300">Back to ComePlayers</Link>
      </section>
    </main>
  );
}
