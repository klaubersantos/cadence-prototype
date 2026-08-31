import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cadence — Music Lesson Studio Billing',
  description: 'Music lesson studio billing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
