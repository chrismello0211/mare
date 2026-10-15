// Maré — configuração do Firebase (Parte 4). Valores em: Console do Firebase → Configurações do projeto → Seus apps → Web.
// Esses dados são públicos por natureza; a proteção vem das regras do Firestore (firestore.rules) e, depois, do App Check.
export const FIREBASE_ENABLED = false; // mude para true depois de preencher tudo abaixo
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
// Cloud Messaging → Configuração da Web → Certificados push da Web → "Gerar par de chaves" (chave pública)
export const VAPID_KEY = '';
// true para usar o Emulator Suite (firebase emulators:start) quando o app abre em localhost
export const USE_EMULATORS = false;
