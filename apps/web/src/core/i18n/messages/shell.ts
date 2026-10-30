/**
 * Copy for the app shell (header, tab bar, account menu) and the shared UI
 * kit. `en` must mirror `es` (the type check fails otherwise).
 */
export const es = {
  tabs: {
    home: 'Inicio',
    offerings: 'Licitaciones',
    markets: 'Mercado',
    portfolio: 'Portfolio',
    account: 'Cuenta',
    console: 'Consola',
    howItWorks: 'Cómo funciona',
    issuers: 'Emisores',
    primary: 'Navegación principal',
  },
  menu: {
    open: 'Abrir menú de cuenta',
    security: 'Seguridad',
    wallet: 'Wallet',
    verification: 'Verificación',
    console: 'Consola de administración',
    logout: 'Cerrar sesión',
  },
  kyc: {
    UNREGISTERED: 'Sin verificar',
    PENDING: 'Verificación en curso',
    APPROVED: 'Verificado',
    REJECTED: 'Verificación rechazada',
    REVOKED: 'Verificación revocada',
  },
  kit: {
    open: 'Abrir',
    showTable: 'Ver tabla',
    hideTable: 'Ver gráfico',
    today: 'hoy',
    empty: 'Nada por acá todavía.',
    min: 'Mínimo',
    max: 'Tope',
    raised: 'Recaudado',
    of: 'de',
    done: 'Hecho',
    pending: 'Pendiente',
    riskShort: 'Invertir implica riesgos. Podés perder parte o todo lo invertido.',
  },
  greeting: {
    morning: 'Buen día',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
  },
};

export const en: typeof es = {
  tabs: {
    home: 'Home',
    offerings: 'Offerings',
    markets: 'Markets',
    portfolio: 'Portfolio',
    account: 'Account',
    console: 'Console',
    howItWorks: 'How it works',
    issuers: 'Issuers',
    primary: 'Main navigation',
  },
  menu: {
    open: 'Open account menu',
    security: 'Security',
    wallet: 'Wallet',
    verification: 'Verification',
    console: 'Admin console',
    logout: 'Sign out',
  },
  kyc: {
    UNREGISTERED: 'Not verified',
    PENDING: 'Verification in progress',
    APPROVED: 'Verified',
    REJECTED: 'Verification declined',
    REVOKED: 'Verification revoked',
  },
  kit: {
    open: 'Open',
    showTable: 'Show table',
    hideTable: 'Show chart',
    today: 'today',
    empty: 'Nothing here yet.',
    min: 'Minimum',
    max: 'Cap',
    raised: 'Raised',
    of: 'of',
    done: 'Done',
    pending: 'Pending',
    riskShort: 'Investing involves risk. You can lose part or all of your investment.',
  },
  greeting: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  },
};
