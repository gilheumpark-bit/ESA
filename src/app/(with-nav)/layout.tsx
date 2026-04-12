import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageErrorBoundary } from '@/components/ErrorBoundary';

export default function WithNavLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" className="min-h-[calc(100vh-8rem)]">
        <PageErrorBoundary>{children}</PageErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
