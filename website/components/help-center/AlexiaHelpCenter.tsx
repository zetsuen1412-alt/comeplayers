"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import {
  FaArrowRight,
  FaBolt,
  FaCheck,
  FaComments,
  FaHeadset,
  FaPaperPlane,
  FaShieldAlt,
  FaTicketAlt,
  FaTimes,
} from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import styles from "./AlexiaHelpCenter.module.css";

const quickPrompts = [
  { title: "How to pay", prompt: "How do I pay for an order on ComePlayers?" },
  { title: "Join a tournament", prompt: "How do I find and join a tournament?" },
  { title: "Create a server", prompt: "How do I create a server in Community?" },
  { title: "Become a seller", prompt: "How do I start selling products on ComePlayers?" },
];

const supportTopics = [
  "Payments or QRIS",
  "Orders and delivery",
  "Account and security",
  "Marketplace and sellers",
];

type AlexiaAvatarProps = {
  size?: "hero" | "header" | "mini";
  explaining?: boolean;
};

function AlexiaAvatar({ size = "mini", explaining = false }: AlexiaAvatarProps) {
  const sizeClass = {
    hero: styles.portraitHero,
    header: styles.portraitHeader,
    mini: styles.portraitMini,
  }[size];

  return (
    <span
      className={`${styles.alexiaPortrait} ${sizeClass} ${explaining ? styles.portraitExplaining : ""}`}
      aria-hidden="true"
    >
      <span className={`${styles.alexiaSprite} ${explaining ? styles.spriteQuestion : styles.spriteIdle}`} />
    </span>
  );
}

