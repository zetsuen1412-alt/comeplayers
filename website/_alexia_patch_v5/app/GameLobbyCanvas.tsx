"use client";

import { useEffect, useRef } from "react";
import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import type { LobbyChoice } from "./game-lobby-v5.types";
import styles from "./game-lobby-v5.module.css";

type GameLobbyCanvasProps = {
  activeChoice: LobbyChoice;
  transitionActive: boolean;
};

type Point = { x: number; y: number };

type Star = {
  graphic: Graphics;
  baseX: number;
  baseY: number;
  speed: number;
  drift: number;
  phase: number;
};

const SOURCES = {
  idle: "/game-lobby-v5/idle.webp",
  chat: "/game-lobby-v5/chat.webp",
  marketplace: "/game-lobby-v5/marketplace.webp",
} as const;

function damp(current: number, target: number, smoothing: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

export default function GameLobbyCanvas({
  activeChoice,
  transitionActive,
}: GameLobbyCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const choiceRef = useRef<LobbyChoice>(activeChoice);
  const transitionRef = useRef(transitionActive);

  useEffect(() => {
    choiceRef.current = activeChoice;
  }, [activeChoice]);

  useEffect(() => {
    transitionRef.current = transitionActive;
  }, [transitionActive]);

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
        resolution: Math.min(window.devicePixelRatio || 1, 1.75),
        powerPreference: "high-performance",
        preference: "webgl",
      });

      if (cancelled) {
        app.destroy(true);
        return;
      }

      app.canvas.className = styles.pixiCanvas;
      app.canvas.setAttribute("aria-hidden", "true");
      host.appendChild(app.canvas);

      const textures = await Promise.all([
        Assets.load(SOURCES.idle),
        Assets.load(SOURCES.chat),
        Assets.load(SOURCES.marketplace),
      ]);

      if (cancelled) {
        app.destroy(true);
        return;
      }

      const world = new Container();
      const sceneLayer = new Container();
      const particleLayer = new Container();
      const lightLayer = new Container();
      world.addChild(sceneLayer, particleLayer, lightLayer);
      app.stage.addChild(world);

      const idle = new Sprite(textures[0]);
      const chat = new Sprite(textures[1]);
      const marketplace = new Sprite(textures[2]);
      const scenes = { idle, chat, marketplace };

      Object.values(scenes).forEach((sprite) => {
        sprite.anchor.set(0.5);
        sprite.alpha = 0;
        sceneLayer.addChild(sprite);
      });
      idle.alpha = 1;

      const glowLeft = new Graphics()
        .roundRect(0, 0, 420, 440, 26)
        .stroke({ width: 3, color: 0xffc400, alpha: 0.9 });
      glowLeft.alpha = 0;
      lightLayer.addChild(glowLeft);

      const glowRight = new Graphics()
        .roundRect(0, 0, 420, 440, 26)
        .stroke({ width: 3, color: 0xffc400, alpha: 0.9 });
      glowRight.alpha = 0;
      lightLayer.addChild(glowRight);

      const stars: Star[] = [];
      const starCount = window.innerWidth < 900 ? 28 : 58;
      for (let index = 0; index < starCount; index += 1) {
        const radius = 0.8 + Math.random() * 2.4;
        const alpha = 0.18 + Math.random() * 0.5;
        const graphic = new Graphics()
          .circle(0, 0, radius)
          .fill({ color: 0xffc400, alpha });
        particleLayer.addChild(graphic);
        stars.push({
          graphic,
          baseX: Math.random(),
          baseY: Math.random(),
          speed: 5 + Math.random() * 18,
          drift: 3 + Math.random() * 14,
          phase: Math.random() * Math.PI * 2,
        });
      }

      const pointerTarget: Point = { x: 0, y: 0 };
      const pointerCurrent: Point = { x: 0, y: 0 };
      const alphaCurrent = { idle: 1, chat: 0, marketplace: 0 };
      let elapsed = 0;
      let lastWidth = 0;
      let lastHeight = 0;

      const layout = () => {
        const width = app.screen.width;
        const height = app.screen.height;
        if (!width || !height) return;

        world.position.set(width / 2, height / 2);

        Object.values(scenes).forEach((sprite) => {
          const textureWidth = sprite.texture.width || 1672;
          const textureHeight = sprite.texture.height || 941;
          const coverScale = Math.max(width / textureWidth, height / textureHeight);
          sprite.scale.set(coverScale * 1.028);
          sprite.position.set(0, 0);
        });

        glowLeft.position.set(-width * 0.43, -height * 0.29);
        glowRight.position.set(width * 0.17, -height * 0.29);
        const glowScale = Math.min(width / 1672, height / 941) * 1.08;
        glowLeft.scale.set(glowScale);
        glowRight.scale.set(glowScale);

        stars.forEach((star) => {
          star.graphic.position.set(
            star.baseX * width - width / 2,
            star.baseY * height - height / 2
          );
        });

        lastWidth = width;
        lastHeight = height;
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      const handlePointerLeave = () => {
        pointerTarget.x = 0;
        pointerTarget.y = 0;
      };
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", handlePointerLeave);
      cleanupPointer = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        document.documentElement.removeEventListener(
          "pointerleave",
          handlePointerLeave
        );
      };

      observer = new ResizeObserver(layout);
      observer.observe(host);
      layout();

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.05);
        elapsed += dt;

        if (app.screen.width !== lastWidth || app.screen.height !== lastHeight) {
          layout();
        }

        pointerCurrent.x = damp(
          pointerCurrent.x,
          reducedMotion ? 0 : pointerTarget.x,
          4.8,
          dt
        );
        pointerCurrent.y = damp(
          pointerCurrent.y,
          reducedMotion ? 0 : pointerTarget.y,
          4.8,
          dt
        );

        const currentChoice = choiceRef.current;
        const desired = {
          idle: currentChoice === null ? 1 : 0,
          chat: currentChoice === "chat" ? 1 : 0,
          marketplace: currentChoice === "marketplace" ? 1 : 0,
        };

        alphaCurrent.idle = damp(alphaCurrent.idle, desired.idle, 8.5, dt);
        alphaCurrent.chat = damp(alphaCurrent.chat, desired.chat, 8.5, dt);
        alphaCurrent.marketplace = damp(
          alphaCurrent.marketplace,
          desired.marketplace,
          8.5,
          dt
        );
        idle.alpha = alphaCurrent.idle;
        chat.alpha = alphaCurrent.chat;
        marketplace.alpha = alphaCurrent.marketplace;

        const breathe = reducedMotion ? 0 : Math.sin(elapsed * 1.7) * 0.0027;
        const transitionZoom = transitionRef.current ? 0.045 : 0;
        sceneLayer.scale.set(1 + breathe + transitionZoom);
        sceneLayer.position.set(
          reducedMotion ? 0 : pointerCurrent.x * -7,
          (reducedMotion ? 0 : pointerCurrent.y * -3.5) +
            (reducedMotion ? 0 : Math.sin(elapsed * 1.7) * -1.3)
        );

        const selectedGlow = 0.3 + Math.sin(elapsed * 4.2) * 0.12;
        glowLeft.alpha = damp(
          glowLeft.alpha,
          currentChoice === "chat" ? selectedGlow : 0,
          10,
          dt
        );
        glowRight.alpha = damp(
          glowRight.alpha,
          currentChoice === "marketplace" ? selectedGlow : 0,
          10,
          dt
        );

        stars.forEach((star, index) => {
          const y = star.graphic.y - star.speed * dt;
          star.graphic.y = y < -app.screen.height / 2 - 12
            ? app.screen.height / 2 + 12
            : y;
          star.graphic.x += Math.sin(elapsed * 0.8 + star.phase) * star.drift * dt;
          star.graphic.alpha =
            0.18 + Math.sin(elapsed * (1.2 + (index % 4) * 0.2) + star.phase) * 0.12;
        });
      });
    };

    void setup().catch((error) => {
      console.error("ComePlayers Pixi lobby failed to initialize:", error);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanupPointer();
      try {
        app.destroy(true);
      } catch {
        // The app may have been cancelled before initialization completed.
      }
    };
  }, []);

  return <div ref={hostRef} className={styles.canvasHost} aria-hidden="true" />;
}
