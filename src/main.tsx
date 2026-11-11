import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 해시 라우팅: GitHub Pages처럼 서버 설정을 못 바꾸는 곳에서도 새로고침과 딥링크가 동작한다 */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// 새 버전이 배포되면 다음 실행부터 자동으로 적용된다.
registerSW({ immediate: true });
