import {createRoot} from 'react-dom/client';
import MonitorPage from '../apps/web/app/monitor/page';
import './shell.css';

createRoot(document.getElementById('root')!).render(<MonitorPage/>);
