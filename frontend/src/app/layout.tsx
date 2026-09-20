import type { Metadata } from 'next';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CrystalBackdrop from '../components/CrystalBackdrop';
import { AuthProvider } from '../context/AuthContext';
import AppGate from '../components/AppGate';

export const metadata: Metadata = {
  title: 'Fractachain | RWA y Merval en Stellar',
  description:
    'Financiamiento productivo argentino y acciones tokenizadas sobre Stellar / Soroban.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,600;1,8..60,700;1,8..60,800&family=Share+Tech+Mono&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="relative min-h-screen bg-white text-black flex flex-col font-body selection:bg-leaf-200 selection:text-black">
        <CrystalBackdrop />
        <AuthProvider>
          <Navbar />
          <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-8 sm:pb-10">
            <AppGate>{children}</AppGate>
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
