/**
 * Copy for the legal and information pages (/legal/*, /help, /transparency,
 * 500). The legal documents themselves are written in Spanish in their pages
 * (the Spanish text is the canonical one); here live their titles, summaries
 * and the surrounding UI. `en` must mirror `es` (the type check fails otherwise).
 */
export const es = {
  footer: {
    legal: 'Legal',
    terms: 'Términos y condiciones',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    risks: 'Aviso de riesgos',
    resources: 'Recursos',
    help: 'Centro de ayuda',
    contact: 'Contacto',
    transparency: 'Transparencia',
  },
  ui: {
    eyebrow: 'Legal',
    toc: 'Índice',
    tocOpen: 'Ver índice',
    version: 'Versión {v}',
    effective: 'Vigente desde el {date}',
    backToTop: 'Volver arriba',
    print: 'Imprimir',
    others: 'Otros documentos',
    summaryTitle: 'En resumen',
    spanishOnly: '',
    questionsTitle: '¿Dudas sobre este documento?',
    questionsBody: 'Escribinos desde el formulario de contacto y te respondemos.',
    contactCta: 'Ir a contacto',
    anchor: 'Enlace a esta sección',
  },
  docs: {
    index: {
      title: 'Documentos legales',
      lead: 'Las reglas del servicio, cómo tratamos tus datos, qué guardamos en tu navegador y los riesgos de invertir.',
      open: 'Leer',
    },
    terms: {
      title: 'Términos y condiciones',
      short: 'Las reglas para usar Fractachain: cuenta, verificación, licitaciones y responsabilidades.',
      lead: 'Las reglas para usar Fractachain. Leelas antes de crear tu cuenta: al aceptarlas, quedan como acuerdo entre vos y los responsables del servicio.',
      summary: [
        'Fractachain funciona hoy en Stellar Testnet: los activos y el USDC de prueba no tienen valor real y nada de lo que ves es una oferta pública autorizada.',
        'Para operar tenés que ser mayor de edad, tener tu cuenta al día y verificar tu identidad.',
        'Las operaciones en la blockchain son públicas e irreversibles. Si usás tu propia wallet, la custodia de tus claves es tu responsabilidad.',
        'No damos asesoramiento financiero. Invertir implica riesgos.',
        'Rige la ley argentina, incluidos tus derechos como consumidor.',
      ],
    },
    privacy: {
      title: 'Política de privacidad',
      short: 'Qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos.',
      lead: 'Qué datos personales tratamos, para qué, con quién los compartimos, cuánto tiempo los guardamos y cómo ejercer tus derechos según la Ley 25.326.',
      summary: [
        'Tratamos los datos necesarios para tu cuenta, la verificación de identidad, la seguridad y el cumplimiento legal.',
        'No vendemos tus datos ni los usamos para publicidad.',
        'Las direcciones y transacciones en Stellar son públicas y no se pueden borrar.',
        'Podés descargar tus datos o cerrar tu cuenta desde Cuenta → Privacidad, o escribirnos.',
      ],
    },
    cookies: {
      title: 'Política de cookies',
      short: 'Qué guardamos en tu navegador: solo lo necesario para tu sesión y tus preferencias.',
      lead: 'Qué guardamos en tu navegador y por qué. Solo usamos lo necesario para que funcionen tu sesión y tus preferencias: no hay cookies de análisis ni de publicidad.',
      summary: [
        'Una cookie de sesión (necesaria) y una de idioma (preferencia).',
        'Almacenamiento local para el tema claro u oscuro y para mostrar tu nombre más rápido.',
        'Sin analítica, sin publicidad, sin cookies de terceros.',
      ],
    },
    risks: {
      title: 'Aviso de riesgos',
      short: 'Los riesgos de invertir en activos tokenizados y de operar con una blockchain.',
      lead: 'Invertir implica riesgos. Podés perder parte o todo lo invertido. Leé este aviso antes de suscribir: es el que aceptás al marcar la casilla de riesgos en cada licitación.',
      summary: [
        'Podés perder parte o todo lo invertido; los rendimientos estimados no están garantizados.',
        'Puede que no encuentres comprador cuando quieras vender.',
        'Los contratos inteligentes, las stablecoins y la custodia de claves tienen riesgos propios.',
        'Hoy todo ocurre en una red de pruebas, sin valor real.',
      ],
    },
  },
  help: {
    eyebrow: 'Ayuda',
    title: 'Centro de ayuda',
    lead: 'Respuestas cortas sobre tu cuenta, la verificación, tu wallet y cómo funcionan las licitaciones.',
    searchLabel: 'Buscar en la ayuda',
    searchPlaceholder: 'Buscá por palabra: Freighter, reembolso, 2FA…',
    all: 'Todas',
    categoriesLabel: 'Categorías',
    results: '{n} respuestas',
    oneResult: '1 respuesta',
    emptyTitle: 'No encontramos respuestas con esa búsqueda',
    emptyBody: 'Probá con otra palabra o escribinos.',
    notFoundTitle: '¿No encontraste la respuesta?',
    notFoundBody: 'Escribinos desde el formulario de contacto. Elegí el tema y te respondemos por email.',
    contact: 'Escribinos',
    guidesTitle: 'Más información',
    guides: [
      ['Términos y condiciones', '/legal/terms'],
      ['Política de privacidad', '/legal/privacy'],
      ['Aviso de riesgos', '/legal/risks'],
      ['Transparencia: contratos desplegados', '/transparency'],
    ],
    categories: [
      {
        id: 'account',
        title: 'Cuenta y acceso',
        items: [
          [
            '¿Cómo creo una cuenta?',
            'Desde Crear cuenta, con tu email y una contraseña, o ingresando con Google o con tu wallet Freighter. Para crear la cuenta tenés que aceptar los Términos y condiciones y la Política de privacidad.',
          ],
          [
            '¿Por qué tengo que confirmar mi email?',
            'Te mandamos un link al registrarte (vale 24 horas). Confirmar el email es necesario para verificar tu identidad y para poder recuperar la cuenta. Si no te llegó, pedí uno nuevo desde el aviso que aparece arriba de la pantalla.',
          ],
          [
            'Olvidé mi contraseña',
            'En Ingresar, tocá ¿Olvidaste tu contraseña?. El link que te mandamos vale 30 minutos y, al cambiar la contraseña, cerramos todas tus sesiones abiertas.',
          ],
          [
            '¿Puedo ingresar con mi wallet?',
            'Sí. Con Conectar con wallet, Freighter te pide firmar un mensaje: no es una transacción y no cuesta nada. Así probamos que la wallet es tuya sin usar contraseña.',
          ],
        ],
      },
      {
        id: 'kyc',
        title: 'Verificación (KYC)',
        items: [
          [
            '¿Por qué tengo que verificar mi identidad?',
            'Por la normativa de prevención del lavado de activos, solo los inversores verificados pueden aportar a una licitación. Los contratos también lo controlan: una wallet no verificada no puede aportar.',
          ],
          [
            '¿Cómo es la verificación?',
            'Cargás tu nombre y tu CUIT o CUIL. Cuando está activo nuestro proveedor de verificación (Didit), validás tu DNI y una selfie en su flujo. En el entorno de pruebas sin proveedor, la verificación se aprueba automáticamente o la revisa nuestro equipo.',
          ],
          [
            '¿Cuánto tarda?',
            'Con el proveedor, el resultado suele llegar en minutos. Si queda en revisión manual puede tardar hasta 72 horas hábiles. Ves el estado en Cuenta → Verificación.',
          ],
          [
            'Rechazaron mi verificación',
            'En Cuenta → Verificación vas a ver el motivo. Si se puede reintentar, vas a ver el botón; si no, escribinos desde Contacto eligiendo el tema Verificación.',
          ],
        ],
      },
      {
        id: 'wallet',
        title: 'Wallet y Freighter',
        items: [
          [
            '¿Qué wallet uso?',
            'Podés usar una wallet en Fractachain (guardamos la clave cifrada y firmamos por vos) o tu propia wallet Freighter, donde firmás vos cada operación y la plataforma nunca ve tu clave.',
          ],
          [
            '¿Cómo configuro Freighter?',
            'Instalá la extensión Freighter, creá o importá una cuenta y cambiá la red a Testnet. Fondeá la cuenta con XLM de prueba desde Friendbot y conectala en Ingresar → Conectar con wallet.',
          ],
          [
            '¿Para qué necesito XLM?',
            'Cada transacción en Stellar paga una comisión de red en XLM (fracciones de centavo). Además, cada trustline reserva 0,5 XLM de tu saldo mientras exista.',
          ],
          [
            'Freighter dice que la red no es la correcta',
            'La plataforma opera en Stellar Testnet. Cambiá la red de Freighter a Testnet y volvé a firmar: una firma hecha en otra red se rechaza.',
          ],
          [
            '¿Qué firmo cuando aporto?',
            'Antes de abrir Freighter te mostramos qué vas a firmar: el contrato, la función (por ejemplo contribute), el monto y su moneda, la comisión y hasta cuándo vale. El servidor solo acepta exactamente esa transacción, firmada por tu wallet y una sola vez.',
          ],
        ],
      },
      {
        id: 'usdc',
        title: 'USDC de prueba',
        items: [
          [
            '¿Qué es el USDC de prueba?',
            'Es el USDC de Circle en la red de pruebas de Stellar. No tiene valor real: sirve para probar el flujo completo con la misma moneda que se usaría en producción.',
          ],
          [
            '¿Cómo consigo USDC de prueba?',
            'En la ficha de una licitación, primero habilitá USDC en tu wallet (una trustline que firmás vos) y después tocá Recibir USDC de prueba. Te los enviamos desde el pool de demo de Fractachain.',
          ],
          [
            '¿Por qué tengo que habilitar USDC?',
            'En Stellar, para recibir un activo distinto de XLM tu cuenta tiene que aceptarlo con una trustline. Es una operación única, la firmás vos y reserva 0,5 XLM.',
          ],
        ],
      },
      {
        id: 'offerings',
        title: 'Licitaciones',
        items: [
          [
            '¿Cómo funciona una licitación?',
            'El emisor publica su expediente y abre un contrato en Stellar con un mínimo, un tope y una fecha de cierre. Los inversores aportan USDC al contrato y reciben unidades a un precio fijo por unidad.',
          ],
          [
            '¿Cuánto puedo aportar?',
            'Desde la inversión mínima de la licitación, en múltiplos del precio por unidad, y hasta lo que falte para completar el tope.',
          ],
          [
            '¿Qué pasa al cierre?',
            'Cuando se llega a la fecha o al tope, cualquiera puede cerrar el contrato (finalize). Si se alcanzó el mínimo, los USDC se transfieren a la cuenta de la fiduciaria; si no, el contrato habilita el reembolso.',
          ],
          [
            '¿Cómo recupero mi aporte si no se alcanzó el mínimo?',
            'En la ficha vas a ver Reembolso disponible. Firmás el reembolso y el contrato te devuelve el 100 % de tu aporte en USDC.',
          ],
          [
            '¿Dónde veo mis unidades?',
            'En Portfolio y en la ficha de la licitación (Tu participación). Las unidades viven en el contrato de la licitación, no como un activo de Freighter, y cada número indica de qué contrato se leyó.',
          ],
          [
            '¿Puedo verificar todo por mi cuenta?',
            'Sí. Cada operación tiene un link a Stellar Expert y cada pantalla muestra el contrato del que lee los datos. En Transparencia está la lista de contratos desplegados.',
          ],
        ],
      },
      {
        id: 'security',
        title: 'Seguridad',
        items: [
          [
            '¿Cómo protejo mi cuenta?',
            'Activá la verificación en dos pasos en Cuenta → Seguridad con una app de autenticación y guardá los códigos de recuperación en un lugar seguro.',
          ],
          [
            '¿Fractachain me puede pedir mi clave secreta?',
            'No. Nunca te vamos a pedir tu clave secreta, tu frase de recuperación ni tus códigos de verificación por email, chat o teléfono.',
          ],
          [
            'Creo que alguien entró a mi cuenta',
            'En Cuenta → Seguridad cerrá todas las sesiones y cambiá tu contraseña. Después escribinos desde Contacto con el tema Seguridad.',
          ],
        ],
      },
      {
        id: 'privacy',
        title: 'Privacidad',
        items: [
          [
            '¿Qué datos guardan?',
            'Los necesarios para tu cuenta, la verificación de identidad, la seguridad y el cumplimiento legal. El detalle está en la Política de privacidad.',
          ],
          [
            '¿Puedo descargar o borrar mis datos?',
            'Desde Cuenta → Privacidad podés descargar tus datos o cerrar tu cuenta. Si tu wallet en Fractachain tiene fondos o tenés posiciones abiertas, primero hay que retirarlos. Algunos datos se conservan el tiempo que exige la ley.',
          ],
          [
            '¿Se puede borrar lo que está en Stellar?',
            'No. Las direcciones y transacciones de una blockchain pública son visibles para cualquiera y no se pueden modificar ni borrar.',
          ],
        ],
      },
    ],
  },
  transparency: {
    eyebrow: 'Transparencia',
    title: 'Transparencia',
    lead: 'Qué está desplegado en Stellar, cómo verificarlo por tu cuenta y en qué etapa está el proyecto.',
    statusTitle: 'Estado del proyecto',
    status: [
      [
        'Red de pruebas',
        'Fractachain opera hoy en Stellar Testnet. Los activos y el USDC de prueba no tienen valor real.',
      ],
      [
        'Sin autorización de la CNV',
        'El producto está diseñado para un régimen de pruebas (sandbox) de la CNV, pero no cuenta con registro ni autorización. Nada de lo que ves es una oferta pública.',
      ],
      [
        'Sin auditoría externa todavía',
        'Los contratos tienen tests y una revisión de seguridad propia publicada. Todavía no pasaron una auditoría externa independiente.',
      ],
      [
        'Código en GitHub',
        'El código de la plataforma y de los contratos está en el repositorio del proyecto.',
      ],
    ],
    contractsTitle: 'Contratos desplegados',
    contractsLead: 'Leídos en vivo de la red. Cada ID abre el contrato en Stellar Expert.',
    network: 'Red',
    passphrase: 'Passphrase',
    rpc: 'Soroban RPC',
    horizon: 'Horizon',
    usdc: 'Moneda de pago',
    usdcIssuer: 'Emisor',
    usdcDecimals: '{n} decimales',
    factory: 'Factory de emisiones',
    tenders: 'Licitaciones',
    stockVaults: 'Bóvedas de acciones',
    forwards: 'Forwards',
    warrants: 'Warrants',
    none: 'Sin instancias desplegadas',
    loading: 'Leyendo la red…',
    error: 'No pudimos leer la red ahora.',
    retry: 'Reintentar',
    readAt: 'Leído a las {time}',
    showAll: 'Ver las {n}',
    showLess: 'Ver menos',
    verifyTitle: 'Cómo verificar una operación',
    verifySteps: [
      'Al confirmar cada operación te mostramos el link Ver en Stellar Expert. Abrilo.',
      'En la transacción, la cuenta de origen (Source account) tiene que ser tu wallet: en el flujo con Freighter nadie firma por vos.',
      'En la operación vas a ver la función del contrato (por ejemplo contribute) y el movimiento del activo. USDC con emisor GBBD47IF… es el USDC de Circle en testnet.',
      'Desde la ficha de la licitación abrí su contrato y compará su saldo con el recaudado que mostramos.',
    ],
    securityTitle: 'Seguridad',
    securityBody:
      'Publicamos la revisión de seguridad de la plataforma y de los contratos, con cada hallazgo y su corrección.',
    securityLink: 'Leer la revisión de seguridad',
    repoLink: 'Ver el repositorio',
  },
  error: {
    code: 'Error 500',
    title: 'Algo salió mal de nuestro lado',
    body: 'No es tu culpa. Probá de nuevo en un momento; si sigue pasando, avisanos.',
    retry: 'Reintentar',
    home: 'Ir al inicio',
    contact: 'Avisanos',
  },
};

