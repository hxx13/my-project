import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initModalScrollGuard } from '@/lib/modalScrollGuard'
import { applyRichTextImageCssVarsToRoot } from '@/config/richTextImage'

initModalScrollGuard()
applyRichTextImageCssVarsToRoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