export default function AlexiaHelpCenter() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ id: number; url: string } | null>(null);
  const [escalationError, setEscalationError] = useState("");
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/alexia/chat" }),
    [],
  );
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const isBusy = status === "submitted" || status === "streaming";

  function focusAlexiaChat() {
    document.getElementById("alexia-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => inputRef.current?.focus(), 450);
  }

  function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || isBusy) return;
    sendMessage({ text: value });
    setInput("");
  }

  function askQuickPrompt(prompt: string) {
    if (isBusy) return;
    sendMessage({ text: prompt });
  }

  async function submitEscalation(event: React.FormEvent) {
    event.preventDefault();
    const message = adminMessage.trim();

    if (message.length < 10) {
      setEscalationError("Please describe what you need in at least 10 characters.");
      return;
    }

    setEscalating(true);
    setEscalationError("");

    try {
      const result = await authenticatedFetchJson<{ ticketId: number; supportUrl: string }>(
        "/api/alexia/escalate",
        {
          method: "POST",
          body: JSON.stringify({
            subject: subject.trim() || "Help from Alexia",
            message,
            category: "general",
          }),
        },
      );
      setTicketResult({ id: result.ticketId, url: result.supportUrl });
      setSubject("");
      setAdminMessage("");
    } catch (submitError) {
      const messageText = submitError instanceof Error ? submitError.message : "Unable to contact an admin.";
      if (/login|masuk|authentication/i.test(messageText)) {
        setAdminOpen(false);
        setAuthOpen(true);
      } else {
        setEscalationError(messageText);
      }
    } finally {
      setEscalating(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.gridGlow} aria-hidden="true" />
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><FaBolt /> ALEXIA HELP CENTER <span>LIVE</span></div>
          <h1>Need help?<br /><strong>Ask Alexia.</strong></h1>
          <p>
            Get quick answers about ComePlayers features, payments, Marketplace,
            Community, and tournaments. If you need human assistance, an admin is ready to help.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryButton} type="button" onClick={focusAlexiaChat}><FaComments /> Start asking <FaArrowRight /></button>
            <button className={styles.secondaryButton} type="button" onClick={() => setAdminOpen(true)}><FaHeadset /> Talk to an admin</button>
          </div>
          <div className={styles.trustRow}>
            <span><FaCheck /> Safe for general questions</span>
            <span><FaShieldAlt /> Does not store card details or OTPs</span>
          </div>
        </div>
        <button className={`${styles.heroOrb} ${styles.alexiaTrigger}`} type="button" onClick={focusAlexiaChat} aria-label="Click Alexia to start asking">
          <span className={styles.mascotBubble}>
            <strong>AI ALEXIA</strong>
            <span>{isBusy ? "I’m explaining the answer..." : "Click me to start asking."}</span>
          </span>
          <div className={styles.orbRing} />
          <AlexiaAvatar size="hero" explaining={isBusy} />
          <span className={styles.orbLabel}>AI ALEXIA<br /><small>COMEPLAYERS SUPPORT</small></span>
          <span className={styles.clickHint}><FaComments /> CLICK TO ASK</span>
        </button>
      </section>

      <section className={styles.workspace} id="alexia-chat">
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <button type="button" className={styles.avatarButton} onClick={() => inputRef.current?.focus()} aria-label="Focus the Alexia question field"><AlexiaAvatar size="header" explaining={isBusy} /></button>
            <div><h2>AI Alexia Assistant</h2><p><span className={styles.onlineDot} /> {isBusy ? "Explaining your answer" : "Ready to help in seconds"}</p></div>
            <div className={styles.securePill}><FaShieldAlt /> SECURE</div>
          </div>
          <div className={styles.messages} aria-live="polite">
            <div className={`${styles.messageRow} ${styles.assistantRow}`}>
              <AlexiaAvatar size="mini" />
              <div className={styles.messageBubble}>
                <span className={styles.messageLabel}>Alexia</span>
                <p>Hi! I’m Alexia. Ask me anything about ComePlayers and I’ll guide you through it.</p>
                <div className={styles.suggestionHint}>Choose a quick question below or type your own.</div>
              </div>
            </div>
            {messages.map((message) => (
              <div key={message.id} className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.assistantRow}`}>
                {message.role !== "user" && <AlexiaAvatar size="mini" explaining={isBusy && message.id === messages.at(-1)?.id} />}
                <div className={styles.messageBubble}>
                  <span className={styles.messageLabel}>{message.role === "user" ? "You" : "Alexia"}</span>
                  {message.parts.map((part, index) => part.type === "text" ? <p key={`${message.id}-${index}`}>{part.text}</p> : null)}
                </div>
              </div>
            ))}
            {isBusy && <div className={`${styles.messageRow} ${styles.assistantRow}`}><AlexiaAvatar size="mini" explaining /><div className={`${styles.messageBubble} ${styles.typing}`}><span>Alexia is explaining</span><i /><i /><i /></div></div>}
            {error && <div className={styles.errorNote}>Alexia is temporarily unavailable. Try again or choose Talk to an Admin.</div>}
          </div>
          <div className={styles.quickPrompts}>
            {quickPrompts.map((item) => <button type="button" key={item.title} onClick={() => askQuickPrompt(item.prompt)} disabled={isBusy}>{item.title}</button>)}
          </div>
          <form className={styles.composer} onSubmit={submitMessage}>
            <input ref={inputRef} data-alexia-input="true" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a question for AI Alexia..." maxLength={4000} aria-label="Question for Alexia" />
            {isBusy ? <button type="button" className={styles.stopButton} onClick={() => stop()} aria-label="Stop the response"><FaTimes /></button> : <button type="submit" className={styles.sendButton} disabled={!input.trim()} aria-label="Send question"><FaPaperPlane /></button>}
          </form>
          <p className={styles.composerNote}>Never enter your password, OTP, PIN, CVV, card number, or API key.</p>
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.sideHeading}><span className={styles.sideIcon}><FaHeadset /></span><div><p className={styles.kicker}>NEED A HUMAN?</p><h2>An admin is ready to help</h2></div></div>
          <p className={styles.sideCopy}>For account, order, payment, or dispute issues, submit a ticket and our team will follow up securely.</p>
          <button type="button" className={styles.adminButton} onClick={() => setAdminOpen(true)}>Open admin chat <FaArrowRight /></button>
          <div className={styles.topicList}>
            {supportTopics.map((topic) => <div key={topic}><FaCheck /> {topic}</div>)}
          </div>
          <Link href="/support" className={styles.ticketLink}><FaTicketAlt /> View my tickets</Link>
          <div className={styles.responseCard}><span>Average response</span><strong>&lt; 15 minutes</strong><small>During support hours</small></div>
        </aside>
      </section>

      <section className={styles.footerNote}><FaShieldAlt /><p><strong>ComePlayers Secure Support</strong><br />Alexia provides general information. Payment decisions, refunds, and order statuses are always confirmed through the system and official admins.</p></section>

      {adminOpen && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminOpen(false); }}><section className={styles.adminModal} role="dialog" aria-modal="true" aria-labelledby="admin-title"><button type="button" className={styles.closeModal} onClick={() => setAdminOpen(false)} aria-label="Close"><FaTimes /></button>{ticketResult ? <div className={styles.successState}><div className={styles.successIcon}><FaCheck /></div><h2 id="admin-title">Ticket created successfully</h2><p>An admin will reply through the official support room. Your ticket number is <strong>#{ticketResult.id}</strong>.</p><Link href={ticketResult.url} className={styles.primaryButton}>Open ticket <FaArrowRight /></Link></div> : <><p className={styles.kicker}>DIRECT ADMIN CHANNEL</p><h2 id="admin-title">Talk to an admin</h2><p className={styles.modalCopy}>Describe what you need. Never send sensitive data such as an OTP, password, PIN, CVV, or card number.</p><form onSubmit={submitEscalation} className={styles.adminForm}><label>Topic (optional)<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Example: My QRIS payment has not been confirmed" maxLength={180} /></label><label>Your message<textarea value={adminMessage} onChange={(event) => setAdminMessage(event.target.value)} placeholder="Describe your issue or question..." maxLength={4000} required /></label>{escalationError && <p className={styles.formError}>{escalationError}</p>}<button type="submit" className={styles.primaryButton} disabled={escalating}>{escalating ? "Sending ticket..." : "Send to admin"} <FaArrowRight /></button></form></>}</section></div>}
      <AuthModal open={authOpen} initialMode="login" onClose={() => setAuthOpen(false)} redirectPath="/help-center" contextMessage="Sign in to continue the conversation with a ComePlayers admin." />
    </main>
  );
}
