import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Poisoned Delta',
  description: 'Inside-style Niger Delta 3D world',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
