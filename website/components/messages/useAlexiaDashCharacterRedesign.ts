"use client";

import { useEffect } from "react";

const RUN_ASSET = "/arcade/alexia-dash-v44/alexia-run.webp";
const JUMP_ASSET = "/arcade/alexia-dash-v44/alexia-jump.png";

type RestorableElement = HTMLElement & {
  dataset: DOMStringMap & {
    alexiaDashRedesign?: string;
    alexiaDashOriginalVisibility?: string;
    alexiaDashOriginalPosition?: string;
    alexiaDashOriginalOverflow?: string;
    alexiaDashOriginalSrc?: string;
    alexiaDashOriginalSrcset?: string;
  };
};

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function findGameBoard(): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("div, span, p, strong, b"))
    .filter((element) => normalizeText(element.textContent).includes("AVOID THE UGLY BASTARDS"));

  for (const label of labels) {
    if (!isVisible(label)) continue;

    const candidates: HTMLElement[] = [];
    let current: HTMLElement | null = label;

    for (let depth = 0; depth < 9 && current; depth += 1) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 480 && rect.height >= 280) {
        candidates.push(current);
      }
      current = current.parentElement;
    }

    if (candidates.length > 0) {
      candidates.sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
      return candidates[0];
    }
  }

  return null;
}

function findAlexiaHost(board: HTMLElement): HTMLElement | null {
  const exactSelectors = [
    '[data-character="alexia"]',
    '[data-player="alexia"]',
    '[data-testid*="alexia" i]',
    '[aria-label*="alexia" i]',
    '[class*="alexia" i]',
    'img[alt*="alexia" i]',
  ];

  for (const selector of exactSelectors) {
    const exact = Array.from(board.querySelectorAll<HTMLElement>(selector)).find(
      (element) => !element.closest('[data-alexia-dash-runtime-skin="true"]') && isVisible(element),
    );
    if (exact) return exact;
  }

  const boardRect = board.getBoundingClientRect();
  const possible = Array.from(
    board.querySelectorAll<HTMLElement>("img, svg, canvas, div, span"),
  ).filter((element) => {
    if (!isVisible(element)) return false;
    if (element.dataset.alexiaDashRedesign === "v44") return false;
    if (element.closest('[data-alexia-dash-runtime-skin="true"]')) return false;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const relativeX = (centerX - boardRect.left) / boardRect.width;
    const relativeY = (centerY - boardRect.top) / boardRect.height;
    const area = rect.width * rect.height;
    const text = normalizeText(element.textContent);

    return (
      relativeX >= 0.05 &&
      relativeX <= 0.43 &&
      relativeY >= 0.58 &&
      relativeY <= 0.98 &&
      rect.width >= 35 &&
      rect.width <= 190 &&
      rect.height >= 45 &&
      rect.height <= 200 &&
      area >= 1800 &&
      area <= 32000 &&
      text !== "CP" &&
      !text.includes("AVOID")
    );
  });

  possible.sort((left, right) => {
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const aScore = a.width * a.height + (a.bottom - boardRect.top) * 8;
    const bScore = b.width * b.height + (b.bottom - boardRect.top) * 8;
    return bScore - aScore;
  });

  return possible[0] || null;
}

function createSkinImage() {
  const image = document.createElement("img");
  image.src = RUN_ASSET;
  image.alt = "Alexia";
  image.draggable = false;
  image.dataset.alexiaDashRuntimeSkin = "true";
  image.style.pointerEvents = "none";
  image.style.userSelect = "none";
  image.style.objectFit = "contain";
  image.style.objectPosition = "center bottom";
  image.style.filter =
    "drop-shadow(0 0 7px rgba(250, 204, 21, 0.92)) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.5))";
  return image;
}

function attachToHost(host: RestorableElement) {
  if (host.dataset.alexiaDashRedesign === "v44") return null;
  host.dataset.alexiaDashRedesign = "v44";

  if (host instanceof HTMLImageElement) {
    host.dataset.alexiaDashOriginalSrc = host.getAttribute("src") || "";
    host.dataset.alexiaDashOriginalSrcset = host.getAttribute("srcset") || "";
    host.removeAttribute("srcset");
    host.src = RUN_ASSET;
    host.alt = "Alexia";
    host.style.objectFit = "contain";
    host.style.objectPosition = "center bottom";
    host.style.filter =
      "drop-shadow(0 0 7px rgba(250, 204, 21, 0.92)) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.5))";
    return { image: host, injected: false };
  }

  const computed = window.getComputedStyle(host);
  host.dataset.alexiaDashOriginalPosition = host.style.position;
  host.dataset.alexiaDashOriginalOverflow = host.style.overflow;
  if (computed.position === "static") host.style.position = "relative";
  host.style.overflow = "visible";

  Array.from(host.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    child.dataset.alexiaDashOriginalVisibility = child.style.visibility;
    child.style.visibility = "hidden";
  });

  const image = createSkinImage();
  image.style.position = "absolute";
  image.style.left = "50%";
  image.style.bottom = "0";
  image.style.transform = "translateX(-50%)";
  image.style.width = "clamp(100px, 165%, 158px)";
  image.style.height = "auto";
  image.style.maxWidth = "none";
  image.style.zIndex = "4";
  host.appendChild(image);

  return { image, injected: true };
}

function attachFallback(board: RestorableElement) {
  if (board.querySelector('[data-alexia-dash-runtime-skin="true"]')) return null;

  const computed = window.getComputedStyle(board);
  board.dataset.alexiaDashOriginalPosition = board.style.position;
  board.dataset.alexiaDashOriginalOverflow = board.style.overflow;
  if (computed.position === "static") board.style.position = "relative";

  const image = createSkinImage();
  image.style.position = "absolute";
  image.style.left = "15%";
  image.style.bottom = "2.5%";
  image.style.width = "clamp(108px, 12vw, 158px)";
  image.style.height = "auto";
  image.style.zIndex = "30";
  board.appendChild(image);

  return { image, injected: true };
}

export function useAlexiaDashCharacterRedesign() {
  useEffect(() => {
    let animationFrame = 0;
    let observedHost: HTMLElement | null = null;
    let activeImage: HTMLImageElement | null = null;
    let baselineBottom = 0;
    let currentAsset = "";

    const updatePose = () => {
      if (observedHost && activeImage && document.contains(observedHost)) {
        const rect = observedHost.getBoundingClientRect();
        baselineBottom = Math.max(baselineBottom, rect.bottom);
        const nextAsset = rect.bottom < baselineBottom - 10 ? JUMP_ASSET : RUN_ASSET;
        if (nextAsset !== currentAsset) {
          currentAsset = nextAsset;
          activeImage.src = nextAsset;
        }
      }
      animationFrame = window.requestAnimationFrame(updatePose);
    };

    const apply = () => {
      const board = findGameBoard() as RestorableElement | null;
      if (!board) return;

      const existing = board.querySelector<HTMLImageElement>(
        '[data-alexia-dash-runtime-skin="true"]',
      );
      if (existing) {
        activeImage = existing;
        return;
      }

      const host = findAlexiaHost(board) as RestorableElement | null;
      const result = host ? attachToHost(host) : attachFallback(board);
      if (!result) return;

      observedHost = host || board;
      activeImage = result.image;
      currentAsset = RUN_ASSET;
      baselineBottom = observedHost.getBoundingClientRect().bottom;
    };

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(apply, 700);
    apply();
    animationFrame = window.requestAnimationFrame(updatePose);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);
}
