import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/courier-prime/700-italic.css'
import 'prosemirror-view/style/prosemirror.css'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'
import './styles/script.css'
import { App } from './App'
import { installBrowserMeasure } from './store/fonts'
import { registerServiceWorker } from './store/offline'

// Measure text in Indian scripts with the fonts the editor shows it in.
installBrowserMeasure()
// Keep the app available offline, and installable.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
