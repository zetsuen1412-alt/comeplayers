"use client";

import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCurrency } from "@/components/CurrencyProvider";
import styles from "./AlexiaPet.module.css";

type AnimatedMode =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "working"
  | "review";
type PetMode = AnimatedMode | "look";

type PetPosition = {
  left: number;
  top: number;
};

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  lastX: number;
  moved: boolean;
};

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const POSITION_STORAGE_KEY = "comeplayers-alexia-pet-position-v1";
const DRAG_THRESHOLD = 6;
const EDGE_GAP = 8;
const ALEXIA_AVATAR = "/arcade/monopoly/alexia-avatar.webp";

const QUICK_QUESTIONS = [
  {
    label: "Buyer protection",
    question: "How does buyer protection work on ComePlayers?",
  },
  {
    label: "Payments",
    question: "Which payment methods can I use, and how is my payment confirmed?",
  },
  {
    label: "Buy or sell",
    question: "How do I buy or sell safely on the ComePlayers Marketplace?",
  },
  {
    label: "Community",
    question: "How do Community, Messages, and seller chat work?",
  },
  {
    label: "Tournaments",
    question: "How do I join or post a tournament on ComePlayers?",
  },
] as const;

const QUICK_QUESTIONS_ID = [
  { label: "Perlindungan pembeli", question: "Bagaimana perlindungan pembeli bekerja di ComePlayers?" },
  { label: "Pembayaran", question: "Metode pembayaran apa yang dapat digunakan dan bagaimana pembayaran dikonfirmasi?" },
  { label: "Beli atau jual", question: "Bagaimana cara membeli atau menjual dengan aman di Marketplace ComePlayers?" },
  { label: "Komunitas", question: "Bagaimana cara kerja Komunitas, Pesan, dan chat penjual?" },
  { label: "Turnamen", question: "Bagaimana cara mengikuti atau membuat turnamen di ComePlayers?" },
] as const;

const ALEXIA_COPY = {
  en: {
    greeting: "Hi! I’m ready to accompany your ComePlayers journey.",
    stay: "All right, I’ll stay with you here!",
    assistantAria: "Alexia, your ComePlayers virtual assistant",
    dialogAria: "Chat with AI Alexia",
    busy: "Explaining…",
    online: "Online · Multilingual support",
    close: "Close Alexia chat",
    intro: "Hi! I’m Alexia. Ask me anything about ComePlayers in your preferred language.",
    you: "You",
    explaining: "Alexia is explaining",
    unavailable: "Alexia is temporarily unavailable. Please try again.",
    suggestions: "Suggested questions",
    placeholder: "Ask Alexia...",
    typeAria: "Type a question for Alexia",
    stopAria: "Stop Alexia's response",
    sendAria: "Send to Alexia",
    safety: "Never share your password, OTP, PIN, CVV, or API key.",
    openButton: "Open AI Alexia chat; hold and drag to move Alexia",
    closeButton: "Close AI Alexia chat; hold and drag to move Alexia",
    buttonTitle: "Click to chat directly with Alexia · hold and drag to move",
  },
  id: {
    greeting: "Hai! Saya siap menemani perjalanan Anda di ComePlayers.",
    stay: "Baik, saya akan tetap bersama Anda di sini!",
    assistantAria: "Alexia, asisten virtual ComePlayers Anda",
    dialogAria: "Chat dengan AI Alexia",
    busy: "Sedang menjelaskan…",
    online: "Online · Dukungan multibahasa",
    close: "Tutup chat Alexia",
    intro: "Hai! Saya Alexia. Tanyakan apa saja tentang ComePlayers dalam bahasa pilihan Anda.",
    you: "Anda",
    explaining: "Alexia sedang menjelaskan",
    unavailable: "Alexia sementara tidak tersedia. Silakan coba lagi.",
    suggestions: "Pertanyaan yang disarankan",
    placeholder: "Tanya Alexia...",
    typeAria: "Ketik pertanyaan untuk Alexia",
    stopAria: "Hentikan jawaban Alexia",
    sendAria: "Kirim ke Alexia",
    safety: "Jangan pernah membagikan kata sandi, OTP, PIN, CVV, atau API key Anda.",
    openButton: "Buka chat AI Alexia; tahan dan geser untuk memindahkan Alexia",
    closeButton: "Tutup chat AI Alexia; tahan dan geser untuk memindahkan Alexia",
    buttonTitle: "Klik untuk chat dengan Alexia · tahan dan geser untuk memindahkan",
  },
} as const;

const ANIMATIONS: Record<
  AnimatedMode,
  { row: number; durations: readonly number[]; loops?: boolean }