export const en: typeof es = {
  footer: {
    legal: 'Legal',
    terms: 'Terms and conditions',
    privacy: 'Privacy',
    cookies: 'Cookies',
    risks: 'Risk disclosure',
    resources: 'Resources',
    help: 'Help center',
    contact: 'Contact',
    transparency: 'Transparency',
  },
  ui: {
    eyebrow: 'Legal',
    toc: 'Contents',
    tocOpen: 'Show contents',
    version: 'Version {v}',
    effective: 'Effective {date}',
    backToTop: 'Back to top',
    print: 'Print',
    others: 'Other documents',
    summaryTitle: 'Summary',
    spanishOnly: 'This document is available in Spanish only. The Spanish version is the binding one.',
    questionsTitle: 'Questions about this document?',
    questionsBody: 'Write to us through the contact form and we will answer.',
    contactCta: 'Go to contact',
    anchor: 'Link to this section',
  },
  docs: {
    index: {
      title: 'Legal documents',
      lead: 'The rules of the service, how we handle your data, what we store in your browser and the risks of investing.',
      open: 'Read',
    },
    terms: {
      title: 'Terms and conditions',
      short: 'The rules for using Fractachain: account, verification, offerings and responsibilities.',
      lead: 'The rules for using Fractachain. Read them before creating your account: once accepted, they are the agreement between you and the people responsible for the service.',
      summary: [
        'Fractachain runs on Stellar Testnet today: assets and test USDC have no real value and nothing you see is an authorized public offering.',
        'To operate you must be of legal age, keep your account in order and verify your identity.',
        'Blockchain operations are public and irreversible. If you use your own wallet, keeping your keys safe is your responsibility.',
        'We do not give financial advice. Investing involves risk.',
        'Argentine law applies, including your consumer rights.',
      ],
    },
    privacy: {
      title: 'Privacy policy',
      short: 'What data we process, why, who we share it with and how to exercise your rights.',
      lead: 'What personal data we process, why, who we share it with, how long we keep it and how to exercise your rights under Argentine Law 25,326.',
      summary: [
        'We process the data needed for your account, identity verification, security and legal compliance.',
        'We do not sell your data or use it for advertising.',
        'Addresses and transactions on Stellar are public and cannot be erased.',
        'You can download your data or close your account from Account → Privacy, or write to us.',
      ],
    },
    cookies: {
      title: 'Cookie policy',
      short: 'What we store in your browser: only what your session and preferences need.',
      lead: 'What we store in your browser and why. We only use what your session and your preferences need: no analytics or advertising cookies.',
      summary: [
        'One session cookie (necessary) and one language cookie (preference).',
        'Local storage for the light or dark theme and to show your name faster.',
        'No analytics, no advertising, no third-party cookies.',
      ],
    },
    risks: {
      title: 'Risk disclosure',
      short: 'The risks of investing in tokenized assets and of operating on a blockchain.',
      lead: 'Investing involves risk. You can lose part or all of your investment. Read this disclosure before subscribing: it is the one you accept when you tick the risk box on each offering.',
      summary: [
        'You can lose part or all of your investment; estimated returns are not guaranteed.',
        'You may not find a buyer when you want to sell.',
        'Smart contracts, stablecoins and key custody carry their own risks.',
        'Today everything happens on a test network, with no real value.',
      ],
    },
  },
  help: {
    eyebrow: 'Help',
    title: 'Help center',
    lead: 'Short answers about your account, verification, your wallet and how offerings work.',
    searchLabel: 'Search the help center',
    searchPlaceholder: 'Search a word: Freighter, refund, 2FA…',
    all: 'All',
    categoriesLabel: 'Categories',
    results: '{n} answers',
    oneResult: '1 answer',
    emptyTitle: 'No answers match that search',
    emptyBody: 'Try another word or write to us.',
    notFoundTitle: "Didn't find your answer?",
    notFoundBody: 'Write to us through the contact form. Pick a topic and we will reply by email.',
    contact: 'Write to us',
    guidesTitle: 'More information',
    guides: [
      ['Terms and conditions', '/legal/terms'],
      ['Privacy policy', '/legal/privacy'],
      ['Risk disclosure', '/legal/risks'],
      ['Transparency: deployed contracts', '/transparency'],
    ],
    categories: [
      {
        id: 'account',
        title: 'Account and access',
        items: [
          [
            'How do I create an account?',
            'From Create account, with your email and a password, or by signing in with Google or with your Freighter wallet. Creating an account requires accepting the Terms and conditions and the Privacy policy.',
          ],
          [
            'Why do I have to confirm my email?',
            'We send you a link when you sign up (valid for 24 hours). Confirming your email is required to verify your identity and to recover the account. If it did not arrive, request a new one from the notice at the top of the screen.',
          ],
          [
            'I forgot my password',
            'On Sign in, tap Forgot your password?. The link we send is valid for 30 minutes and, when you change the password, we close all your open sessions.',
          ],
          [
            'Can I sign in with my wallet?',
            'Yes. With Connect wallet, Freighter asks you to sign a message: it is not a transaction and costs nothing. That proves the wallet is yours without a password.',
          ],
        ],
      },
      {
        id: 'kyc',
        title: 'Verification (KYC)',
        items: [
          [
            'Why do I have to verify my identity?',
            'Anti-money-laundering rules allow only verified investors to contribute to an offering. The contracts enforce it too: an unverified wallet cannot contribute.',
          ],
          [
            'How does verification work?',
            'You enter your name and CUIT or CUIL. When our verification provider (Didit) is active, you validate your ID and a selfie in its flow. In the test environment without a provider, verification is approved automatically or reviewed by our team.',
          ],
          [
            'How long does it take?',
            'With the provider, the result usually arrives within minutes. If it goes to manual review it can take up to 72 business hours. You see the status in Account → Verification.',
          ],
          [
            'My verification was declined',
            'Account → Verification shows the reason. If you can retry, you will see the button; otherwise write to us from Contact choosing the Verification topic.',
          ],
        ],
      },
      {
        id: 'wallet',
        title: 'Wallet and Freighter',
        items: [
          [
            'Which wallet should I use?',
            'You can use a Fractachain wallet (we keep the key encrypted and sign for you) or your own Freighter wallet, where you sign each operation and the platform never sees your key.',
          ],
          [
            'How do I set up Freighter?',
            'Install the Freighter extension, create or import an account and switch the network to Testnet. Fund the account with test XLM from Friendbot and connect it on Sign in → Connect wallet.',
          ],
          [
            'Why do I need XLM?',
            'Every Stellar transaction pays a network fee in XLM (fractions of a cent). Each trustline also reserves 0.5 XLM of your balance while it exists.',
          ],
          [
            'Freighter says the network is wrong',
            'The platform runs on Stellar Testnet. Switch Freighter to Testnet and sign again: a signature made on another network is refused.',
          ],
          [
            'What do I sign when I contribute?',
            'Before opening Freighter we show what you will sign: the contract, the function (for example contribute), the amount and its asset, the fee and until when it is valid. The server only accepts exactly that transaction, signed by your wallet, once.',
          ],
        ],
      },
      {
        id: 'usdc',
        title: 'Test USDC',
        items: [
          [
            'What is test USDC?',
            "It is Circle's USDC on Stellar's test network. It has no real value: it lets you try the full flow with the same currency production would use.",
          ],
          [
            'How do I get test USDC?',
            "On an offering's page, first enable USDC in your wallet (a trustline you sign) and then tap Get test USDC. We send it from Fractachain's demo pool.",
          ],
          [
            'Why do I have to enable USDC?',
            'On Stellar, to receive an asset other than XLM your account must accept it with a trustline. It is a one-time operation, you sign it and it reserves 0.5 XLM.',
          ],
        ],
      },
      {
        id: 'offerings',
        title: 'Offerings',
        items: [
          [
            'How does an offering work?',
            'The issuer publishes its file and opens a contract on Stellar with a minimum, a cap and a closing date. Investors contribute USDC to the contract and receive units at a fixed price per unit.',
          ],
          [
            'How much can I contribute?',
            "From the offering's minimum investment, in multiples of the price per unit, up to what is left to reach the cap.",
          ],
          [
            'What happens at the close?',
            "When the date or the cap is reached, anyone can close the contract (finalize). If the minimum was reached, the USDC goes to the trustee's account; otherwise the contract enables the refund.",
          ],
          [
            'How do I get my contribution back if the minimum was not reached?',
            "The offering's page shows Refund available. You sign the refund and the contract returns 100% of your contribution in USDC.",
          ],
          [
            'Where do I see my units?',
            "In Portfolio and on the offering's page (Your position). Units live in the offering's contract, not as a Freighter asset, and each number shows which contract it was read from.",
          ],
          [
            'Can I verify everything myself?',
            'Yes. Every operation has a Stellar Expert link and every screen shows the contract it reads. Transparency lists the deployed contracts.',
          ],
        ],
      },
      {
        id: 'security',
        title: 'Security',
        items: [
          [
            'How do I protect my account?',
            'Turn on two-step verification in Account → Security with an authenticator app and keep the recovery codes somewhere safe.',
          ],
          [
            'Can Fractachain ask for my secret key?',
            'No. We will never ask for your secret key, your recovery phrase or your verification codes by email, chat or phone.',
          ],
          [
            'I think someone got into my account',
            'In Account → Security close all sessions and change your password. Then write to us from Contact with the Security topic.',
          ],
        ],
      },
      {
        id: 'privacy',
        title: 'Privacy',
        items: [
          [
            'What data do you keep?',
            'What your account, identity verification, security and legal compliance need. The details are in the Privacy policy.',
          ],
          [
            'Can I download or delete my data?',
            'From Account → Privacy you can download your data or close your account. If your Fractachain wallet holds funds or you have open positions, they must be withdrawn first. Some data is kept for as long as the law requires.',
          ],
          [
            'Can what is on Stellar be deleted?',
            'No. Addresses and transactions on a public blockchain are visible to anyone and cannot be changed or deleted.',
          ],
        ],
      },
    ],
  },
  transparency: {
    eyebrow: 'Transparency',
    title: 'Transparency',
    lead: 'What is deployed on Stellar, how to verify it yourself and what stage the project is at.',
    statusTitle: 'Project status',
    status: [
      ['Test network', 'Fractachain runs on Stellar Testnet today. Assets and test USDC have no real value.'],
      [
        'Not authorized by the CNV',
        'The product is designed for a CNV test regime (sandbox), but it is not registered or authorized. Nothing you see is a public offering.',
      ],
      [
        'No external audit yet',
        'The contracts have tests and a published in-house security review. They have not gone through an independent external audit yet.',
      ],
      ['Code on GitHub', "The platform's and the contracts' code is in the project repository."],
    ],
    contractsTitle: 'Deployed contracts',
    contractsLead: 'Read live from the network. Each ID opens the contract on Stellar Expert.',
    network: 'Network',
    passphrase: 'Passphrase',
    rpc: 'Soroban RPC',
    horizon: 'Horizon',
    usdc: 'Payment asset',
    usdcIssuer: 'Issuer',
    usdcDecimals: '{n} decimals',
    factory: 'Issuance factory',
    tenders: 'Offerings',
    stockVaults: 'Stock vaults',
    forwards: 'Forwards',
    warrants: 'Warrants',
    none: 'No deployed instances',
    loading: 'Reading the network…',
    error: "We couldn't read the network right now.",
    retry: 'Retry',
    readAt: 'Read at {time}',
    showAll: 'Show all {n}',
    showLess: 'Show less',
    verifyTitle: 'How to verify an operation',
    verifySteps: [
      'When each operation is confirmed we show the View on Stellar Expert link. Open it.',
      'In the transaction, the source account must be your wallet: in the Freighter flow nobody signs for you.',
      "In the operation you will see the contract function (for example contribute) and the asset movement. USDC issued by GBBD47IF… is Circle's testnet USDC.",
      "From the offering's page open its contract and compare its balance with the amount raised we show.",
    ],
    securityTitle: 'Security',
    securityBody:
      "We publish the platform's and the contracts' security review, with each finding and its fix.",
    securityLink: 'Read the security review',
    repoLink: 'View the repository',
  },
  error: {
    code: 'Error 500',
    title: 'Something went wrong on our side',
    body: "It's not your fault. Try again in a moment; if it keeps happening, let us know.",
    retry: 'Retry',
    home: 'Go home',
    contact: 'Let us know',
  },
};
