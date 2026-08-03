import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { startAppCheck } from './appcheck'
import './index.css'

// Before render, so the first callable a page makes already carries a token.
// Starting this inside a component would race the initial getResults/joinTrip.
startAppCheck()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