> = {
  idle: {
    row: 0,
    durations: [280, 110, 110, 140, 140, 320],
    loops: true,
  },
  "running-right": {
    row: 1,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: true,
  },
  "running-left": {
    row: 2,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loops: true,
  },
  waving: {
    row: 3,
    durations: [140, 140, 140, 280],
  },
  jumping: {
    row: 4,
    durations: [140, 140, 140, 140, 280],
  },
  failed: {
    row: 5,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
  },
  waiting: {
    row: 6,
    durations: [150, 150, 150, 150, 150, 260],
  },
  working: {
    row: 7,
    durations: [120, 120, 120, 120, 120, 220],
  },
  review: {
    row: 8,
    durations: [150, 150, 150, 150, 150, 280],
  },
};

const AUTOMATIC_EXPRESSIONS: readonly AnimatedMode[] = [
  "waiting",
  "working",
  "review",
  "jumping",
  "waving",
];

const SITE_INTERACTION_EXPRESSIONS: readonly AnimatedMode[] = [
  "waving",
  "review",
  "working",
  "jumping",
  "waiting",
];

const SITE_INTERACTION_SELECTOR = [
  "a[href]",
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[aria-haspopup]",
  "[data-alexia-expression-trigger]",
].join(",");

function expressionForSiteInteraction(
  control: Element,
  fallbackIndex: number,
): AnimatedMode {
  const signal = [
    control.textContent,
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control.getAttribute("href"),
    control.getAttribute("name"),
    control.getAttribute("data-alexia-expression-trigger"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  if (
    /\b(game|games|gaming|play|arcade|bermain|turnamen|tournament|match)\b/.test(
      signal,
    )
  ) {
    return "jumping";
  }

  if (
    /\b(payment|checkout|order|wallet|cart|buy|sell|pay|pembayaran|pesanan|dompet|keranjang|beli|jual)\b/.test(
      signal,
    )
  ) {
    return "working";
  }

  if (
    /\b(search|filter|sort|review|detail|details|category|categories|cari|saring|urut|periksa|kategori)\b/.test(
      signal,
    )
  ) {
    return "review";
  }

  if (
    /\b(notification|message|chat|profile|account|settings|language|currency|notifikasi|pesan|profil|akun|pengaturan|bahasa|mata uang)\b/.test(
      signal,
    )
  ) {
    return "waiting";
  }

  if (/\b(delete|remove|logout|sign out|hapus|keluar)\b/.test(signal)) {
    return "failed";
  }

  if (
    control.matches("[aria-haspopup]") ||
    control.closest("nav, [role='menu'], [role='navigation']")
  ) {
    return "waving";
  }

  return SITE_INTERACTION_EXPRESSIONS[
    fallbackIndex % SITE_INTERACTION_EXPRESSIONS.length
  ];
}

function directionIndex(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
) {
  const clockwiseFromUp =
    (Math.atan2(pointerX - centerX, -(pointerY - centerY)) * 180) / Math.PI;

  return Math.round(((clockwiseFromUp + 360) % 360) / 22.5) % 16;
}

function clampPosition(left: number, top: number, width: number, height: number) {
  return {
    left: Math.min(
      Math.max(left, EDGE_GAP),
      Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP),
    ),
    top: Math.min(
      Math.max(top, EDGE_GAP),
      Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP),
    ),
  };
}

function isStoredPosition(value: unknown): value is PetPosition {
  if (!value || typeof value !== "object") return false;

  const position = value as Partial<PetPosition>;
  return Number.isFinite(position.left) && Number.isFinite(position.top);
}

