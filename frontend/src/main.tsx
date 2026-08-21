import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initModalScrollGuard } from '@/lib/modalScrollGuard'
import { applyRichTextImageCssVarsToRoot } from '@/config/richTextImage'
import { stripOAuthCallbackQueryEarly } from '@/features/auth/iamOAuth'

// IAM 回调 ?code=&state= 在首屏渲染前截断，避免授权码原文留在地址栏/历史
stripOAuthCallbackQueryEarly()

initModalScrollGuard()
applyRichTextImageCssVarsToRoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
