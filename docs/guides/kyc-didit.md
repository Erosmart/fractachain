# KYC con Didit

Fractachain verifica la identidad de los inversores con
[Didit](https://didit.me): documento, prueba de vida, coincidencia facial y
screening AML ocurren en el flujo alojado de Didit; la plataforma sólo guarda
la decisión y un resumen mínimo.

Sin claves de Didit la app sigue funcionando con el formulario propio (selfie +
revisión manual de compliance).

## 1. Configurar Didit

1. Crear la cuenta en [business.didit.me](https://business.didit.me).
2. **Workflows → nuevo workflow de KYC** con: ID Verification, Liveness, Face
   Match y AML. Copiar el **workflow ID**.
3. **API & Webhooks**: copiar la **API key** y el **webhook secret**, y cargar
   la URL del webhook: `https://<tu-app>/api/kyc/didit/webhook`.

## 2. Variables de entorno

```bash
DIDIT_API_KEY=...
DIDIT_WORKFLOW_ID=...
DIDIT_WEBHOOK_SECRET=...
# DIDIT_API_URL=https://verification.didit.me   (default)
APP_URL=https://<tu-app>       # Didit vuelve a {APP_URL}/onboarding/kyc/callback
```

Con `DIDIT_API_KEY` y `DIDIT_WORKFLOW_ID` el KYC pasa a Didit: no se pide
selfie propia y no hay auto-aprobación (aunque `HACKATHON_DEMO` esté activo).

## 3. Flujo

```
Inversor ─ datos (nombre, CUIT) ─▶ POST /api/kyc/onboard
        ─ "Verificar identidad" ─▶ POST /api/kyc/verification ─▶ Didit crea la sesión
        ◀──────────── redirect a verify.didit.me ────────────┘
        ─ completa el flujo en Didit
        ◀─ Didit redirige a /onboarding/kyc/callback
        ─ POST /api/kyc/verification/sync ─▶ el API pide la decisión a Didit
Didit ─ webhook firmado ─▶ POST /api/kyc/didit/webhook ─▶ el API re-lee la decisión
```

- El estado que trae la URL del callback **no se usa**: la decisión siempre se
  pide a Didit con la API key.
- Los webhooks se validan (timestamp ±5 min + HMAC `X-Signature-V2` o
  `X-Signature`), se deduplican por `event_id` y, aun firmados, el estado se
  vuelve a leer de Didit (entregas fuera de orden no retroceden una cuenta).
- En local (sin webhooks que lleguen a `localhost`) alcanza con el `sync` al
  volver del flujo.

## 4. Estados

| Didit | Cuenta | Qué ve el inversor |
|---|---|---|
| Not Started · In Progress | `PENDING` | Continuar (mismo link) |
| Awaiting User · Resubmitted | `PENDING` | Corregir (mismo link) |
| In Review | `PENDING` | En revisión (hasta 72 hs hábiles) |
| Approved | `APPROVED` | Listo: autorización on-chain + whitelist en licitaciones vivas |
| Declined | `REJECTED` (o `REVOKED` si ya estaba aprobado) | Reintentar con una sesión nueva |
| Abandoned · Expired | `PENDING` | Empezar de nuevo |
| Kyc Expired | `REVOKED` | Re-verificar |

Compliance ve en **Consola → Verificaciones** el estado de Didit, cada chequeo
(documento, vida, rostro, AML con cantidad de coincidencias) y el nombre y país
del documento. Puede aprobar, rechazar o revocar manualmente como siempre.

## 5. Probar

- Tests sin red: `npm test -w @fractachain/api` (`test/http/didit-kyc.test.ts`
  usa un proveedor falso y webhooks firmados).
- Sandbox de Didit: usar un workflow de prueba y las claves de sandbox.
