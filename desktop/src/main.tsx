import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './theme/globals.css'
import './theme/yaoyao-layout.css'

const root = document.getElementById('root')
if (!root) throw new Error('桌面应用根节点缺失')
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)
