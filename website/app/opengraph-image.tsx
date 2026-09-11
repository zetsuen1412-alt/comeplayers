import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "ComePlayers — Trusted gaming marketplace powered by EvoGaming";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #020617 0%, #07152c 55%, #082f49 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 64,
            padding: 70,
          }}
        >
          <div
            style={{
              width: 300,
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 48,
              background: "#020617",
              border: "2px solid rgba(34, 211, 238, 0.3)",
              boxShadow: "0 30px 80px rgba(0, 0, 0, 0.5)",
            }}
          >
            <img
              src="https://www.comeplayers.com/brand/comeplayers-cp.png"
              alt="ComePlayers"
              width={250}
              height={250}
              style={{
                objectFit: "contain",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 650,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 78,
                fontWeight: 900,
                letterSpacing: "-3px",
              }}
            >
              ComePlayers
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 34,
                color: "#67e8f9",
                fontWeight: 700,
              }}
            >
              Trusted Gaming Marketplace
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 25,
                color: "#cbd5e1",
              }}
            >
              Powered by EvoGaming
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 42,
                fontSize: 24,
                color: "#facc15",
                fontWeight: 700,
              }}
            >
              www.comeplayers.com
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}