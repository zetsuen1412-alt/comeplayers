"use client";

import { useEffect, useRef } from "react";
import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import type { LobbyChoice } from "./game-lobby-v6.types";
import styles from "./game-lobby-v6.module.css";

type Props = { activeChoice: LobbyChoice; transitionActive: boolean; entered: boolean };
type Point = { x: number; y: number };
type Star = { graphic: Graphics; baseX: number; baseY: number; speed: number; drift: number; phase: number };

const SOURCES = {
  idle: "/game-lobby-v6/idle.webp",
  chat: "/game-lobby-v6/chat.webp",
  marketplace: "/game-lobby-v6/marketplace.webp",
} as const;

function damp(current: number, target: number, smoothing: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

export default function GameLobbyCanvasV6({ activeChoice, transitionActive, entered }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const choiceRef = useRef<LobbyChoice>(activeChoice);
  const transitionRef = useRef(transitionActive);
  const enteredRef = useRef(entered);

  useEffect(() => { choiceRef.current = activeChoice; }, [activeChoice]);
  useEffect(() => { transitionRef.current = transitionActive; }, [transitionActive]);
  useEffect(() => { enteredRef.current = entered; }, [entered]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let cleanupPointer = () => undefined;
    const app = new Application();

    const setup = async () => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.65),
        powerPreference: "high-performance",
        preference: "webgl",
      });
      if (cancelled) { app.destroy(true); return; }
      app.canvas.className = styles.pixiCanvas;
      app.canvas.setAttribute("aria-hidden", "true");
      host.appendChild(app.canvas);

      const [idleTexture, chatTexture, marketplaceTexture] = await Promise.all([
        Assets.load(SOURCES.idle), Assets.load(SOURCES.chat), Assets.load(SOURCES.marketplace),
      ]);
      if (cancelled) { app.destroy(true); return; }

      const world = new Container();
      const sceneLayer = new Container();
      const particleLayer = new Container();
      const lightLayer = new Container();
      world.addChild(sceneLayer, particleLayer, lightLayer);
      app.stage.addChild(world);

      const idle = new Sprite(idleTexture);
      const chat = new Sprite(chatTexture);
      const marketplace = new Sprite(marketplaceTexture);
      const scenes = { idle, chat, marketplace };
      Object.values(scenes).forEach((sprite) => {
        sprite.anchor.set(0.5);
        sprite.alpha = 0;
        sceneLayer.addChild(sprite);
      });
      idle.alpha = 1;

      const glowLeft = new Graphics().roundRect(0, 0, 430, 465, 30).stroke({ width: 4, color: 0xffc400, alpha: 0.95 });
      const glowRight = new Graphics().roundRect(0, 0, 430, 465, 30).stroke({ width: 4, color: 0xffc400, alpha: 0.95 });
      glowLeft.alpha = 0; glowRight.alpha = 0;
      lightLayer.addChild(glowLeft, glowRight);

      const rings = [0, 1, 2].map((index) => {
        const ring = new Graphics().circle(0, 0, 250 + index * 115).stroke({ width: 1.5, color: 0xffc400, alpha: 0.12 - index * 0.025 });
        lightLayer.addChildAt(ring, 0);
        return ring;
      });

      const stars: Star[] = [];
      const starCount = window.innerWidth < 900 ? 30 : 72;
      for (let index = 0; index < starCount; index += 1) {
        const radius = 0.7 + Math.random() * 2.2;
        const graphic = new Graphics().circle(0, 0, radius).fill({ color: 0xffc400, alpha: 0.2 + Math.random() * 0.48 });
        particleLayer.addChild(graphic);
        stars.push({ graphic, baseX: Math.random(), baseY: Math.random(), speed: 5 + Math.random() * 18, drift: 3 + Math.random() * 13, phase: Math.random() * Math.PI * 2 });
      }

      const pointerTarget: Point = { x: 0, y: 0 };
      const pointerCurrent: Point = { x: 0, y: 0 };
      const alphaCurrent = { idle: 1, chat: 0, marketplace: 0 };
      let elapsed = 0;
      let intro = 0;
      let lastWidth = 0;
      let lastHeight = 0;

      const layout = () => {
        const width = app.screen.width;
        const height = app.screen.height;
        if (!width || !height) return;
        world.position.set(width / 2, height / 2);
        Object.values(scenes).forEach((sprite) => {
          const tw = sprite.texture.width || 1672;
          const th = sprite.texture.height || 941;
          const cover = Math.max(width / tw, height / th);
          sprite.scale.set(cover * 1.025);
          sprite.position.set(0, 0);
        });
        const glowScale = Math.min(width / 1672, height / 941) * 1.08;
        glowLeft.position.set(-width * 0.43, -height * 0.295);
        glowRight.position.set(width * 0.17, -height * 0.295);
        glowLeft.scale.set(glowScale); glowRight.scale.set(glowScale);
        rings.forEach((ring) => ring.scale.set(Math.min(width / 1500, height / 850)));
        stars.forEach((star) => star.graphic.position.set(star.baseX * width - width / 2, star.baseY * height - height / 2));
        lastWidth = width; lastHeight = height;
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      const handlePointerLeave = () => { pointerTarget.x = 0; pointerTarget.y = 0; };
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", handlePointerLeave);
      cleanupPointer = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      };
      observer = new ResizeObserver(layout);
      observer.observe(host);
      layout();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.05);
        elapsed += dt;
        if (app.screen.width !== lastWidth || app.screen.height !== lastHeight) layout();
        pointerCurrent.x = damp(pointerCurrent.x, reducedMotion ? 0 : pointerTarget.x, 5, dt);
        pointerCurrent.y = damp(pointerCurrent.y, reducedMotion ? 0 : pointerTarget.y, 5, dt);
        intro = damp(intro, enteredRef.current ? 1 : 0, 3.8, dt);

        const currentChoice = choiceRef.current;
        const desired = {
          idle: currentChoice === null ? 1 : 0,
          chat: currentChoice === "chat" ? 1 : 0,
          marketplace: currentChoice === "marketplace" ? 1 : 0,
        };
        alphaCurrent.idle = damp(alphaCurrent.idle, desired.idle, 7.5, dt);
        alphaCurrent.chat = damp(alphaCurrent.chat, desired.chat, 7.5, dt);
        alphaCurrent.marketplace = damp(alphaCurrent.marketplace, desired.marketplace, 7.5, dt);
        idle.alpha = alphaCurrent.idle; chat.alpha = alphaCurrent.chat; marketplace.alpha = alphaCurrent.marketplace;

        const breathe = reducedMotion ? 0 : Math.sin(elapsed * 1.62) * 0.0025;
        const introScale = 1.085 - intro * 0.085;
        const transitionZoom = transitionRef.current ? 0.055 : 0;
        sceneLayer.scale.set(introScale + breathe + transitionZoom);
        sceneLayer.position.set(
          reducedMotion ? 0 : pointerCurrent.x * -8.5 * intro,
          (reducedMotion ? 0 : pointerCurrent.y * -4.2 * intro) + (reducedMotion ? 0 : Math.sin(elapsed * 1.62) * -1.4 * intro)
        );
        world.alpha = 0.42 + intro * 0.58;

        const selectedGlow = 0.35 + Math.sin(elapsed * 4.4) * 0.13;
        glowLeft.alpha = damp(glowLeft.alpha, currentChoice === "chat" ? selectedGlow : 0, 10, dt);
        glowRight.alpha = damp(glowRight.alpha, currentChoice === "marketplace" ? selectedGlow : 0, 10, dt);

        rings.forEach((ring, index) => {
          ring.rotation += dt * (index % 2 === 0 ? 0.035 : -0.028);
          ring.alpha = (0.08 + Math.sin(elapsed * 0.9 + index) * 0.025) * intro;
        });
        stars.forEach((star, index) => {
          const y = star.graphic.y - star.speed * dt * (0.3 + intro * 0.7);
          star.graphic.y = y < -app.screen.height / 2 - 12 ? app.screen.height / 2 + 12 : y;
          star.graphic.x += Math.sin(elapsed * 0.8 + star.phase) * star.drift * dt;
          star.graphic.alpha = (0.2 + Math.sin(elapsed * (1.1 + (index % 4) * 0.18) + star.phase) * 0.12) * (0.35 + intro * 0.65);
        });
      });
    };

    void setup().catch((error) => console.error("ComePlayers Pixi lobby V6 failed:", error));
    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanupPointer();
      try { app.destroy(true); } catch { /* initialization may be incomplete */ }
    };
  }, []);

  return <div ref={hostRef} className={styles.canvasHost} aria-hidden="true" />;
}
