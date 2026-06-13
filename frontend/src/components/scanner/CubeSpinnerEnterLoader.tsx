import styled from "styled-components";
import type { RoomActionDensity } from "@/components/scanner/roomActionDensity";
import { ACCESS_MOTION_LOOP_SEC } from "@/components/scanner/accessMotionConfig";
import {
    type AccessMotionDisplaySize,
    ACCESS_MOTION_LOADER_BOX_EM,
    CUBE_VISUAL_SCALE,
    centerDisplayVh,
    accessMotionEmScale,
} from "@/components/scanner/accessMotionLoaderScale";

type Props = {
    density?: RoomActionDensity;
    displaySize?: AccessMotionDisplaySize;
    cornerBoxPx?: number;
    speedFactor?: number;
};

export function CubeSpinnerEnterLoader({
    density = "normal",
    displaySize = "corner",
    cornerBoxPx,
    speedFactor = 1,
}: Props) {
    const dur = ACCESS_MOTION_LOOP_SEC / Math.max(0.12, speedFactor);
    return (
        <StyledWrapper
            $density={density}
            $displaySize={displaySize}
            $cornerBoxPx={cornerBoxPx}
            $dur={dur}
            aria-hidden
            role="presentation"
        >
            <div className="spinner">
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
            </div>
        </StyledWrapper>
    );
}

const StyledWrapper = styled.div<{
    $density: RoomActionDensity;
    $displaySize: AccessMotionDisplaySize;
    $cornerBoxPx?: number;
    $dur: number;
}>`
    pointer-events: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 900px;

    ${(p) => {
        const centerVh = centerDisplayVh() * CUBE_VISUAL_SCALE;
        if (p.$displaySize === "center") {
            return `
        width: ${centerVh}vh;
        height: ${centerVh}vh;
        min-width: ${centerVh}vh;
        min-height: ${centerVh}vh;
        font-size: calc(${centerVh}vh / ${ACCESS_MOTION_LOADER_BOX_EM});
    `;
        }
        if (p.$cornerBoxPx) {
            const box = p.$cornerBoxPx * CUBE_VISUAL_SCALE;
            return `
        width: ${box}px;
        height: ${box}px;
        font-size: ${box / ACCESS_MOTION_LOADER_BOX_EM}px;
    `;
        }
        const em = ACCESS_MOTION_LOADER_BOX_EM * CUBE_VISUAL_SCALE;
        return `
        width: ${em}em;
        height: ${em}em;
        font-size: ${accessMotionEmScale(p.$density)};
    `;
    }}

    .spinner {
        width: ${ACCESS_MOTION_LOADER_BOX_EM}em;
        height: ${ACCESS_MOTION_LOADER_BOX_EM}em;
        --clr: var(--app-color-accent, #f7c59f);
        --clr-alpha: color-mix(in srgb, var(--app-color-accent, #f7c59f) 18%, transparent);
        animation: access-cube-spin ${(p) => p.$dur}s infinite linear;
        transform-style: preserve-3d;
        will-change: transform;
        transform: translateZ(0);
    }

    .spinner > div {
        background-color: var(--clr-alpha);
        height: 100%;
        position: absolute;
        width: 100%;
        border: 0.22em solid var(--clr);
        backface-visibility: hidden;
    }

    .spinner div:nth-of-type(1) {
        transform: translateZ(-6em) rotateY(180deg);
    }

    .spinner div:nth-of-type(2) {
        transform: rotateY(-270deg) translateX(50%);
        transform-origin: top right;
    }

    .spinner div:nth-of-type(3) {
        transform: rotateY(270deg) translateX(-50%);
        transform-origin: center left;
    }

    .spinner div:nth-of-type(4) {
        transform: rotateX(90deg) translateY(-50%);
        transform-origin: top center;
    }

    .spinner div:nth-of-type(5) {
        transform: rotateX(-90deg) translateY(50%);
        transform-origin: bottom center;
    }

    .spinner div:nth-of-type(6) {
        transform: translateZ(6em);
    }

    @keyframes access-cube-spin {
        0% {
            transform: rotate(45deg) rotateX(-25deg) rotateY(25deg);
        }
        50% {
            transform: rotate(45deg) rotateX(-385deg) rotateY(25deg);
        }
        100% {
            transform: rotate(45deg) rotateX(-385deg) rotateY(385deg);
        }
    }
`;