export default function AlexiaPet() {
  const pathname = usePathname();
  const { locale } = useCurrency();
  const isIndonesian = locale === "id-ID";
  const alexiaCopy = isIndonesian ? ALEXIA_COPY.id : ALEXIA_COPY.en;
  const quickQuestions = isIndonesian ? QUICK_QUESTIONS_ID : QUICK_QUESTIONS;
  const petRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<PetMode>("idle");
  const positionRef = useRef<PetPosition | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const lookTimerRef = useRef<number | null>(null);
  const bubbleTimerRef = useRef<number | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const automaticExpressionRef = useRef(0);
  const siteInteractionExpressionRef = useRef(0);
  const suppressClickRef = useRef(false);
  const latestPointerRef = useRef({ x: 0, y: 0 });
  const [mode, setMode] = useState<PetMode>("idle");
  const [frame, setFrame] = useState(0);
  const [lookIndex, setLookIndex] = useState(0);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleMessage, setBubbleMessage] = useState<string>(alexiaCopy.greeting);
  const [position, setPosition] = useState<PetPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOnLeft, setIsOnLeft] = useState(false);
  const [isNearTop, setIsNearTop] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatTransport = useMemo(
    () => new DefaultChatTransport({ api: "/api/alexia/chat" }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: chatTransport,
  });
  const isChatBusy = status === "submitted" || status === "streaming";

  const changeMode = (nextMode: PetMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
    setFrame(0);
  };

  const showBubble = (message: string, duration = 4200) => {
    if (chatOpen) return;
    setBubbleMessage(message);
    setBubbleVisible(true);

    if (bubbleTimerRef.current !== null) {
      window.clearTimeout(bubbleTimerRef.current);
    }

    bubbleTimerRef.current = window.setTimeout(() => {
      setBubbleVisible(false);
    }, duration);
  };

  const movePet = (left: number, top: number, persist = false) => {
    const bounds = petRef.current?.getBoundingClientRect();
    if (!bounds) return null;

    const nextPosition = clampPosition(left, top, bounds.width, bounds.height);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    setIsOnLeft(nextPosition.left + bounds.width / 2 <= window.innerWidth / 2);
    setIsNearTop(nextPosition.top < 150);

    if (persist) {
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      } catch {
        // The pet still works when storage is unavailable.
      }
    }

    return nextPosition;
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!chatOpen) return;

    const scroller = chatMessagesRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [chatOpen, messages, status]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);

    updatePreference();
    media.addEventListener("change", updatePreference);

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    try {
      const storedPosition = JSON.parse(
        window.localStorage.getItem(POSITION_STORAGE_KEY) ?? "null",
      ) as unknown;
      const bounds = petRef.current?.getBoundingClientRect();

      if (isStoredPosition(storedPosition) && bounds) {
        const nextPosition = clampPosition(
          storedPosition.left,
          storedPosition.top,
          bounds.width,
          bounds.height,
        );
        positionRef.current = nextPosition;
        setPosition(nextPosition);
        setIsOnLeft(nextPosition.left + bounds.width / 2 <= window.innerWidth / 2);
        setIsNearTop(nextPosition.top < 150);
      }
    } catch {
      // Ignore malformed or unavailable storage and use the default position.
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const currentPosition = positionRef.current;
      const bounds = petRef.current?.getBoundingClientRect();
      if (!currentPosition || !bounds) return;

      const nextPosition = clampPosition(
        currentPosition.left,
        currentPosition.top,
        bounds.width,
        bounds.height,
      );
      positionRef.current = nextPosition;
      setPosition(nextPosition);
      setIsOnLeft(nextPosition.left + bounds.width / 2 <= window.innerWidth / 2);
      setIsNearTop(nextPosition.top < 150);

      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      } catch {
        // Resizing remains functional when storage is unavailable.
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const animationMode = isChatBusy ? "working" : mode;
    if (reducedMotion || animationMode === "look") return;

    const animation = ANIMATIONS[animationMode];
    const lastFrame = animation.durations.length - 1;
    const duration = animation.durations[Math.min(frame, lastFrame)];
    const timer = window.setTimeout(() => {
      if (frame >= lastFrame) {
        if (animation.loops) {
          setFrame(0);
        } else {
          modeRef.current = "idle";
          setMode("idle");
          setFrame(0);
        }
        return;
      }

      setFrame((current) => current + 1);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [frame, isChatBusy, mode, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      if (
        dragRef.current ||
        isChatBusy ||
        !["idle", "look"].includes(modeRef.current)
      ) return;

      const nextMode =
        AUTOMATIC_EXPRESSIONS[
          automaticExpressionRef.current % AUTOMATIC_EXPRESSIONS.length
        ];
      automaticExpressionRef.current += 1;
      modeRef.current = nextMode;
      setMode(nextMode);
      setFrame(0);
    }, 12000);

    return () => window.clearInterval(interval);
  }, [isChatBusy, reducedMotion]);

  useEffect(() => {
    const playSiteInteractionExpression = (control: Element) => {
      if (
        dragRef.current ||
        control.closest("[data-alexia-pet='true']") ||
        control.matches(":disabled, [aria-disabled='true']")
      ) {
        return;
      }

      const nextMode = expressionForSiteInteraction(
        control,
        siteInteractionExpressionRef.current,
      );
      siteInteractionExpressionRef.current += 1;
      modeRef.current = nextMode;
      setMode(nextMode);
      setFrame(0);
    };

    const handleSiteClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const control = target.closest(SITE_INTERACTION_SELECTOR);
      if (control) playSiteInteractionExpression(control);
    };

    const handleSiteChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;

      playSiteInteractionExpression(target);
    };

    document.addEventListener("click", handleSiteClick, true);
    document.addEventListener("change", handleSiteChange, true);

    return () => {
      document.removeEventListener("click", handleSiteClick, true);
      document.removeEventListener("change", handleSiteChange, true);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const handlePointerMove = (event: PointerEvent) => {
      latestPointerRef.current = { x: event.clientX, y: event.clientY };
      if (pointerFrameRef.current !== null) return;

      pointerFrameRef.current = window.requestAnimationFrame(() => {
        pointerFrameRef.current = null;
        if (dragRef.current || !["idle", "look"].includes(modeRef.current)) return;

        const button = buttonRef.current;
        if (!button) return;

        const bounds = button.getBoundingClientRect();
        const pointer = latestPointerRef.current;
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height * 0.42;
        const distance = Math.hypot(pointer.x - centerX, pointer.y - centerY);

        if (distance > 900) return;

        modeRef.current = "look";
        setLookIndex(directionIndex(pointer.x, pointer.y, centerX, centerY));
        setMode("look");
        setFrame(0);

        if (lookTimerRef.current !== null) {
          window.clearTimeout(lookTimerRef.current);
        }

        lookTimerRef.current = window.setTimeout(() => {
          modeRef.current = "idle";
          setMode("idle");
          setFrame(0);
        }, 900);
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current);
      }
      if (lookTimerRef.current !== null) {
        window.clearTimeout(lookTimerRef.current);
      }
    };
  }, [reducedMotion]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current !== null) {
        window.clearTimeout(bubbleTimerRef.current);
      }
    },
    [],
  );

  const playWave = () => {
    if (dragRef.current) return;
    changeMode("waving");
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const nextOpen = !chatOpen;
    setChatOpen(nextOpen);
    setBubbleVisible(false);

    if (bubbleTimerRef.current !== null) {
      window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }

    changeMode(nextOpen ? "waving" : "idle");
    if (nextOpen) {
      window.setTimeout(() => chatInputRef.current?.focus(), 220);
    }
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = chatInput.trim();
    if (!value || isChatBusy) return;
    sendMessage({ text: value });
    setChatInput("");
  };

  const askQuickQuestion = (text: string) => {
    if (isChatBusy) return;
    sendMessage({ text });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const bounds = petRef.current?.getBoundingClientRect();
    if (!bounds) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: bounds.left,
      originTop: bounds.top,
      lastX: event.clientX,
      moved: false,
    };
    positionRef.current = { left: bounds.left, top: bounds.top };
    setPosition({ left: bounds.left, top: bounds.top });
    setIsOnLeft(bounds.left + bounds.width / 2 <= window.innerWidth / 2);
    setIsNearTop(bounds.top < 150);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

    event.preventDefault();
    drag.moved = true;
    setIsDragging(true);
    movePet(drag.originLeft + deltaX, drag.originTop + deltaY);

    if (Math.abs(event.clientX - drag.lastX) > 1) {
      const runningMode = event.clientX > drag.lastX ? "running-right" : "running-left";
      if (modeRef.current !== runningMode) {
        changeMode(runningMode);
      }
    }
    drag.lastX = event.clientX;
  };

  const finishDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    setIsDragging(false);

    if (drag.moved) {
      suppressClickRef.current = true;
      const finalPosition = positionRef.current;
      if (finalPosition) {
        movePet(finalPosition.left, finalPosition.top, true);
      }
      changeMode("jumping");
      showBubble(alexiaCopy.stay, 3200);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const renderedMode: PetMode = isChatBusy ? "working" : mode;
  let row = 0;
  let column = 0;

  if (renderedMode === "look") {
    row = lookIndex < 8 ? 9 : 10;
    column = lookIndex < 8 ? lookIndex : lookIndex - 8;
  } else {
    row = ANIMATIONS[renderedMode].row;
    column = reducedMotion ? 0 : frame;
  }

  const spriteStyle = {
    "--alexia-sprite-x": `${-column * CELL_WIDTH}px`,
    "--alexia-sprite-y": `${-row * CELL_HEIGHT}px`,
  } as CSSProperties;
  const petStyle = position
    ? ({
        left: `${position.left}px`,
        top: `${position.top}px`,
        right: "auto",
        bottom: "auto",
      } satisfies CSSProperties)
    : undefined;

  if (pathname === "/help-center") return null;

  return (
    <aside
      ref={petRef}
      className={`${styles.pet} ${isDragging ? styles.dragging : ""} ${
        isOnLeft ? styles.petOnLeft : ""
      } ${isNearTop ? styles.petNearTop : ""} ${
        pathname === "/seller/products/import" ? styles.spreadsheetImport : ""
      }`}
      style={petStyle}
      data-alexia-pet="true"
      data-alexia-expression={renderedMode}
      aria-label={alexiaCopy.assistantAria}
    >
      {chatOpen ? (
        <section
          id="alexia-floating-chat"
          className={styles.chatPanel}
          role="dialog"
          aria-label={alexiaCopy.dialogAria}
        >
          <header className={styles.chatHeader}>
            <span className={styles.chatProfile} aria-hidden="true">
              <Image
                src={ALEXIA_AVATAR}
                alt=""
                fill
                sizes="44px"
                className={styles.chatProfileImage}
              />
              <i />
            </span>
            <span>
              <strong>AI ALEXIA</strong>
              <small>{isChatBusy ? alexiaCopy.busy : alexiaCopy.online}</small>
            </span>
            <button
              type="button"
              className={styles.chatClose}
              onClick={() => {
                setChatOpen(false);
                changeMode("idle");
              }}
              aria-label={alexiaCopy.close}
            >
              ×
            </button>
          </header>

          <div ref={chatMessagesRef} className={styles.chatMessages} aria-live="polite">
            <div className={styles.chatMessageRow}>
              <span className={styles.messageAvatar} aria-hidden="true">
                <Image src={ALEXIA_AVATAR} alt="" fill sizes="28px" />
              </span>
              <div className={`${styles.chatMessage} ${styles.alexiaMessage}`}>
                <b>Alexia</b>
                <p>{alexiaCopy.intro}</p>
              </div>
            </div>
            {messages.map((message) => {
              const isUserMessage = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`${styles.chatMessageRow} ${isUserMessage ? styles.userMessageRow : ""}`}
                >
                  {!isUserMessage ? (
                    <span className={styles.messageAvatar} aria-hidden="true">
                      <Image src={ALEXIA_AVATAR} alt="" fill sizes="28px" />
                    </span>
                  ) : null}
                  <div
                    className={`${styles.chatMessage} ${isUserMessage ? styles.userMessage : styles.alexiaMessage}`}
                  >
                    <b>{isUserMessage ? alexiaCopy.you : "Alexia"}</b>
                    {message.parts.map((part, index) =>
                      part.type === "text" ? <p key={`${message.id}-${index}`}>{part.text}</p> : null,
                    )}
                  </div>
                </div>
              );
            })}
            {isChatBusy ? (
              <div className={styles.chatMessageRow}>
                <span className={styles.messageAvatar} aria-hidden="true">
                  <Image src={ALEXIA_AVATAR} alt="" fill sizes="28px" />
                </span>
                <div className={`${styles.chatMessage} ${styles.alexiaMessage} ${styles.chatTyping}`}>
                  <b>{alexiaCopy.explaining}</b>
                  <span><i /><i /><i /></span>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className={styles.chatError}>{alexiaCopy.unavailable}</div>
            ) : null}
          </div>

          <div className={styles.chatRecommendations}>
            <p>{alexiaCopy.suggestions}</p>
            <div className={styles.chatPrompts}>
              {quickQuestions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={isChatBusy}
                  onClick={() => askQuickQuestion(item.question)}
                  title={item.question}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <form className={styles.chatComposer} onSubmit={submitChat}>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={alexiaCopy.placeholder}
              aria-label={alexiaCopy.typeAria}
              maxLength={4000}
            />
            {isChatBusy ? (
              <button type="button" onClick={() => stop()} aria-label={alexiaCopy.stopAria}>■</button>
            ) : (
              <button type="submit" disabled={!chatInput.trim()} aria-label={alexiaCopy.sendAria}>➤</button>
            )}
          </form>
          <p className={styles.chatSafety}>{alexiaCopy.safety}</p>
        </section>
      ) : null}

      <div
        className={`${styles.bubble} ${bubbleVisible && !chatOpen ? styles.bubbleVisible : ""}`}
        aria-live="polite"
      >
        <strong>Alexia</strong>
        <span>{bubbleMessage}</span>
      </div>

      <span className={styles.perch} aria-hidden="true" />

      <button
        ref={buttonRef}
        type="button"
        className={styles.petButton}
        aria-label={chatOpen ? alexiaCopy.closeButton : alexiaCopy.openButton}
        aria-expanded={chatOpen}
        aria-controls="alexia-floating-chat"
        title={alexiaCopy.buttonTitle}
        onClick={handleClick}
        onFocus={playWave}
        onMouseEnter={playWave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
      >
        <span className={styles.sprite} style={spriteStyle} aria-hidden="true" />
      </button>
    </aside>
  );
}
