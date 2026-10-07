import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './pwa';
import App from './App';
import { ensureBuiltIns } from './db/db';

const root = createRoot(document.getElementById('root')!);

ensureBuiltIns()
  .catch((e) => console.error('Could not prepare built-in templates', e))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
