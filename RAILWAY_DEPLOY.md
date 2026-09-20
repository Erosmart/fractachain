# Guía de Despliegue en Railway - Fractachain

Fractachain está diseñado para desplegarse fácilmente en **Railway** como dos servicios independientes (o mediante Dockerfiles incluidos) desde el mismo repositorio:

---

## 1. Servicio Backend (API Express + TypeScript)

- **Root Directory**: `backend`
- **Build Command**: `npm run build`
- **Start Command**: `npm start` (ejecuta `node dist/server.js`)
- **Variables de Entorno (Environment Variables)**:
  - `PORT`: Asignado automáticamente por Railway (default: `4000` si corre local).
  - `MOCK_MODE`: `true` (mantiene los oráculos y métodos de pago hardcodeados/mockeados como fue solicitado).
  - `STELLAR_NETWORK`: `testnet`
  - `STELLAR_RPC_URL`: `https://soroban-testnet.stellar.org`

---

## 2. Servicio Frontend (Next.js 14 App Router)

- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Start Command**: `npm start` (ejecuta `next start -p ${PORT:-3000}`)
- **Variables de Entorno (Environment Variables)**:
  - `PORT`: Asignado automáticamente por Railway (default: `3000`).
  - `NEXT_PUBLIC_API_URL`: URL pública generada para el servicio Backend de Railway (ej: `https://fractachain-backend.up.railway.app`).
  - `NEXT_PUBLIC_FIREBASE_API_KEY`: API Key de tu app web en Firebase Console (Opcional, incluye Sandbox fallback).
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Dominio de Auth (ej: `fractachain-rwa.firebaseapp.com`).
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: ID del proyecto Firebase (ej: `fractachain-rwa`).
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Bucket de Storage.
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: ID del sender.
  - `NEXT_PUBLIC_FIREBASE_APP_ID`: ID de la App Web en Firebase.

---

## 3. Despliegue con Docker (Opcional)

Tanto `backend/Dockerfile` como `frontend/Dockerfile` están preconfigurados con compilación multi-etapa (`node:20-alpine`) y empaquetado optimizado (`standalone` para Next.js). Railway detectará automáticamente el Dockerfile si seleccionas la opción de despliegue por contenedor.

---

## 4. Estado de los Smart Contracts en Soroban (WASM)

Los 4 smart contracts están compilados a WebAssembly y listos en la carpeta `contracts/target/wasm32v1-none/release/`:
1. `fractachain_licitacion.wasm` (Licitaciones, KYC whitelist, OPA >50%, Squeeze-out >95%, CLOB doble-KYC)
2. `forward_contract.wasm` (Forwards Art. 1131 CCyC con 20% penalidad rescisión y rollover +10% kg)
3. `warrant_vault.wasm` (Warrants Ley 9643 con 50-60% LTV y oráculo PoGR)
4. `stock_vault.wasm` (Acciones Merval tYPF, tGGAL, tPAMP con custodia 1:1 Caja de Valores y dividendos USDC)

> **Importante:** Siguiendo tus órdenes estrictas, **NO se ha realizado ningún despliegue a testnet todavía**. Los contratos permanecen en sus archivos `.wasm` locales hasta que des la indicación explícita de desplegarlos.
