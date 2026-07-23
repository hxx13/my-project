import { useId } from "react";
import styled from "styled-components";
import "./morphOrbLoader.css";

type MorphOrbLoaderProps = {
  /** 相对 100px 基准的缩放，默认 0.42 */
  size?: number;
  className?: string;
};

/**
 * 形态渐变 orb 加载器 — 用作首页智能助手视觉载体。
 * 动效源自用户提供的 Loader 设计，mask id 使用 useId 避免多实例冲突。
 */
export function MorphOrbLoader({ size = 0.42, className = "" }: MorphOrbLoaderProps) {
  const maskId = useId().replace(/:/g, "");

  return (
    <StyledWrapper className={className} style={{ ["--morph-orb-size" as string]: size }}>
      <div className="morph-orb-loader" aria-hidden>
        <svg width={100} height={100} viewBox="0 0 100 100">
          <defs>
            <mask id={maskId}>
              <polygon points="0,0 100,0 100,100 0,100" fill="black" />
              <polygon points="25,25 75,25 50,75" fill="white" />
              <polygon points="50,25 75,75 25,75" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
              <polygon points="35,35 65,35 50,65" fill="white" />
            </mask>
          </defs>
        </svg>
        <div className="morph-orb-loader__box" style={{ mask: `url(#${maskId})`, WebkitMask: `url(#${maskId})` }} />
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .morph-orb-loader {
    --color-one: var(--scan-assistant-orb-a, #ffbf48);
    --color-two: var(--scan-assistant-orb-b, #be4a1d);
    --color-three: var(--scan-assistant-orb-a-soft, #ffbf4780);
    --color-four: var(--scan-assistant-orb-b-soft, #bf4a1d80);
    --color-five: var(--scan-assistant-orb-a-faint, #ffbf4740);
    --time-animation: 2s;
    --size: var(--morph-orb-size, 0.42);
    position: relative;
    border-radius: 50%;
    transform: scale(var(--size));
    transform-origin: center center;
    box-shadow:
      0 0 25px 0 var(--color-three),
      0 20px 50px 0 var(--color-four);
    animation: morph-orb-colorize calc(var(--time-animation) * 3) ease-in-out infinite;
  }

  .morph-orb-loader::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border-top: solid 1px var(--color-one);
    border-bottom: solid 1px var(--color-two);
    background: linear-gradient(180deg, var(--color-five), var(--color-four));
    box-shadow:
      inset 0 10px 10px 0 var(--color-three),
      inset 0 -10px 10px 0 var(--color-four);
  }

  .morph-orb-loader__box {
    width: 100px;
    height: 100px;
    background: linear-gradient(180deg, var(--color-one) 30%, var(--color-two) 70%);
  }

  .morph-orb-loader svg {
    position: absolute;
  }

  .morph-orb-loader svg mask {
    filter: contrast(15);
    animation: morph-orb-roundness calc(var(--time-animation) / 2) linear infinite;
  }

  .morph-orb-loader svg mask polygon {
    filter: blur(7px);
  }

  .morph-orb-loader svg mask polygon:nth-child(1) {
    transform-origin: 75% 25%;
    transform: rotate(90deg);
  }

  .morph-orb-loader svg mask polygon:nth-child(2) {
    transform-origin: 50% 50%;
    animation: morph-orb-rotation var(--time-animation) linear infinite reverse;
  }

  .morph-orb-loader svg mask polygon:nth-child(3) {
    transform-origin: 50% 60%;
    animation: morph-orb-rotation var(--time-animation) linear infinite;
    animation-delay: calc(var(--time-animation) / -3);
  }

  .morph-orb-loader svg mask polygon:nth-child(4) {
    transform-origin: 40% 40%;
    animation: morph-orb-rotation var(--time-animation) linear infinite reverse;
  }

  .morph-orb-loader svg mask polygon:nth-child(5) {
    transform-origin: 40% 40%;
    animation: morph-orb-rotation var(--time-animation) linear infinite reverse;
    animation-delay: calc(var(--time-animation) / -2);
  }

  .morph-orb-loader svg mask polygon:nth-child(6) {
    transform-origin: 60% 40%;
    animation: morph-orb-rotation var(--time-animation) linear infinite;
  }

  .morph-orb-loader svg mask polygon:nth-child(7) {
    transform-origin: 60% 40%;
    animation: morph-orb-rotation var(--time-animation) linear infinite;
    animation-delay: calc(var(--time-animation) / -1.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .morph-orb-loader,
    .morph-orb-loader svg mask,
    .morph-orb-loader svg mask polygon {
      animation: none !important;
    }
  }
`;
