# Benchmark de producto para el rediseño

Octubre 2026. Insumo para el rediseño "oncopath". Republic, Wefunder, Crowdcube, Cocos y Centrifuge bloquean la lectura automática; se completó con centros de ayuda, docs y reseñas.

## 1. Productos analizados

| Producto                   | Qué es                                                          | Ideas clave para Fractachain                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Securitize                 | Tokenización regulada (agente de transferencia y broker-dealer) | KYC reutilizable (Securitize iD) para todas las ofertas. 7 estados de KYC: ninguno, procesando, requiere cambios, revisión manual, verificado, rechazado, vencido.                             |
| Ondo Finance / Ondo Stocks | Bonos del Tesoro y más de 470 acciones tokenizadas              | Card con TVL + APY + chip de elegibilidad. Confianza en bloques: respaldo verificado a diario, custodio, aislamiento ante quiebra. Onboarding: KYC → firma de acuerdos → wallet aprobada.      |
| Centrifuge                 | Pools de crédito privado                                        | Ficha: resumen → card por tramo con gráfico desplegable → cartera (gráfico + tabla). CSV por gráfico. El acuerdo se firma mientras el KYC está en revisión.                                    |
| RealT                      | Inmuebles tokenizados                                           | Prueba social con 3 números (inversores, renta distribuida, rango de renta). La card del activo separa el retorno total en renta esperada + ganancia de capital. Ocupación visible por activo. |
| xStocks (Backed)           | Acciones tokenizadas 1:1                                        | Stats en el hero (activos, volumen, 24/7, 1:1). Ecosistema agrupado por categoría (exchanges, wallets, DeFi).                                                                                  |
| Superstate                 | Fondos y acciones on-chain                                      | Landing con dos caminos: emisores e inversores. Footer con los registros regulatorios escritos textualmente.                                                                                   |
| Franklin Templeton Benji   | Fondo de dinero (FOBXX) sobre Stellar                           | La renta diaria se ve directamente en el saldo. Se fondea en USDC. Es un antecedente regulado en el mismo stack que usamos.                                                                    |
| Maple / Matrixdock         | Crédito institucional / reservas tokenizadas                    | Métricas institucionales en el hero (AUM, préstamos). Tiempos explícitos ("Funding time: 24 hours"). Transparencia como eje narrativo.                                                         |
| Republic (+ ex Seedrs)     | Crowdinvesting                                                  | Card de oferta: recaudado, inversores, mínimo, tiempo restante. Ficha con Pitch, Información clave, Equipo, Novedades, Inversores, Discusión, Documentos y un "Resumen de inversión".          |
| Wefunder                   | Crowdfunding (Reg CF)                                           | Términos arriba: meta mínima, meta máxima, inversión mínima, instrumento, valuation cap. Secciones: Overview, Details, Posts, "What People Say", "Ask a Question".                             |
| Crowdcube                  | Crowdfunding UK                                                 | Test de comprensión de riesgos antes de invertir. 4 días para arrepentirse después del cierre. Aviso de riesgo estandarizado por la FCA.                                                       |
| Cocos Capital              | ALyC/banco, app retail                                          | Pestañas Inicio / Mercado / Actividad / Portfolio. Panel de mercado (Merval, riesgo país, dólar). Rendimiento TWR en USD o ARS.                                                                |
| InvertirOnline             | ALyC                                                            | "Test del inversor" de 8 preguntas → perfil + cartera sugerida. Guía de primera inversión en 4 pasos. Registros CNV en el footer.                                                              |
| Balanz                     | ALyC                                                            | Apertura 100% online con DNI + selfie. Test de perfil de 7 preguntas. "No hay monto mínimo". Pide documentación de ingresos según el monto (KYC escalonado).                                   |
| Bull Market                | ALyC                                                            | Landing modelo: chips en el hero ("Sin montos mínimos"), N° ALyC visible, 4 pasos, aranceles claros. Tenencia con G/P en % y $.                                                                |
| Lemon                      | PSAV cripto                                                     | Números de escala (+4M usuarios). Avisos cortos en voseo ("la tasa varía con el mercado y no está garantizada"). N° PSAV de la CNV. Validación "hasta 72 hs hábiles".                          |

## 2. Arquitectura de información recomendada

### a) Landing

