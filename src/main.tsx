import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeAuthentication } from './auth'
import './style.css'

void initializeAuthentication().finally(() => {
  createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)
})
