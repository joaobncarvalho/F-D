// F&D — coisas do dispositivo que fazem a diferença numa festa real.
//
//  · Wake lock: sem isto o telemóvel apaga o ecrã a cada 30 segundos e toda a
//    gente passa a noite a desbloquear o telemóvel em vez de jogar. É o detalhe
//    pequeno com maior impacto prático de todos.
//  · Acessibilidade: bar às escuras, ecrã sujo, gente já bem disposta — texto
//    maior e alto contraste têm de estar a um toque.
//  · Service worker: só para o "adicionar ao ecrã principal" funcionar.

// ----- Wake lock -------------------------------------------------------------

let sentinel = null;
let wanted = false;

async function request() {
  if (!wanted || sentinel) return;
  try {
    sentinel = await navigator.wakeLock?.request('screen');
    sentinel?.addEventListener?.('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null; // bateria fraca, separador em segundo plano, browser sem suporte
  }
}

/**
 * Mantém o ecrã aceso enquanto a app estiver visível. O browser larga o wake lock
 * sempre que o separador vai para segundo plano, por isso voltamos a pedi-lo no
 * `visibilitychange` — senão perde-se à primeira notificação que aparece.
 */
export function keepScreenAwake() {
  if (!('wakeLock' in navigator)) return () => {};
  wanted = true;
  request();
  const onVisible = () => {
    if (document.visibilityState === 'visible') request();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    wanted = false;
    document.removeEventListener('visibilitychange', onVisible);
    sentinel?.release?.().catch(() => {});
    sentinel = null;
  };
}

// ----- Acessibilidade / legibilidade -----------------------------------------

const A11Y_KEY = 'fd_a11y';

export function loadA11y() {
  try {
    return { big: false, contrast: false, ...JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') };
  } catch {
    return { big: false, contrast: false };
  }
}

/** Aplica as preferências ao <html> (o CSS trata do resto). */
export function applyA11y(prefs) {
  const root = document.documentElement;
  root.classList.toggle('fd-big', !!prefs.big);
  root.classList.toggle('fd-contrast', !!prefs.contrast);
  try {
    localStorage.setItem(A11Y_KEY, JSON.stringify(prefs));
  } catch {
    /* modo privado */
  }
  return prefs;
}

// ----- Service worker --------------------------------------------------------

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' && import.meta.env?.DEV) return; // não estorvar o dev
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ----- Perfil local ("voltar a jogar com o mesmo grupo") ---------------------
//
// Sem contas nem login: guarda-se apenas o que o próprio jogador escreveu neste
// telemóvel, para não ter de repetir nome/emoji/cor a cada sala.

const PROFILE_KEY = 'fd_profile';

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* modo privado */
  }
  return profile;
}

/** Últimas salas onde este telemóvel jogou (para "voltar a jogar"). */
export function rememberRoom(code) {
  const p = loadProfile() || {};
  const recent = [code, ...(p.recentRooms || []).filter((c) => c !== code)].slice(0, 3);
  return saveProfile({ ...p, recentRooms: recent });
}