1. **Hero**: promesa, dos CTA ("Invertir" / "Tokenizar mi empresa"), chips ("Regulado CNV", "USDC sobre Stellar") y un numeral grande.
2. **Franja de prueba**: 4 numerales livianos (financiado, inversores, licitaciones cerradas, renta pagada).
3. **Licitaciones abiertas**: 3 cards con progreso. Producto antes que explicación.
4. **Cómo funciona**: 4 pasos para el inversor, con un toggle para ver la versión del emisor.
5. **Productos**: Licitaciones RWA, Merval tokenizado, Mercado secundario, Renta y dividendos. Cada card lleva un dato vivo.
6. **Regulación y custodia**: régimen de tokenización CNV (RG 1069/2025), fideicomiso y fiduciaria, Caja de Valores, contratos auditados. Un bloque "¿Qué pasa si…?" y un link a /transparencia.
7. **Banda para emisores**: casos y "de la idea a la licitación".
8. **Seguridad**: 2FA, wallet propia (Freighter) o custodia, auditorías.
9. **Ecosistema**: Stellar, USDC, Freighter, fiduciaria.
10. **FAQ**: 6 a 8 preguntas.
11. **CTA final y footer**: registros y aviso de riesgo.

### b) Navegación de la app (5 pestañas)

| Pestaña          | Contenido                                                           |
| ---------------- | ------------------------------------------------------------------- |
| **Inicio**       | Dashboard, pendientes, novedades                                    |
| **Licitaciones** | Abiertas, próximas, cerradas, filtros (agro, pyme, deuda, acciones) |
| **Mercado**      | Pills: Secundario (order book) · Merval · Derivados                 |
| **Portfolio**    | Tenencias, renta/dividendos, órdenes, movimientos                   |
| **Cuenta**       | Wallet, verificación, seguridad, documentos e impuestos             |

Hoy Merval, Orderbook, Forwards y Warrants están sueltas: agruparlas en Mercado. La consola admin va aparte (switch "Consola" según rol). En mobile, barra inferior; notificaciones en el header.

### c) Dashboard del inversor

1. **Saludo y estado del día**: "Buen día, María" + "Día 12 de 30 de la licitación Olivos Agro · 2 pendientes".
2. **Card principal**: valor total en numeral grande, variación, pills de período (1S, 1M, 3M, 1A, Todo) y toggle USD/ARS.
3. **Panel lateral en gradiente**: rendimiento TWR, renta cobrada en el año, próximo pago (fecha + monto), USDC disponible y estado de verificación.
4. **Barras densas**: renta mensual de los últimos 12 meses (cobrada vs. proyectada).
5. **Pendientes (checklist)**: verificar email, crear wallet, trustline USDC, KYC, perfil de inversor, reclamar tokens, reembolso disponible. Cada ítem tiene una flecha que lleva a la acción.
6. **Mis licitaciones en curso**: progreso, días restantes y estado.
7. **Asignación**: barra apilada por tipo (deuda RWA, acciones RWA, Merval, USDC) y por sector.
8. **Tenencias**: tabla con activo, cantidad, precio promedio, valor, G/P % y $, y una flecha para operar.
9. **Actividad reciente**: últimos 5 movimientos.

### d) Ficha de licitación

1. Encabezado: emisor, instrumento, chips de estado, sector y "Regulada CNV".
2. **Caja de inversión fija a la derecha**: recaudado, barra con marcas de mínimo y tope, % alcanzado, inversores, cuenta regresiva, mínimo por inversor, precio por token, rendimiento esperado. Monto en USDC → tokens. Requisitos pendientes. Botón "Suscribir".
3. Por qué invertir (3 a 5 puntos).
4. Términos: instrumento, plazo, renta, calendario de pagos, fiduciaria, CNV/ISIN, contrato Soroban.
5. El activo o negocio, con métricas operativas (hectáreas, rinde, ventas).
6. Uso de fondos (barra apilada).
7. Cronograma: apertura → cierre → emisión → primer pago.
8. Riesgos: resumen visible y detalle desplegable.
9. Documentos con fecha y hash.
10. Novedades del emisor.
11. Preguntas y respuestas.
12. Transparencia on-chain: contrato, holders, transacciones.
13. Licitaciones similares.

### e) Onboarding y KYC

Navegación libre; el KYC se pide recién al suscribir u operar (como Ondo y Centrifuge).

