// Entry for the public portfolio page (p/index.html). Deliberately small:
// fonts, the shared portfolio view and the visitor client. No service
// worker, no local database, no sign-in.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/inter/index.css';
import './viewer-page.css';
import { Viewer } from './Viewer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Viewer />
  </StrictMode>,
);
