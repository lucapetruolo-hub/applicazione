/**
 * Menu laterale del professionista ridotto a sole icone (docs/CHANGELOG.md
 * §319, richiesta esplicita dell'utente: più spazio per agenda e
 * statistiche). La scelta resta nel browser e vale solo da 1000px, dove il
 * menu è una colonna; su telefono e tablet in verticale resta la barra.
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

/** Script in linea nel `<head>`: legge la scelta salvata prima che la pagina compaia. */
export const ACCOUNT_NAV_BOOT_SCRIPT = `try{if(localStorage.getItem("${STORAGE_KEY}")==="1")document.documentElement.setAttribute("${ATTRIBUTE}","${COLLAPSED}")}catch(e){}`;