1. **Creá tu cuenta**: email o Google, y verificación del email.
2. **Elegí tu wallet**: "Wallet Fractachain (recomendada)" o "Conectar Freighter". Luego, trustline USDC explicada en una línea.
3. **Tus datos**: DNI, CUIT, domicilio, PEP, origen de fondos.
4. **Validá tu identidad**: DNI frente y dorso + selfie. Tip: "Buscá un lugar bien iluminado".
5. **Tu perfil de inversor**: 7 u 8 preguntas → Conservador, Moderado o Agresivo, más 3 preguntas de comprensión de riesgos.
6. **Revisión**: si te aprueban, tu wallet queda habilitada. Mientras tanto se puede firmar la adhesión, como en Centrifuge.

| Estado            | Chip    | Copy                                                             | CTA               |
| ----------------- | ------- | ---------------------------------------------------------------- | ----------------- |
| No iniciado       | gris    | "Verificá tu identidad para invertir"                            | Empezar           |
| En curso          | celeste | "Te faltan 2 pasos"                                              | Continuar         |
| En revisión       | ámbar   | "Estamos revisando tus datos. Suele tardar hasta 72 hs hábiles." | —                 |
| Requiere cambios* | durazno | "Necesitamos una foto más nítida del dorso del DNI"              | Corregir          |
| Aprobado          | verde   | "Listo, ya podés invertir"                                       | Ver licitaciones  |
| Rechazado         | rojo    | "No pudimos aprobar tu cuenta" + motivo                          | Contactar soporte |

*Extra tomado de Securitize; sumar también "Vencido" (reverificación periódica).

### f) Consola de emisor y admin

- **Resumen**: KPIs (en suscripción, KYC en cola, próximos pagos) y alertas.
- **Emisiones**: pipeline en columnas (Borrador → Revisión legal → Aprobada → Desplegada → Abierta → Cerrada/No alcanzó el mínimo → Pagando renta), con detalle por emisión.
- **Verificaciones**: cola con SLA, filtros por estado, visor de documentos y aprobar/rechazar con motivos predefinidos.
- **Pagos**: calendario de renta, snapshot de holders, ejecución y comprobantes.
- **Auditoría**: log inmutable con filtros, hash de tx y exportación CSV.
- **Vista emisor**: suscripción en vivo, inversores, publicar novedades, responder preguntas, cargar documentos.

## 3. Contenido y microcopy

**Landing**

- H1: "Invertí en la economía real argentina" / "Campos, pymes y acciones del Merval tokenizados bajo el régimen CNV. Suscribís en USDC y negociás en el mercado secundario."
- Emisores: "Tu empresa, a mercado sin cotizar en bolsa."
- Pasos: "Creá tu cuenta · Validá tu identidad · Suscribí en USDC · Cobrá tu renta".
- Garantía: "Si la licitación no llega al mínimo, recuperás el 100% de tus USDC."

**Dashboard**

- "Buen día, María" / "Tenés 2 pendientes y una licitación que cierra en 3 días."
- "Próximo pago · 15 nov · US$ 42,10"

**Chips de licitación** (reemplazan "Failed", "finalize()" y "refund()" en la UI)

- Próximamente · Abierta · Cierra pronto · Mínimo alcanzado · Tope completo · Cerrada · No alcanzó el mínimo · Reembolso disponible · Pagando renta · Vencida

**Chips de órdenes y transacciones**

- Pendiente · Parcial · Ejecutada · Cancelada · Firmando… · Confirmada en Stellar

**Avisos de riesgo**

- Corto: "Invertir implica riesgos. Podés perder parte o todo lo invertido."
- Largo: "Los rendimientos estimados o pasados no garantizan rendimientos futuros. La liquidez del mercado secundario no está garantizada: puede que no encuentres comprador al precio esperado. Los activos se liquidan en USDC; su valor en pesos varía con el tipo de cambio. Leé el prospecto antes de invertir."
- Antes de suscribir: checkbox "Leí los riesgos y el prospecto de esta licitación."

**Estados vacíos**

- Portfolio: "Todavía no tenés inversiones. Mirá las licitaciones abiertas y empezá desde US$ 10."
- Renta: "Cuando tus activos paguen renta, la vas a ver acá."
- Órdenes: "No tenés órdenes abiertas."
- Preguntas: "Nadie preguntó todavía. Sé el primero."
- Cola KYC (admin): "Nada pendiente. Bandeja al día."

