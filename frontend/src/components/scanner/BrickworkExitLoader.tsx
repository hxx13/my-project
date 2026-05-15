import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

export interface BrickworkExitLoaderProps {
    onClick: () => void;
    isWorking: boolean;
    isSuccess: boolean;
    /** 该房间离开流程已结束（与 ActionButtons 中 finishedRooms 一致） */
    isFinished: boolean;
    /** 悬停/无障碍提示 */
    roomName?: string;
    density?: RoomActionDensity;
}

function pickCenterLabel(isWorking: boolean, isSuccess: boolean, isFinished: boolean, v: number): string {
    if (isFinished && !isSuccess) return "休息ing";
    if (isSuccess) return v > 0.45 ? "搬砖ing" : "休息ing";
    if (isWorking) return "搬砖ing";
    return "休息ing";
}

/**
 * 离开房间时的备选动效：中央「搬砖ing」+ 齿轮高速旋转；
 * 成功后齿轮按指数衰减非线性减速，停稳后显示「休息ing」。
 */
export const BrickworkExitLoader: React.FC<BrickworkExitLoaderProps> = ({ onClick, isWorking, isSuccess, isFinished, roomName, density = "normal" }) => {
    const gearOneRef = useRef<HTMLDivElement>(null);
    const gearTwoRef = useRef<HTMLDivElement>(null);
    const angle1 = useRef(0);
    const angle2 = useRef(0);
    const velocity = useRef(0);
    const lastTs = useRef<number | null>(null);
    const propsRef = useRef({ isWorking, isSuccess, isFinished });
    propsRef.current = { isWorking, isSuccess, isFinished };
    const labelRef = useRef("搬砖ing");
    const [centerText, setCenterText] = useState("搬砖ing");

    useEffect(() => {
        let raf = 0;
        const FAST_DPS = 520;
        const IDLE_DPS = 38;
        const DECAY_PER_SEC = 2.85;

        const tick = (ts: number) => {
            if (lastTs.current === null) lastTs.current = ts;
            const dt = Math.min(0.045, (ts - lastTs.current) / 1000);
            lastTs.current = ts;

            const { isWorking: w, isSuccess: s, isFinished: f } = propsRef.current;
            let v = velocity.current;

            if (s) {
                v *= Math.exp(-DECAY_PER_SEC * dt);
                if (v < 6) v = 0;
            } else if (w) {
                const target = FAST_DPS;
                v += (target - v) * Math.min(1, 10 * dt);
            } else {
                const target = f ? 0 : IDLE_DPS;
                v += (target - v) * Math.min(1, 4 * dt);
            }

            velocity.current = v;
            angle1.current += v * dt;
            angle2.current -= v * 0.88 * dt;

            const g1 = gearOneRef.current;
            const g2 = gearTwoRef.current;
            if (g1) g1.style.transform = `rotate(${angle1.current}deg)`;
            if (g2) g2.style.transform = `rotate(${angle2.current}deg) scale(0.8)`;

            const nextLabel = pickCenterLabel(w, s, f, v);
            if (nextLabel !== labelRef.current) {
                labelRef.current = nextLabel;
                setCenterText(nextLabel);
            }

            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            lastTs.current = null;
        };
    }, [isWorking, isSuccess, isFinished]);

    return (
        <Outer
            $density={density}
            onClick={onClick}
            role="button"
            tabIndex={0}
            title={roomName ? `离开：${roomName}` : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
        >
            <ScaleHost $density={density}>
            <div className="steampunk-brutalist-loader">
                <div className="loader-container">
                    <div className="comic-panel">
                        <div className="gear-container one" ref={gearOneRef}>
                            <div className="gear" />
                            <div className="gear-tooth" />
                            <div className="gear-tooth" />
                            <div className="gear-tooth" />
                        </div>
                        <div className="gear-container two" ref={gearTwoRef}>
                            <div className="gear" />
                            <div className="gear-tooth" />
                            <div className="gear-tooth" />
                            <div className="gear-tooth" />
                        </div>
                        <div className="pressure-gauge">
                            <div className="gauge-needle" />
                        </div>
                        <div className="steam-pipe">
                            <div className="steam-puff" />
                            <div className="steam-puff" />
                        </div>
                        <div className={`engine${centerText === "休息ing" ? " engine--rest" : ""}`}>
                            <div className="engine-body">
                                <div className="engine-rivet tl" />
                                <div className="engine-rivet tr" />
                                <div className="engine-rivet bl" />
                                <div className="engine-rivet br" />
                                <div className="loading-plate">
                                    <span className="loading-text">{centerText}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </ScaleHost>
        </Outer>
    );
};

const emScale = (d: RoomActionDensity) => (d === "dense" ? "9px" : d === "compact" ? "10.5px" : "12px");

const scaleFor = (d: RoomActionDensity) => (d === "dense" ? 0.52 : d === "compact" ? 0.58 : 0.64);

const Outer = styled.div<{ $density: RoomActionDensity }>`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: ${(p) => (p.$density === "dense" ? "2px" : p.$density === "compact" ? "4px" : "8px")};
    cursor: pointer;
`;

const ScaleHost = styled.div<{ $density: RoomActionDensity }>`
    width: 100%;
    height: ${(p) => (p.$density === "dense" ? "9.5rem" : p.$density === "compact" ? "10.5rem" : "11.5rem")};
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    .steampunk-brutalist-loader {
        --primary-color: #8b4513;
        --secondary-color: #b87333;
        --bg-color: #f5deb3;
        --text-color: #2f1e0e;
        --border-width: 0.25em;

        transform: scale(${(p) => scaleFor(p.$density)});
        transform-origin: center center;
        font-size: ${(p) => emScale(p.$density)};
        width: 22em;
        height: 22em;
        position: relative;
        font-family: "Courier New", Courier, monospace;
        margin: 0 auto;
    }

    .loader-container {
        width: 100%;
        height: 100%;
        position: relative;
        transform: rotate(-2deg);
    }

    .comic-panel {
        width: 100%;
        height: 100%;
        background-color: var(--bg-color);
        border: var(--border-width) solid black;
        box-shadow: 0.5em 0.5em 0 black;
        position: relative;
        overflow: hidden;
        background-image: radial-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px);
        background-size: 10px 10px;
    }

    .engine {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        animation: machine-rumble 0.5s infinite alternate;
    }
    .engine.engine--rest {
        animation-play-state: paused;
    }

    .engine-body {
        width: 10em;
        height: 8em;
        background: var(--primary-color);
        border: var(--border-width) solid black;
        border-radius: 1em;
        position: relative;
    }

    .engine-rivet {
        position: absolute;
        width: 0.5em;
        height: 0.5em;
        background: #5c2e0e;
        border-radius: 50%;
    }
    .engine-rivet.tl {
        top: 0.5em;
        left: 0.5em;
    }
    .engine-rivet.tr {
        top: 0.5em;
        right: 0.5em;
    }
    .engine-rivet.bl {
        bottom: 0.5em;
        left: 0.5em;
    }
    .engine-rivet.br {
        bottom: 0.5em;
        right: 0.5em;
    }

    .loading-plate {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--secondary-color);
        border: var(--border-width) solid black;
        padding: 0.35em 0.9em;
        z-index: 3;
        max-width: 9em;
    }

    .loading-text {
        font-size: 1.15em;
        font-weight: bold;
        color: var(--text-color);
        letter-spacing: 0.06em;
        white-space: nowrap;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .gear-container {
        position: absolute;
        width: 5em;
        height: 5em;
        z-index: 1;
        will-change: transform;
    }
    .gear {
        position: absolute;
        width: 100%;
        height: 100%;
        background: #7a7a7a;
        border: var(--border-width) solid black;
        border-radius: 50%;
    }
    .gear-tooth {
        position: absolute;
        width: 1.5em;
        height: 6em;
        background: #7a7a7a;
        border-top: var(--border-width) solid black;
        border-bottom: var(--border-width) solid black;
        top: -0.5em;
        left: 1.75em;
    }
    .gear-tooth:nth-child(2) {
        transform: rotate(60deg);
    }
    .gear-tooth:nth-child(3) {
        transform: rotate(120deg);
    }

    .gear-container.one {
        top: 2em;
        left: 2em;
    }
    .gear-container.two {
        bottom: 2em;
        right: 2em;
    }

    .pressure-gauge {
        position: absolute;
        top: 1.5em;
        right: 1.5em;
        width: 6em;
        height: 3em;
        border: var(--border-width) solid black;
        border-bottom: none;
        border-radius: 6em 6em 0 0;
        background: #fff;
        z-index: 3;
    }
    .gauge-needle {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 0.2em;
        height: 2.5em;
        background: red;
        transform-origin: bottom center;
        animation: gauge-needle-swing 2s infinite ease-in-out;
    }

    .steam-pipe {
        position: absolute;
        bottom: 0;
        left: 2em;
        width: 2em;
        height: 4em;
        background: #5c2e0e;
        border: var(--border-width) solid black;
    }
    .steam-puff {
        position: absolute;
        bottom: 3.5em;
        left: 1.5em;
        width: 3em;
        height: 3em;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        opacity: 0;
        animation: puff-of-steam 3s infinite;
    }
    .steam-puff:nth-child(2) {
        animation-delay: 1.5s;
    }

    @keyframes machine-rumble {
        0% {
            transform: translate(-50%, -50%) rotate(0.5deg);
        }
        100% {
            transform: translate(-50.5%, -49.5%) rotate(-0.5deg);
        }
    }

    @keyframes gauge-needle-swing {
        0%,
        100% {
            transform: rotate(-45deg);
        }
        50% {
            transform: rotate(45deg);
        }
    }

    @keyframes puff-of-steam {
        0% {
            transform: scale(0.5) translateY(0);
            opacity: 1;
        }
        100% {
            transform: scale(1.5) translateY(-3em);
            opacity: 0;
        }
    }
`;

