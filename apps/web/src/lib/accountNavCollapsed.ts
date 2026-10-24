/**
 * Menu laterale del professionista ridotto a sole icone (docs/CHANGELOG.md
 * §325, richiesta esplicita dell'utente: più spazio per agenda e
 * statistiche). Vale da 1000px; sotto c'è la colonna stretta del tablet o
 * la barra del telefono. Senza una scelta della persona il menu parte
 * ridotto fino a 1366px (portatili comuni, tablet in orizzontale), dove
 * ridurlo dà 192px al contenuto di ogni pagina; la scelta, "1" o "0", vince
 * sempre.
 * Qui solo le costanti, importabili anche dal layout (componente server);
 * il hook è in `useAccountNavCollapsed.ts`.
 *
 * Lo stato vive in un attributo di `<html>` scritto prima del primo disegno
 * dallo script di `layout.tsx`: il CSS legge l'attributo, così chi ha
 * ridotto il menu non lo vede aprirsi e richiudersi a ogni pagina.
 */
export const STORAGE_KEY = "professionisti_menu_ridotto";
export const ATTRIBUTE = "data-acct-nav";
export const COLLAPSED = "collapsed";
export const CHANGE_EVENT = "acct-nav-change";

export const AUTO_COLLAPSE_UP_TO = 1366;

/**
 * Script in linea nel `<head>`: decide lo stato prima che la pagina compaia
 * e lo ricalcola quando cambia la finestra o la scelta.
 */
export const ACCOUNT_NAV_BOOT_SCRIPT = `(function(){var d=document.documentElement;function a(){var p=null;try{p=localStorage.getItem("${STORAGE_KEY}")}catch(e){}if(p==="1"||(p===null&&innerWidth<=${AUTO_COLLAPSE_UP_TO}))d.setAttribute("${ATTRIBUTE}","${COLLAPSED}");else d.removeAttribute("${ATTRIBUTE}")}a();addEventListener("resize",a);addEventListener("${CHANGE_EVENT}",a)})()`;