**Errores**

- "No pudimos firmar en Freighter. Revisá que esté desbloqueada y en la red correcta."
- "Te falta la trustline de USDC para recibir fondos. Crearla reserva 0,5 XLM de tu saldo."

## 4. Ideas de implementación

**Componentes reutilizables**

- StatusChip (ícono + texto).
- SegmentedPills (role="tablist" o "radiogroup").
- StatNumeral (`tabular-nums` + delta).
- ArrowCard.
- GradientStatPanel.
- CapProgress: barra con marcadores de mínimo y tope.
- Countdown.
- ChecklistCard.
- OfferingCard.
- InvestBox: input USDC↔tokens con validaciones.
- TermsTable.
- DocumentList (fecha + hash).
- Timeline.
- RiskCallout.
- EmptyState (ilustración + CTA).
- KycStepper.
- TxStatus: pendiente/confirmada, con link a Stellar Expert.
- ResponsiveTable (cards en mobile).

**Gráficos**

- Barras densas con gradiente: renta mensual (cobrada vs. proyectada) y aportes diarios a una licitación (curva de suscripción con línea de mínimo).
- Área de valor del portfolio con pills de período.
- Barra apilada horizontal de asignación (mejor que una torta).
- Profundidad del order book y velas (ya existe `PriceCandles`).
- Admin: embudo de onboarding (registro → wallet → KYC → primera inversión), SLA de KYC y emisiones por etapa.
- Todos con CSV descargable.

**Accesibilidad**

- Texto oscuro sobre los pasteles, contraste ≥ 4.5:1. Nunca texto blanco sobre durazno.
- El estado no depende solo del color.
- Cada gráfico lleva un resumen para lector de pantalla y una tabla alternativa.
- `aria-live="polite"` para el estado de tx (la cuenta regresiva no debe anunciar cada segundo).
- Foco visible y `prefers-reduced-motion`.
- `lang` dinámico es/en y formato es-AR ("US$ 1.234,56").

**Responsive**

- Panel de gradiente → tira horizontal bajo el saludo.
- Caja de inversión → barra fija abajo ("Suscribir · US$ 10 mín.") que abre un bottom sheet.
- Barra de 5 pestañas abajo.
- Las barras pasan de 12 a 6 meses.
- Márgenes laterales de 16px.

## 5. Fuentes

- https://ondo.finance
- https://ondo.finance/ondo-stocks
- https://docs.ondo.finance/ondo-global-markets/onboarding-and-kyc
- https://securitize.io/invest
- https://sec-connect-api-docs.securitize.io/
- https://intercom.help/opulous/en/articles/7437744-how-to-complete-securitize-kyc
- https://docs.centrifuge.io/user/investor/
- https://gov.centrifuge.io/t/the-new-pool-details-view/4189
- https://medium.com/centrifuge/a-dive-into-tinlakes-new-investor-onboarding-flow-838ad22cd71c
- https://realt.co
- https://xstocks.com
- https://superstate.com
- https://stellar.org/case-studies/franklin-templeton
- https://maple.finance
- https://www.matrixdock.com
- https://republic.com/companies
- https://europe.republic.com/invest/raising-now
- https://wefunder.com/levels
- https://help.crowdcube.com/hc/en-us/articles/9005279352732-How-to-invest-with-Crowdcube
- https://help.crowdcube.com/hc/en-us/articles/7981558941084-What-happens-after-my-pitch-funds
- https://www.fca.org.uk/publication/policy/ps22-10.pdf
- https://www.awaketrader.com/educacion/cocos-capital-review
- https://www.invertironline.com/nivel-inicial
- https://www.invertironline.com/user/test-del-inversor
- https://balanz.com/abrir-cuenta/
- https://bullmarket.com.ar/
- https://help.bullmarketbrokers.com/empezar/apertura-de-cuenta/
- https://help.bullmarketbrokers.com/plataforma/consultar-tenencia/
- https://www.lemon.me
- https://help.lemon.me/es/articles/5007935-como-creo-mi-cuenta
- https://www.boletinoficial.gob.ar/detalleAviso/primera/326947/20250613
- https://www.argentina.gob.ar/noticias/ampliacion-del-regimen-de-tokenizacion-para-valores-negociables-con-cotizacion
