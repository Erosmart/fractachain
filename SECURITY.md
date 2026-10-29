# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público. Escribí a los mantenedores del repositorio
(Erosmart / Fractachain) con:

- descripción y componente afectado (`apps/api`, `apps/web`, `contracts/…`),
- pasos para reproducir o prueba de concepto,
- impacto estimado.

Respondemos dentro de los 5 días hábiles. Este proyecto opera en **Stellar
testnet**: no hay fondos reales en juego, pero tratamos igual cualquier
problema que permita suplantar usuarios, saltear el KYC o mover activos.

## Revisiones

- [Revisión de seguridad — octubre 2026](docs/security/security-review-2026-10.md)
  (API, web, contratos, despliegue).
- [Auditoría de rendimiento — septiembre 2026](docs/AUDIT-2026-09.md).

## Reglas para contribuir

- **Secretos:** nunca en git ni en imágenes Docker. `apps/api/.env` y
  `agents_secrets.json` están en `.gitignore`/`.dockerignore`. En producción el
  API no arranca sin `AUTH_SECRET` y `WALLET_PEPPER` propios.
- **Entrada:** todo body pasa por un esquema zod (`apps/api/src/http/schemas`).
- **Autorización:** declarada por ruta (`requireAuth` / `requireAdmin`); los
  servicios vuelven a chequear la propiedad de cada recurso.
- **Transacciones firmadas por usuarios:** sólo se reenvían si
  `SignedTransactionPolicy` confirma origen y operaciones; los montos se leen
  de la cadena, nunca del request.
- **Dependencias:** CI corre `npm audit --omit=dev --audit-level=high`.
