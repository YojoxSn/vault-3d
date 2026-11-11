import './ui/style.css';
import { App } from './app';

const app = new App();
void app.start();
if (location.search.includes('debug')) (window as unknown as { vault3d: App }).vault3d = app;
