import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
// Fontes servidas pelo próprio app: nenhum dado do visitante vai para o Google.
import '@fontsource/alegreya/latin-500.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya/latin-800.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-800.css';
import './styles.css';
import { applyFontLevel, readFontLevel } from './lib/fontScale';

// Aplica o tamanho de letra salvo antes do primeiro desenho da tela.
applyFontLevel(readFontLevel());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
