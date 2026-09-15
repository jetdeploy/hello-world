import "./globals.css";

export const metadata = {
  title: "Hello from Next.js on JetDeploy",
  description: "Next.js App Router example for JetDeploy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
