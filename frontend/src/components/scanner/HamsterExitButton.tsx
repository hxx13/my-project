import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import styled from "styled-components";
import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";

export interface HamsterExitButtonHandle {
    /** 程序化触发离开（视觉区域不可点击，供后续其它按钮或自动流程调用） */
    triggerExit: () => void;
}

interface HamsterExitButtonProps {
    roomName: string;
    onClick: () => void;
    isWorking: boolean;
    isSuccess: boolean;
    isFinished: boolean;
    /** 通行动效播放时隐藏，避免与中心 overlay 重复 */
    hidden?: boolean;
    /** @deprecated 保留 API 兼容，已不再用于切换动效变体 */
    variantSeed?: string;
    density?: RoomActionDensity;
}

export const HamsterExitButton = forwardRef<HamsterExitButtonHandle, HamsterExitButtonProps>(
    function HamsterExitButton(
        { roomName, onClick, isWorking, isSuccess, density = "normal", hidden = false },
        ref
    ) {
        const wheelRef = useRef<HTMLDivElement>(null);
        const onClickRef = useRef(onClick);
        onClickRef.current = onClick;

        useImperativeHandle(ref, () => ({
            triggerExit: () => onClickRef.current(),
        }));

        const physics = useRef({ dur: 2.2, tilt: 0 });

        useEffect(() => {
            let animationFrameId: number;

            const updatePhysics = () => {
                let targetDur = 2.2;
                let targetTilt = 0;
                let durFriction = 0.04;
                let tiltFriction = 0.08;

                if (isSuccess) {
                    targetDur = 20.0;
                    targetTilt = 0;
                    durFriction = 0.01;
                    tiltFriction = 0.02;
                } else if (isWorking) {
                    targetDur = 0.35;
                    targetTilt = 0;
                    durFriction = 0.06;
                    tiltFriction = 0.06;
                }

                physics.current.dur += (targetDur - physics.current.dur) * durFriction;
                physics.current.tilt += (targetTilt - physics.current.tilt) * tiltFriction;

                if (wheelRef.current) {
                    wheelRef.current.style.setProperty("--dur", `${physics.current.dur}s`);
                    wheelRef.current.style.setProperty("--tilt", `${physics.current.tilt}deg`);
                }
                animationFrameId = requestAnimationFrame(updatePhysics);
            };

            updatePhysics();
            return () => cancelAnimationFrame(animationFrameId);
        }, [isWorking, isSuccess]);

        return (
            <StyledWrapper
                $density={density}
                $hidden={hidden}
                title={roomName ? `离开：${roomName}` : undefined}
                aria-label={roomName ? `离开：${roomName}` : "离开动效"}
                role="img"
                aria-hidden={hidden}
            >
                <div ref={wheelRef} className="wheel-and-hamster mx-auto">
                    <div className="wheel" />
                    <div className="hamster">
                        <div className="hamster__body">
                            <div className="hamster__head">
                                <div className="hamster__ear" />
                                <div className="hamster__eye" />
                                <div className="hamster__nose" />
                            </div>
                            <div className="hamster__limb hamster__limb--fr" />
                            <div className="hamster__limb hamster__limb--fl" />
                            <div className="hamster__limb hamster__limb--br" />
                            <div className="hamster__limb hamster__limb--bl" />
                            <div className="hamster__tail" />
                        </div>
                    </div>
                    <div className="spoke" />
                </div>
            </StyledWrapper>
        );
    }
);

