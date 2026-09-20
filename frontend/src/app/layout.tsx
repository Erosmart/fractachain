import type { Metadata } from 'next';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CrystalBackdrop from '../components/CrystalBackdrop';
import AppProviders from '../components/AppProviders';
import AppGate from '../components/AppGate';

export const metadata: Metadata = {
  title: 'Fractachain | RWA y Merval en Stellar',
  description:
    'Financiamiento productivo argentino y acciones tokenizadas sobre Stellar / Soroban.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,opsz,wght@1,8..60,700;1,8..60,800&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('fc_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="relative min-h-screen bg-white text-black flex flex-col font-body selection:bg-leaf-200 selection:text-black">
        <AppProviders>
          <CrystalBackdrop />
          <Navbar />
          <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-8 sm:pb-10">
            <AppGate>{children}</AppGate>
          </main>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
