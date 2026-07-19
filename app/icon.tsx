import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080c0d",
          border: "1px solid #3ddc8433",
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 20,
            fontWeight: 700,
            color: "#3ddc84",
          }}
        >
          k_
        </span>
      </div>
    ),
    size,
  );
}
