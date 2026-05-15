import React, { useMemo } from 'react';
// 💥 1. 核心修复：必须单独引入 keyframes API！
import styled, { keyframes } from 'styled-components';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    blobColor?: string;
    /** 更贴边的内边距（如首页中间栏第一行双卡，1080p 下少占留白） */
    compact?: boolean;
}

export function GlassCard({ children, className = '', blobColor, compact = false }: GlassCardProps) {
    const { duration, delay } = useMemo(() => ({
        duration: Math.random() * 10 + 15, // 15s - 25s 的随机周期
        delay: Math.random() * -20         // 负延迟，让它一出来就在动
    }), []);

    return (
        <StyledWrapper $compact={compact} className={className} data-glass-card="1">
            <div className="card-frame">
                <div className="card-body">
                    {blobColor && (
                        <div
                            className="absolute z-[0] rounded-full pointer-events-none blob-orb"
                            style={{
                                background: blobColor,
                                animationDuration: `${duration}s`,
                                animationDelay: `${delay}s`
                            }}
                        />
                    )}

                    <div className="grid-overlay" />
                    <div className="sweep" />

                    <div className="content-container">
                        {children}
                    </div>
                </div>
            </div>
        </StyledWrapper>
    );
}

// 💥 2. 核心修复：使用官方 keyframes 引擎定义动画，这样它就能在 React 中被正确解析为全局 Hash 动画！
// (我稍微放大了移动幅度，让肉眼更容易察觉)
const blobRoam = keyframes`
    0% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30%, 20%) scale(1.1); }
    66% { transform: translate(-20%, 40%) scale(0.9); }
    100% { transform: translate(15%, -15%) scale(1); }
`;

const StyledWrapper = styled.div<{ $compact?: boolean }>`
    width: 100%;
    height: 100%;
    perspective: 2000px;

    .card-frame {
        position: relative;
        width: 100%;
        height: 100%;
        transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        transform-style: preserve-3d;
    }

    .card-frame:hover {
        transform: rotateY(2deg) rotateX(1deg) scale(1.01);
    }

    .card-body {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.85);
        border-radius: 24px;
        z-index: 2;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(40px) saturate(150%);
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.05);
    }

    .grid-overlay {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
        background-size: 30px 30px;
        pointer-events: none;
        z-index: 1;
    }

    .sweep {
        position: absolute;
        top: 0;
        left: -100%;
        width: 50%;
        height: 100%;
        background: linear-gradient(
                90deg,
                transparent,
                rgba(255, 255, 255, 0.9),
                transparent
        );
        transform: skewX(-25deg);
        transition: 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        z-index: 2;
    }

    .card-frame:hover .sweep {
        left: 150%;
    }

    .content-container {
        position: relative;
        z-index: 10;
        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;
        padding: ${(p) => (p.$compact ? "8px 10px" : "10px 12px")};
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .blob-orb {
        width: 250px;
        height: 250px;
        filter: blur(50px);
        opacity: 0.65;
        top: -10%;
        left: -10%;
        /* 💥 3. 核心修复：在这里引用上面定义好的 blobRoam */
        animation-name: ${blobRoam};
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        animation-direction: alternate;
    }
`;