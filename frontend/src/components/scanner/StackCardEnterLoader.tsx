import styled from "styled-components";
import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";
import { ACCESS_MOTION_LOOP_SEC } from "@/components/scanner/accessMotionConfig";
import {
    type AccessMotionDisplaySize,
    ACCESS_MOTION_LOADER_BOX_EM,
    centerDisplayVh,
    STACK_CARD_NATIVE_HEIGHT_EM,
    STACK_CORNER_SIZE_BOOST,
    accessMotionEmScale,
    stackCenterFontSize,
} from "@/components/scanner/accessMotionLoaderScale";
import {
    STACK_CARD_BG_1,
    STACK_CARD_BG_2,
    STACK_CARD_BG_3,
    STACK_CARD_BG_4,
    STACK_CARD_BG_5,
} from "@/components/scanner/stackCardEnterAssets";

type Props = {
    density?: RoomActionDensity;
    displaySize?: AccessMotionDisplaySize;
    cornerBoxPx?: number;
    speedFactor?: number;
};

export function StackCardEnterLoader({
    density = "normal",
    displaySize = "corner",
    cornerBoxPx,
    speedFactor = 1,
}: Props) {
    const stackDur = ACCESS_MOTION_LOOP_SEC / Math.max(0.12, speedFactor);
    return (
        <StyledWrapper
            $density={density}
            $displaySize={displaySize}
            $cornerBoxPx={cornerBoxPx}
            $stackDur={stackDur}
            aria-hidden
            role="presentation"
        >
            <div className="stack">
                <div className="stack__card" />
                <div className="stack__card" />
                <div className="stack__card" />
                <div className="stack__card" />
                <div className="stack__card" />
            </div>
        </StyledWrapper>
    );
}

const StyledWrapper = styled.div<{
    $density: RoomActionDensity;
    $displaySize: AccessMotionDisplaySize;
    $cornerBoxPx?: number;
    $stackDur: number;
}>`
    pointer-events: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: ${(p) => (p.$displaySize === "corner" ? "visible" : "hidden")};

    ${(p) =>
        p.$displaySize === "center"
            ? `
        width: calc(${centerDisplayVh()}vh * 14 / ${STACK_CARD_NATIVE_HEIGHT_EM});
        height: ${centerDisplayVh()}vh;
        min-height: ${centerDisplayVh()}vh;
        font-size: ${stackCenterFontSize()};
    `
            : p.$cornerBoxPx
              ? `
        width: ${(p.$cornerBoxPx * STACK_CORNER_SIZE_BOOST * 14) / STACK_CARD_NATIVE_HEIGHT_EM}px;
        height: ${p.$cornerBoxPx * STACK_CORNER_SIZE_BOOST}px;
        font-size: ${(p.$cornerBoxPx * STACK_CORNER_SIZE_BOOST) / STACK_CARD_NATIVE_HEIGHT_EM}px;
    `
              : `
        width: ${ACCESS_MOTION_LOADER_BOX_EM}em;
        height: ${ACCESS_MOTION_LOADER_BOX_EM}em;
        font-size: ${accessMotionEmScale(p.$density)};
    `}

    .stack {
        --stack-dur: ${(p) => p.$stackDur}s;
        --stack-delay: 0.05;
        --stack-spacing: 10%;
        --hue: 30;
        overflow: hidden;
        position: relative;
        width: 14em;
        height: ${STACK_CARD_NATIVE_HEIGHT_EM}em;
        transform: ${(p) =>
            p.$displaySize === "corner" && !p.$cornerBoxPx
                ? `scale(${ACCESS_MOTION_LOADER_BOX_EM / STACK_CARD_NATIVE_HEIGHT_EM})`
                : "none"};
        transform-origin: center center;
    }

    .stack__card {
        aspect-ratio: 1;
        position: absolute;
        inset: 0;
        top: var(--stack-spacing);
        margin: auto;
        width: 50%;
        transform: rotateX(45deg) rotateZ(-45deg);
        transform-style: preserve-3d;
    }

    .stack__card::before {
        animation: stack-card-flip var(--stack-dur) infinite;
        background-image: url("${STACK_CARD_BG_1}");
        background-position: center;
        background-repeat: no-repeat;
        background-size: 95% 95%;
        border-radius: 7.5%;
        box-shadow: -0.5em 0.5em 1.5em hsl(var(--hue), 90%, 15%, 0.1);
        content: "";
        display: block;
        position: absolute;
        inset: 0;
    }

    .stack__card:nth-child(2) {
        top: 0;
    }
    .stack__card:nth-child(2)::before {
        animation-delay: calc(var(--stack-dur) * (-1 + var(--stack-delay)));
        background-color: transparent;
        background-image: url("${STACK_CARD_BG_2}");
    }

    .stack__card:nth-child(3) {
        top: calc(var(--stack-spacing) * -1);
    }
    .stack__card:nth-child(3)::before {
        animation-delay: calc(var(--stack-dur) * (-1 + var(--stack-delay) * 2));
        background-color: transparent;
        background-image: url("${STACK_CARD_BG_3}");
    }

    .stack__card:nth-child(4) {
        top: calc(var(--stack-spacing) * -2);
    }
    .stack__card:nth-child(4)::before {
        animation-delay: calc(var(--stack-dur) * (-1 + var(--stack-delay) * 3));
        background-color: transparent;
        background-image: url("${STACK_CARD_BG_4}");
    }

    .stack__card:nth-child(5) {
        top: calc(var(--stack-spacing) * -3);
    }
    .stack__card:nth-child(5)::before {
        animation-delay: calc(var(--stack-dur) * (-1 + var(--stack-delay) * 4));
        background-color: transparent;
        background-image: url("${STACK_CARD_BG_5}");
    }

    @keyframes stack-card-flip {
        0%,
        100% {
            animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
            transform: translateZ(0);
        }
        11% {
            animation-timing-function: cubic-bezier(0.32, 0, 0.67, 0);
            opacity: 1;
            transform: translateZ(0.125em);
        }
        34% {
            animation-timing-function: steps(1);
            opacity: 0;
            transform: translateZ(-12em);
        }
        48% {
            animation-timing-function: linear;
            opacity: 0;
            transform: translateZ(12em);
        }
        57% {
            animation-timing-function: cubic-bezier(0.33, 1, 0.68, 1);
            opacity: 1;
            transform: translateZ(0);
        }
        61% {
            animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
            transform: translateZ(-1.8em);
        }
        74% {
            animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
            transform: translateZ(0.6em);
        }
        87% {
            animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
            transform: translateZ(-0.2em);
        }
    }
`;
