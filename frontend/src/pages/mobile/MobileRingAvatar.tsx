/** 手机版 — 渐变环头像 */
import { useState } from "react";

interface RingAvatarProps {
  src?: string;
  name: string;
  size?: number;
}

export default function RingAvatar({
  src,
  name,
  size = 54,
}: RingAvatarProps) {
  const [err, setErr] = useState(false);
  const ini = (name || "?").slice(0, 2);
  const r = size + 6;
  const inner = size;

  if (src && !err)
    return (
      <div
        style={{
          width: r,
          height: r,
          borderRadius: "50%",
          padding: 2.5,
          background: "linear-gradient(135deg, #6366f1, #2dd4bf)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={src}
          alt={name}
          style={{
            width: inner,
            height: inner,
            borderRadius: "50%",
            objectFit: "cover",
          }}
          onError={() => setErr(true)}
        />
      </div>
    );

  return (
    <div
      style={{
        width: r,
        height: r,
        borderRadius: "50%",
        padding: 2.5,
        background: "linear-gradient(135deg, #6366f1, #2dd4bf)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #ede9fe, #ddd6fe)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7c3aed",
          fontWeight: 700,
          fontSize: inner * 0.34,
        }}
      >
        {ini}
      </div>
    </div>
  );
}
