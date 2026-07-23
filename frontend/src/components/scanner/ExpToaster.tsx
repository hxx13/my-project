import React from 'react';
import styled from 'styled-components';

interface ExpToasterProps {
    expAdded: number;
    play: boolean;
}

export const ExpToaster: React.FC<ExpToasterProps> = ({ expAdded, play }) => {
    return (
        <StyledWrapper>
            <div className={`tooltip-container ${play ? 'auto-play' : ''}`}>
                <span className="tooltip font-black tracking-widest text-xl">
                    EXP +{expAdded}
                </span>
                <span className="toasterGroup">
                    <svg className="toaster" width="100%" height="100%" viewBox="0 0 88 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width={88} height={50} />
                        <path className="block" d="M13.9561 1.74707H67.7607C73.9513 1.74707 78.9695 6.76558 78.9697 12.9561V48.0791H2.74707V12.9561C2.74733 6.76574 7.76574 1.74732 13.9561 1.74707Z" fill="#505050" stroke="#C0BABA" strokeWidth={1.49457} />
                        <rect x={2.5} y={43.3478} width={76.7174} height={4.97826} fill="#A6A4A4" stroke="#C0BABA" />
                        <path className="lever" d="M84.2008 13.3305C84.8197 13.3305 85.3217 13.8318 85.3219 14.4507V17.4399C85.3219 18.059 84.8199 18.561 84.2008 18.561H80.0914V13.3305H84.2008Z" fill="#A6A4A4" stroke="#C0BABA" strokeWidth={0.747283} />
                        <path d="M8.22558 18.9348C8.22558 18.9348 6.95407 11.7886 10.1771 8.8166C12.9835 6.22883 19.9348 7.13024 19.9348 7.13024" stroke="white" strokeOpacity={0.125} strokeWidth={1.49457} />
                        <circle className="timer" cx={67.7609} cy={24.913} r={2.98913} fill="#A6A4A4" />
                        <circle cx={67.7609} cy={24.913} r={3.36277} stroke="white" strokeOpacity={0.5} strokeWidth={0.747283} strokeLinecap="square" />
                        <circle cx={67.7609} cy={33.8804} r={2.98913} fill="#A6A4A4" />
                        <circle cx={67.7609} cy={33.8804} r={3.36277} stroke="white" strokeOpacity={0.5} strokeWidth={0.747283} strokeLinecap="square" />
                    </svg>
                </span>
            </div>
        </StyledWrapper>
    );
};

const StyledWrapper = styled.div`
    .tooltip-container {
        --fx: #d19d9d; --accent: #587676; --background: #dcd1a9; --darker: #8c782f;
        --xtip: 50%; --dist: -3.5em;
        --xdist: -55%; --deg: -5deg;
        --linear: linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1);
        --elastic-easing: linear(0, 0.01566 4.55%, 0.0625 9.091%, 0.25, 0.5625, 1, 0.8125 45.455%, 0.76566 49.995%, 0.75, 0.76566 59.096%, 0.8125 63.636%, 1 72.727%, 0.95316 77.268%, 0.9375 81.818%, 0.95309 86.359%, 1 90.909%, 0.98438 95.45%, 1);

        position: relative;
        transition: all 0.2s;
        font-size: 1em;
        pointer-events: none;
    }
    .lever { fill: var(--fx); transform: translateY(45%); transition: transform 0.3s var(--linear), fill 0.3s ease-out; }
    .timer { animation: rotate 1s ease-out infinite; outline-width: 2px; outline-color: var(--fx); outline-style: dashed; border-radius: 50%; }

    .tooltip {
        position: absolute; text-shadow: -2px 0px rgba(183, 162, 130, 0.75);
        inset-block-start: 0; inset-inline-start: var(--xtip); text-align: center;
        line-height: 1.125; transform: translateX(var(--xdist));
        border: 6px solid #645620; outline-width: 2px; outline-offset: -9px; outline-color: #64562052; outline-style: solid;
        padding: 1em 1em 2.5em; font-size: 1em; border-radius: 1em;
        opacity: 0; visibility: hidden; transition: all 0.5s var(--linear);
        background: linear-gradient(var(--background) 60%, var(--darker) 100%); z-index: -1;
    }

    .toasterGroup::after {
        content: ""; filter: blur(10px); background-color: black; border-radius: 50%;
        display: block; position: absolute; transform: translate(-10px, -10%); inset-block-end: 0;
        width: 100%; height: 10px; z-index: 0;
    }
    .toaster { transition: all 0.5s var(--elastic-easing); }
    .block { transition: all 0.125s ease-out; }

    .tooltip-container.auto-play .lever { transform: translateY(0); fill: var(--accent); }
    .tooltip-container.auto-play .block { fill: var(--fx); }
    .tooltip-container.auto-play .tooltip {
        inset-block-start: -50%; opacity: 1; visibility: visible; color: #514621;
        max-width: 25ch; overflow: hidden; white-space: nowrap;
    }
    .tooltip-container.auto-play .toasterGroup::after { animation: shadow 0.3s var(--elastic-easing) forwards; }
    .tooltip-container.auto-play .toaster { --xdist: 0%; animation: jump 2s var(--elastic-easing) forwards -0.5s; }
    .tooltip-container.auto-play .timer { animation-play-state: paused; }

    @keyframes jump {
        0%, 50% { transform: translateX(var(--xdist)) translateY(0); }
        25% { transform: translateX(var(--xdist)) translateY(var(--dist)) rotate(var(--deg)); }
    }
    @keyframes shadow {
        0%, 50% { transform: scale(1); }
        25% { transform: scale(0.75) skew(-10deg); opacity: 0.85; }
    }
    @keyframes rotate { to { outline-color: var(--accent); outline-offset: -2px; } }
`;