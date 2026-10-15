// Maré — configuração do Firebase (Parte 4). Valores em: Console do Firebase → Configurações do projeto → Seus apps → Web.
// Esses dados são públicos por natureza; a proteção vem das regras do Firestore (firestore.rules) e, depois, do App Check.
// false = app 100% local (sem login anônimo, sync e push). Navegadores automatizados (Playwright, Selenium) ficam locais
// de propósito: assim os testes não criam usuários nem documentos no projeto Firebase real.
export const FIREBASE_ENABLED = !(typeof navigator !== 'undefined' && navigator.webdriver);
export const firebaseConfig = {
  apiKey: 'AIzaSyALjMyEoPlka7CJ0Ebmc2DykdlpCgm096E',
  authDomain: 'mare-hidratacao.firebaseapp.com',
  projectId: 'mare-hidratacao',
  storageBucket: 'mare-hidratacao.firebasestorage.app',
  messagingSenderId: '331167358767',
  appId: '1:331167358767:web:0267f111df7bb3892a8bda',
};
// Cloud Messaging → Configuração da Web → Certificados push da Web → "Gerar par de chaves" (chave pública)
export const VAPID_KEY = 'BOsRNtP_NRscdh81ILqs1n-9OQKjZGuXBAxud5n3JAemBzE6Cj5qr8U5a4GgRsGnDswQ3viGcJLt95sWbGsYST0';
// true para usar o Emulator Suite (firebase emulators:start) quando o app abre em localhost
export const USE_EMULATORS = false;
