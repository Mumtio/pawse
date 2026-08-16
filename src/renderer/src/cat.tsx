import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/cat.css'
import { CatWindow } from './cat/CatWindow'

createRoot(document.getElementById('cat-root') as HTMLElement).render(
  <StrictMode>
    <CatWindow />
  </StrictMode>
)
