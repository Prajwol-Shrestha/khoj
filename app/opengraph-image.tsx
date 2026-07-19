import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#080c0d",
          backgroundImage:
            "radial-gradient(circle at 25% 15%, rgba(61,220,132,0.18), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "monospace",
            fontSize: 25,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#8fa3a0",
          }}
        >
          document retrieval engine
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontFamily: "monospace",
            fontSize: 120,
            fontWeight: 700,
            color: "#e6f0ee",
          }}
        >
          khoj<span style={{ color: "#3ddc84" }}>_</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            maxWidth: 780,
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: 26,
            lineHeight: 1.5,
            color: "#8fa3a0",
          }}
        >
          Upload a PDF, ask questions, get answers cited from the exact
          passages that support them.
        </div>
      </div>
    ),
    size,
  );
}
