import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('testgen-splash');
    if (!splash) return;
    splash.classList.add('testgen-splash-hiding');
    window.setTimeout(() => splash.remove(), 220);
  });
});
