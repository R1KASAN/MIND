import "./globals.css";

export const metadata = {
  title: "MIND | คลี่ความคิดให้เหลือก้าวแรก",
  description: "เครื่องมือช่วยเทความคิดออกมา แล้วสรุปให้เหลือก้าวแรกที่ทำได้จริง",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body suppressHydrationWarning>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