const StyledWrapper = styled.div<{ $density: RoomActionDensity; $hidden: boolean }>`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: ${(p) => (p.$density === "dense" ? "4px" : p.$density === "compact" ? "6px" : "10px")};
    pointer-events: none;
    user-select: none;
    visibility: ${(p) => (p.$hidden ? "hidden" : "visible")};

    .wheel-and-hamster {
        --dur: 0.35s;
        --tilt: 0deg;
        position: relative;
        width: 12em;
        height: 12em;
        font-size: ${(p) => (p.$density === "dense" ? "12px" : p.$density === "compact" ? "14px" : "16px")};
        transition: all 0.5s ease;
        overflow: hidden;
    }

    .wheel,
    .hamster,
    .hamster div,
    .spoke {
        position: absolute;
    }

    .wheel,
    .spoke {
        border-radius: 50%;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }

    .wheel {
        background: radial-gradient(100% 100% at center, hsla(0, 0%, 60%, 0) 47.8%, hsl(0, 0%, 60%) 48%);
        z-index: 2;
    }

    .hamster {
        animation: hamster var(--dur) ease-in-out infinite;
        top: 50%;
        left: calc(50% - 3.5em);
        width: 7em;
        height: 3.75em;
        transform: rotate(4deg) translate(-0.8em, 1.85em);
        transform-origin: 50% 0;
        z-index: 1;
    }

    .hamster__head {
        animation: hamsterHead var(--dur) ease-in-out infinite;
        background: hsl(30, 90%, 55%);
        border-radius: 70% 30% 0 100% / 40% 25% 25% 60%;
        box-shadow: 0 -0.25em 0 hsl(30, 90%, 80%) inset, 0.75em -1.55em 0 hsl(30, 90%, 90%) inset;
        top: 0;
        left: -2em;
        width: 2.75em;
        height: 2.5em;
        transform-origin: 100% 50%;
    }

    .hamster__ear {
        animation: hamsterEar var(--dur) ease-in-out infinite;
        background: hsl(0, 90%, 85%);
        border-radius: 50%;
        box-shadow: -0.25em 0 hsl(30, 90%, 55%) inset;
        top: -0.25em;
        right: -0.25em;
        width: 0.75em;
        height: 0.75em;
        transform-origin: 50% 75%;
    }

    .hamster__eye {
        animation: hamsterEye var(--dur) linear infinite;
        background-color: hsl(0, 0%, 0%);
        border-radius: 50%;
        top: 0.375em;
        left: 1.25em;
        width: 0.5em;
        height: 0.5em;
    }

    .hamster__nose {
        background: hsl(0, 90%, 75%);
        border-radius: 35% 65% 85% 15% / 70% 50% 50% 30%;
        top: 0.75em;
        left: 0;
        width: 0.2em;
        height: 0.25em;
    }

    .hamster__body {
        animation: hamsterBody var(--dur) ease-in-out infinite;
        background: hsl(30, 90%, 90%);
        border-radius: 50% 30% 50% 30% / 15% 60% 40% 40%;
        box-shadow: 0.1em 0.75em 0 hsl(30, 90%, 55%) inset, 0.15em -0.5em 0 hsl(30, 90%, 80%) inset;
        top: 0.25em;
        left: 2em;
        width: 4.5em;
        height: 3em;
        transform-origin: 17% 50%;
        transform-style: preserve-3d;
    }

    .hamster__limb--fr,
    .hamster__limb--fl {
        clip-path: polygon(0 0, 100% 0, 70% 80%, 60% 100%, 0% 100%, 40% 80%);
        top: 2em;
        left: 0.5em;
        width: 1em;
        height: 1.5em;
        transform-origin: 50% 0;
    }

    .hamster__limb--fr {
        animation: hamsterFRLimb var(--dur) linear infinite;
        background: linear-gradient(hsl(30, 90%, 80%) 80%, hsl(0, 90%, 75%) 80%);
        transform: rotate(15deg) translateZ(-1px);
    }

    .hamster__limb--fl {
        animation: hamsterFLLimb var(--dur) linear infinite;
        background: linear-gradient(hsl(30, 90%, 90%) 80%, hsl(0, 90%, 85%) 80%);
        transform: rotate(15deg);
    }

    .hamster__limb--br,
    .hamster__limb--bl {
        border-radius: 0.75em 0.75em 0 0;
        clip-path: polygon(0 0, 100% 0, 100% 30%, 70% 90%, 70% 100%, 30% 100%, 40% 90%, 0% 30%);
        top: 1em;
        left: 2.8em;
        width: 1.5em;
        height: 2.5em;
        transform-origin: 50% 30%;
    }

    .hamster__limb--br {
        animation: hamsterBRLimb var(--dur) linear infinite;
        background: linear-gradient(hsl(30, 90%, 80%) 90%, hsl(0, 90%, 75%) 90%);
        transform: rotate(-25deg) translateZ(-1px);
    }

    .hamster__limb--bl {
        animation: hamsterBLLimb var(--dur) linear infinite;
        background: linear-gradient(hsl(30, 90%, 90%) 90%, hsl(0, 90%, 85%) 90%);
        transform: rotate(-25deg);
    }

    .hamster__tail {
        animation: hamsterTail var(--dur) linear infinite;
        background: hsl(0, 90%, 85%);
        border-radius: 0.25em 50% 50% 0.25em;
        box-shadow: 0 -0.2em 0 hsl(0, 90%, 75%) inset;
        top: 1.5em;
        right: -0.5em;
        width: 1em;
        height: 0.5em;
        transform: rotate(30deg) translateZ(-1px);
        transform-origin: 0.25em 0.25em;
    }

    .spoke {
        animation: spoke var(--dur) linear infinite;
        background: radial-gradient(100% 100% at center, hsl(0, 0%, 60%) 4.8%, hsla(0, 0%, 60%, 0) 5%),
            linear-gradient(hsla(0, 0%, 55%, 0) 46.9%, hsl(0, 0%, 65%) 47% 52.9%, hsla(0, 0%, 65%, 0) 53%) 50% 50% /
                99% 99% no-repeat;
    }

    @keyframes hamster {
        from,
        to {
            transform: rotate(calc(4deg + var(--tilt))) translate(-0.8em, 1.85em);
        }
        50% {
            transform: rotate(calc(0deg + var(--tilt))) translate(-0.8em, 1.85em);
        }
    }
    @keyframes hamsterHead {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(0);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(8deg);
        }
    }
    @keyframes hamsterEye {
        from,
        90%,
        to {
            transform: scaleY(1);
        }
        95% {
            transform: scaleY(0);
        }
    }
    @keyframes hamsterEar {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(0);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(12deg);
        }
    }
    @keyframes hamsterBody {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(0);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(-2deg);
        }
    }
    @keyframes hamsterFRLimb {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(50deg) translateZ(-1px);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(-30deg) translateZ(-1px);
        }
    }
    @keyframes hamsterFLLimb {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(-30deg);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(50deg);
        }
    }
    @keyframes hamsterBRLimb {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(-60deg) translateZ(-1px);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(20deg) translateZ(-1px);
        }
    }
    @keyframes hamsterBLLimb {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(20deg);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(-60deg);
        }
    }
    @keyframes hamsterTail {
        from,
        25%,
        50%,
        75%,
        to {
            transform: rotate(30deg) translateZ(-1px);
        }
        12.5%,
        37.5%,
        62.5%,
        87.5% {
            transform: rotate(10deg) translateZ(-1px);
        }
    }
    @keyframes spoke {
        from {
            transform: rotate(0);
        }
        to {
            transform: rotate(-1turn);
        }
    }
`;

HamsterExitButton.displayName = "HamsterExitButton";
